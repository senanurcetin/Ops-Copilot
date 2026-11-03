const DELIVERY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPERATOR = /^[A-Za-z0-9_-]{3,64}$/;
const positive = n => Number.isSafeInteger(n) && n > 0;
const nonnegative = n => Number.isSafeInteger(n) && n >= 0;

/**
 * Explicit, owner-approved manual recovery for a single dead-letter record.
 *
 * Must only be called from an authenticated and authorized server-side admin
 * action. authorizeRecovery must independently establish the operator's
 * permission and owner approval. No listener, scheduler or network call is
 * created by importing this module. The delivery document is NEVER deleted.
 */
export function createWebhookDeadLetterRecovery(firestore, {
  authorizeRecovery, nowMs = Date.now,
} = {}) {
  if (!firestore || typeof firestore.collection !== 'function' ||
      typeof firestore.runTransaction !== 'function' ||
      typeof authorizeRecovery !== 'function' || typeof nowMs !== 'function') {
    throw new Error('Invalid webhook dead-letter recovery configuration.');
  }
  const collection = firestore.collection('githubWebhookOutbox');
  if (!collection || typeof collection.doc !== 'function') {
    throw new Error('Invalid webhook dead-letter collection.');
  }

  return async function requeueDeadLetter({deliveryId, operatorId, expectedDeadAtMs} = {}) {
    if (typeof deliveryId !== 'string' || !DELIVERY_ID.test(deliveryId) ||
        typeof operatorId !== 'string' || !OPERATOR.test(operatorId) ||
        !positive(expectedDeadAtMs)) {
      throw new Error('Invalid dead-letter recovery request.');
    }
    let authorized;
    try {
      authorized = await authorizeRecovery(Object.freeze({
        deliveryId, operatorId, expectedDeadAtMs,
      }));
    } catch {
      throw new Error('Dead-letter recovery authorization failed.');
    }
    if (authorized !== true) throw new Error('Dead-letter recovery is not authorized.');

    try {
      const ref = collection.doc(deliveryId);
      return await firestore.runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) return {status: 'not_found'};
        const record = snapshot.data();
        if (!record || record.deliveryId !== deliveryId ||
            record.event !== 'workflow_run' || record.action !== 'completed' ||
            !positive(record.installationId) || !positive(record.repositoryId) ||
            !positive(record.workflowRunId) || !nonnegative(record.attempts)) {
          throw new Error('Corrupt webhook outbox work item.');
        }
        if (record.state !== 'dead') return {status: 'not_dead'};
        if (record.deadAtMs !== expectedDeadAtMs) return {status: 'stale'};
        const priorRecoveries = record.recoveryCount ?? 0;
        if (!nonnegative(priorRecoveries)) throw new Error('Corrupt recovery count.');
        // One manual recovery per GUID only; further rescue requires a new
        // reviewed code/policy change rather than arbitrary infinite retries.
        if (priorRecoveries >= 1) return {status: 'limit_reached'};
        if (record.leaseOwner != null || record.leaseToken != null ||
            record.leaseUntilMs !== 0) {
          throw new Error('Dead-letter record still has an active lease.');
        }
        const timestamp = nowMs();
        if (!positive(timestamp)) throw new Error('Invalid recovery clock.');
        transaction.update(ref, {
          state: 'queued', attempts: 0, availableAtMs: timestamp,
          leaseOwner: null, leaseToken: null, leaseUntilMs: 0,
          failureCode: null, deadAtMs: null,
          recoveredAtMs: timestamp, recoveredBy: operatorId,
          recoveryCount: priorRecoveries + 1,
        });
        return {status: 'requeued'};
      });
    } catch {
      throw new Error('Webhook dead-letter recovery transaction failed.');
    }
  };
}
