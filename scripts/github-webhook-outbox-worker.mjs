import { randomUUID } from 'node:crypto';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORKER_ID = /^[A-Za-z0-9_-]{1,64}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const positive = number => Number.isSafeInteger(number) && number > 0;
const nonnegative = number => Number.isSafeInteger(number) && number >= 0;

/**
 * Server-only transactional lifecycle for an already-enqueued GitHub delivery.
 *
 * This does not start a listener or worker, call GitHub, or process payloads.
 * The caller must supply an authorized Firestore Admin client and a separate
 * read-only, idempotent processor. Delivery IDs and lease tokens are opaque.
 */
export function createWebhookOutboxWorker(firestore, {
  nowMs = Date.now,
  leaseMs = 60000,
  maxAttempts = 5,
  baseRetryMs = 5000,
  maxRetryMs = 900000,
} = {}) {
  if (!firestore || typeof firestore.collection !== 'function' ||
      typeof firestore.runTransaction !== 'function' || typeof nowMs !== 'function' ||
      !nonnegative(leaseMs) || leaseMs < 1000 || leaseMs > 300000 ||
      !positive(maxAttempts) || maxAttempts > 10 ||
      !nonnegative(baseRetryMs) || baseRetryMs < 1000 ||
      !nonnegative(maxRetryMs) || maxRetryMs < baseRetryMs || maxRetryMs > 86400000) {
    throw new Error('Invalid webhook outbox worker configuration.');
  }
  const collection = firestore.collection('githubWebhookOutbox');
  if (!collection || typeof collection.doc !== 'function') {
    throw new Error('Invalid webhook outbox collection.');
  }
  function clock() {
    const value = nowMs();
    if (!positive(value)) throw new Error('Invalid outbox clock.');
    return value;
  }
  function document(deliveryId) {
    if (typeof deliveryId !== 'string' || !GUID.test(deliveryId)) {
      throw new Error('Invalid webhook delivery ID.');
    }
    return collection.doc(deliveryId);
  }
  function owner(workerId, leaseToken) {
    if (typeof workerId !== 'string' || !WORKER_ID.test(workerId) ||
        (leaseToken !== undefined &&
         (typeof leaseToken !== 'string' || !GUID.test(leaseToken)))) {
      throw new Error('Invalid webhook worker identity.');
    }
  }
  async function transact(callback) {
    try { return await firestore.runTransaction(callback); }
    catch { throw new Error('Webhook outbox transaction failed.'); }
  }
  function checked(record) {
    if (!record || record.event !== 'workflow_run' || record.action !== 'completed' ||
        !positive(record.installationId) || !positive(record.repositoryId) ||
        !positive(record.workflowRunId) || typeof record.repository !== 'string' ||
        !REPOSITORY.test(record.repository) || !nonnegative(record.attempts) ||
        !['queued', 'processing', 'completed', 'dead'].includes(record.state)) {
      throw new Error('Invalid stored webhook work item.');
    }
    return record;
  }
  function owned(record, workerId, leaseToken, timestamp) {
    return record?.state === 'processing' &&
      record.leaseOwner === workerId && record.leaseToken === leaseToken &&
      positive(record.leaseUntilMs) && record.leaseUntilMs > timestamp;
  }

  async function claim(deliveryId, workerId) {
    const ref = document(deliveryId);
    owner(workerId);
    return transact(async transaction => {
      const snap = await transaction.get(ref);
      if (!snap.exists) return null;
      const record = checked(snap.data());
      const now = clock();
      if (record.state === 'dead' || record.state === 'completed') return null;
      if (record.state === 'processing') {
        if (!positive(record.leaseUntilMs)) {
          throw new Error('Invalid stored lease.');
        }
        if (record.leaseUntilMs > now) return null;
      } else if (record.availableAtMs !== undefined &&
                 (!nonnegative(record.availableAtMs) || record.availableAtMs > now)) {
        if (!nonnegative(record.availableAtMs)) throw new Error('Invalid stored retry time.');
        return null;
      }
      if (record.attempts >= maxAttempts) {
        transaction.update(ref, {
          state: 'dead', deadAtMs: now, leaseOwner: null, leaseToken: null,
          leaseUntilMs: 0, failureCode: 'ATTEMPTS_EXHAUSTED',
        });
        return null;
      }
      const leaseToken = randomUUID();
      const attempts = record.attempts + 1;
      const leaseUntilMs = now + leaseMs;
      transaction.update(ref, {
        state: 'processing', attempts, leaseOwner: workerId, leaseToken,
        leaseUntilMs, claimedAtMs: now, availableAtMs: 0,
      });
      return Object.freeze({
        deliveryId, event: record.event, action: record.action,
        installationId: record.installationId, repositoryId: record.repositoryId,
        repository: record.repository, workflowRunId: record.workflowRunId,
        attempts, leaseToken, leaseUntilMs,
      });
    });
  }

  async function complete(deliveryId, workerId, leaseToken) {
    const ref = document(deliveryId);
    owner(workerId, leaseToken);
    if (leaseToken === undefined) throw new Error('A lease token is required.');
    return transact(async transaction => {
      const snap = await transaction.get(ref);
      if (!snap.exists) return false;
      const record = checked(snap.data());
      const now = clock();
      if (!owned(record, workerId, leaseToken, now)) return false;
      transaction.update(ref, {
        state: 'completed', completedAtMs: now,
        leaseOwner: null, leaseToken: null, leaseUntilMs: 0,
      });
      return true;
    });
  }

  async function fail(deliveryId, workerId, leaseToken) {
    const ref = document(deliveryId);
    owner(workerId, leaseToken);
    if (leaseToken === undefined) throw new Error('A lease token is required.');
    return transact(async transaction => {
      const snap = await transaction.get(ref);
      if (!snap.exists) return { status: 'stale' };
      const record = checked(snap.data());
      const now = clock();
      if (!owned(record, workerId, leaseToken, now)) return { status: 'stale' };
      if (record.attempts >= maxAttempts) {
        transaction.update(ref, {
          state: 'dead', deadAtMs: now, failureCode: 'ATTEMPTS_EXHAUSTED',
          leaseOwner: null, leaseToken: null, leaseUntilMs: 0,
        });
        return { status: 'dead' };
      }
      const backoffMs = Math.min(maxRetryMs, baseRetryMs * 2 ** (record.attempts - 1));
      const retryAtMs = now + backoffMs;
      transaction.update(ref, {
        state: 'queued', availableAtMs: retryAtMs,
        leaseOwner: null, leaseToken: null, leaseUntilMs: 0,
        failureCode: 'PROCESSING_FAILED', lastFailedAtMs: now,
      });
      return { status: 'retry_scheduled', retryAtMs };
    });
  }

  return Object.freeze({ claim, complete, fail });
}
