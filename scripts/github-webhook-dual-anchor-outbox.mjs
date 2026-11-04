const DELIVERY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const positive = n => Number.isSafeInteger(n) && n > 0;

/**
 * OPTIONAL alternate server-only outbox adapter.
 *
 * One Firestore transaction creates an immutable per-GUID deduplication
 * anchor and its queued outbox document. An existing anchor OR a legacy
 * outbox document prevents a second enqueue. A synthetic/obsolete outbox
 * document may be removed independently in tests without losing the anchor.
 *
 * Do not replace the live outbox adapter or activate TTL from this module.
 * Existing legacy GUIDs require independently approved, complete backfill
 * before any old outbox document could safely be deleted. No SDK initialization,
 * credentials, network access or service startup happens on import.
 */
export function createDualAnchorWebhookOutbox(firestore, {nowMs = Date.now} = {}) {
  if (!firestore || typeof firestore.collection !== 'function' ||
      typeof firestore.runTransaction !== 'function' || typeof nowMs !== 'function') {
    throw new Error('Invalid dual-anchor webhook outbox configuration.');
  }
  const anchors = firestore.collection('githubWebhookDedupAnchors');
  const outbox = firestore.collection('githubWebhookOutbox');
  if (!anchors || typeof anchors.doc !== 'function' ||
      !outbox || typeof outbox.doc !== 'function') {
    throw new Error('Invalid dual-anchor webhook outbox collections.');
  }

  return async function enqueueOnce(work) {
    if (!work || typeof work !== 'object' ||
        typeof work.deliveryId !== 'string' ||
        !DELIVERY_ID.test(work.deliveryId) ||
        work.event !== 'workflow_run' || work.action !== 'completed' ||
        !positive(work.installationId) || !positive(work.repositoryId) ||
        !positive(work.workflowRunId) ||
        typeof work.repository !== 'string' || !REPOSITORY.test(work.repository) ||
        work.repository.split('/').some(part => part === '.' || part === '..')) {
      // Mixed-case GUIDs are intentionally rejected, not case-normalized:
      // historical document IDs may be case-sensitive in Firestore.
      throw new Error('Invalid dual-anchor webhook work item.');
    }
    const anchorRef = anchors.doc(work.deliveryId);
    const outboxRef = outbox.doc(work.deliveryId);
    try {
      return await firestore.runTransaction(async transaction => {
        // Read both before any writes, per Firestore transaction constraints.
        const existingAnchor = await transaction.get(anchorRef);
        const existingWork = await transaction.get(outboxRef);
        if (existingAnchor.exists || existingWork.exists) return false;
        const now = nowMs();
        if (!positive(now)) throw new Error('Invalid dual-anchor transaction clock.');
        // The anchor document's ID is the GUID. Store NO event payload,
        // repository metadata, tokens, expiry timestamp or TTL field here.
        transaction.create(anchorRef, {
          kind: 'github_workflow_delivery',
          recordedAtMs: now,
        });
        transaction.create(outboxRef, {
          deliveryId: work.deliveryId,
          event: work.event,
          action: work.action,
          installationId: work.installationId,
          repositoryId: work.repositoryId,
          repository: work.repository,
          workflowRunId: work.workflowRunId,
          state: 'queued',
          attempts: 0,
          enqueuedAtMs: now,
        });
        return true;
      });
    } catch {
      // Never leak driver endpoint, document contents or credentials.
      throw new Error('Dual-anchor webhook persistence failed.');
    }
  };
}
