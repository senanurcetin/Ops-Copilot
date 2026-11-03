const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const OPERATOR = /^[A-Za-z0-9_-]{3,64}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const positive = n => Number.isSafeInteger(n) && n > 0;
const nonnegative = n => Number.isSafeInteger(n) && n >= 0;
const STATES = new Set(['queued', 'processing', 'completed', 'dead']);

/**
 * DISABLED-BY-DEFAULT, ONE-GUID-AT-A-TIME legacy backfill *primitive*.
 *
 * This library never enumerates documents, opens Firebase, starts a service,
 * enables TTL, switches ingestion adapters, or deletes any work record.
 * A trusted server caller must independently enforce operator authentication
 * and explicit owner authorization. A successful call is NOT proof that a
 * collection-wide migration or ingestion cutover is complete.
 */
export function createWebhookLegacyAnchorBackfill(firestore, {
  authorizeBackfill, nowMs = Date.now,
} = {}) {
  if (!firestore || typeof firestore.collection !== 'function' ||
      typeof firestore.runTransaction !== 'function' ||
      typeof authorizeBackfill !== 'function' || typeof nowMs !== 'function') {
    throw new Error('Invalid legacy GUID backfill configuration.');
  }
  const anchors = firestore.collection('githubWebhookDedupAnchors');
  const outbox = firestore.collection('githubWebhookOutbox');
  if (!anchors || typeof anchors.doc !== 'function' ||
      !outbox || typeof outbox.doc !== 'function') {
    throw new Error('Invalid legacy GUID backfill collections.');
  }

  return async function backfillOne({
    deliveryId, operatorId, expectedEnqueuedAtMs,
  } = {}) {
    // Case-sensitive Firestore paths: do not normalize historical IDs.
    // Uppercase GUIDs are explicitly excluded from this prototype and need
    // a separately reviewed migration policy.
    if (typeof deliveryId !== 'string' || !GUID.test(deliveryId) ||
        typeof operatorId !== 'string' || !OPERATOR.test(operatorId) ||
        !positive(expectedEnqueuedAtMs)) {
      throw new Error('Invalid legacy GUID backfill request.');
    }
    let approved;
    try {
      approved = await authorizeBackfill(Object.freeze({
        deliveryId, operatorId, expectedEnqueuedAtMs,
      }));
    } catch {
      throw new Error('Legacy GUID backfill authorization failed.');
    }
    if (approved !== true) throw new Error('Legacy GUID backfill is not authorized.');

    try {
      const workRef = outbox.doc(deliveryId);
      const anchorRef = anchors.doc(deliveryId);
      return await firestore.runTransaction(async transaction => {
        // All reads before writes, including when the source disappears.
        const workSnapshot = await transaction.get(workRef);
        const anchorSnapshot = await transaction.get(anchorRef);
        if (!workSnapshot.exists) return {status: 'not_found'};
        const record = workSnapshot.data();
        if (!record || record.deliveryId !== deliveryId ||
            record.event !== 'workflow_run' || record.action !== 'completed' ||
            !positive(record.installationId) ||
            !positive(record.repositoryId) ||
            !positive(record.workflowRunId) ||
            typeof record.repository !== 'string' ||
            !REPOSITORY.test(record.repository) ||
            record.repository.split('/').some(part => part === '.' || part === '..') ||
            !STATES.has(record.state) ||
            !nonnegative(record.attempts) ||
            !positive(record.enqueuedAtMs)) {
          throw new Error('Corrupt legacy webhook work record.');
        }
        if (record.enqueuedAtMs !== expectedEnqueuedAtMs) {
          return {status: 'stale'};
        }
        if (anchorSnapshot.exists) {
          const anchor = anchorSnapshot.data();
          if (!anchor || anchor.kind !== 'github_workflow_delivery' ||
              !positive(anchor.recordedAtMs)) {
            throw new Error('Corrupt existing legacy GUID anchor.');
          }
          return {status: 'already_anchored'};
        }
        const timestamp = nowMs();
        if (!positive(timestamp)) throw new Error('Invalid backfill clock.');
        // The anchor stores NO event content, repository details, credentials,
        // delivery payload, TTL expiration field or owner identifier.
        transaction.create(anchorRef, {
          kind: 'github_workflow_delivery',
          recordedAtMs: timestamp,
        });
        return {status: 'anchored'};
      });
    } catch {
      // Do not surface driver errors, document bodies or credentials.
      throw new Error('Legacy GUID backfill transaction failed.');
    }
  };
}
