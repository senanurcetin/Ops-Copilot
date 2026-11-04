const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPERATOR = /^[A-Za-z0-9_-]{3,64}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const positive = x => Number.isSafeInteger(x) && x > 0;
const nonnegative = x => Number.isSafeInteger(x) && x >= 0;
const DAY_MS = 86400000;

/**
 * Explicit, authorization-gated in-place compaction of completed delivery
 * documents. It NEVER deletes a GUID document or configures Firestore TTL.
 *
 * A same-path minimal completed record is a permanent deduplication anchor:
 * createFirestoreWebhookOutbox() will continue to recognize its existence.
 * Authentication and owner approval are the caller's responsibilities.
 */
export function createWebhookOutboxCompactor(firestore, {
  authorizeCompaction, nowMs = Date.now, minAgeMs = 7 * DAY_MS,
} = {}) {
  if (!firestore || typeof firestore.collection !== 'function' ||
      typeof firestore.runTransaction !== 'function' ||
      typeof authorizeCompaction !== 'function' || typeof nowMs !== 'function' ||
      !positive(minAgeMs) || minAgeMs < DAY_MS || minAgeMs > 365 * DAY_MS) {
    throw new Error('Invalid webhook outbox compaction configuration.');
  }
  const collection = firestore.collection('githubWebhookOutbox');
  if (!collection || typeof collection.doc !== 'function') {
    throw new Error('Invalid webhook outbox collection.');
  }

  return async function compactCompleted({
    deliveryId, operatorId, expectedCompletedAtMs,
  } = {}) {
    if (typeof deliveryId !== 'string' || !GUID.test(deliveryId) ||
        typeof operatorId !== 'string' || !OPERATOR.test(operatorId) ||
        !positive(expectedCompletedAtMs)) {
      throw new Error('Invalid webhook outbox compaction request.');
    }
    let approved;
    try {
      approved = await authorizeCompaction(Object.freeze({
        deliveryId, operatorId, expectedCompletedAtMs,
      }));
    } catch {
      throw new Error('Webhook compaction authorization failed.');
    }
    if (approved !== true) throw new Error('Webhook compaction is not authorized.');

    try {
      return await firestore.runTransaction(async transaction => {
        const ref = collection.doc(deliveryId);
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) return { status: 'not_found' };
        const record = snapshot.data();
        if (!record || record.deliveryId !== deliveryId ||
            record.event !== 'workflow_run' || record.action !== 'completed' ||
            !positive(record.installationId) || !positive(record.repositoryId) ||
            !positive(record.workflowRunId) ||
            typeof record.repository !== 'string' || !REPO.test(record.repository) ||
            !nonnegative(record.attempts) || !positive(record.enqueuedAtMs)) {
          throw new Error('Corrupt webhook work item.');
        }
        if (record.state !== 'completed') return { status: 'not_completed' };
        if (record.completedAtMs !== expectedCompletedAtMs) return { status: 'stale' };
        if (record.retentionClass === 'dedup_anchor_v1') {
          return { status: 'already_compacted' };
        }
        if (record.retentionClass !== undefined) {
          throw new Error('Unsupported retention policy.');
        }
        if (record.leaseOwner != null || record.leaseToken != null ||
            record.leaseUntilMs !== 0) {
          throw new Error('Completed webhook record has a lease.');
        }
        const now = nowMs();
        if (!positive(now) || expectedCompletedAtMs > now) {
          throw new Error('Invalid retention clock.');
        }
        if (now - expectedCompletedAtMs < minAgeMs) {
          return { status: 'too_recent' };
        }
        const recoveryCount = record.recoveryCount ?? 0;
        if (!nonnegative(recoveryCount)) throw new Error('Invalid recovery count.');
        // Replace the same document atomically. Never delete/TTL the document.
        // Preserve the original scope and completion audit evidence, while
        // dropping transient lease and retry fields.
        transaction.set(ref, {
          deliveryId, state: 'completed', event: record.event,
          action: record.action, installationId: record.installationId,
          repositoryId: record.repositoryId, repository: record.repository,
          workflowRunId: record.workflowRunId, attempts: record.attempts,
          enqueuedAtMs: record.enqueuedAtMs,
          completedAtMs: record.completedAtMs, recoveryCount,
          retentionClass: 'dedup_anchor_v1',
          compactedAtMs: now,
          compactedBy: operatorId,
        });
        return { status: 'compacted' };
      });
    } catch {
      throw new Error('Webhook outbox compaction transaction failed.');
    }
  };
}
