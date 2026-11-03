/**
 * Optional server-only Firestore outbox adapter. No Firebase SDK import, app
 * initialization, credentials, network calls or service activation occurs here.
 * The consumer injects an already-authorized Admin Firestore client.
 *
 * Each delivery GUID is the document ID. A Firestore transaction atomically
 * checks existence and creates the queued work document; duplicate redeliveries
 * do not enqueue additional work even across processes. This module does NOT
 * process the queue or guarantee that a downstream side effect runs once.
 */
export function createFirestoreWebhookOutbox(firestore) {
  if (!firestore || typeof firestore.collection !== 'function' ||
      typeof firestore.runTransaction !== 'function') {
    throw new Error('A server-side Firestore transaction client is required.');
  }
  const collection = firestore.collection('githubWebhookOutbox');
  if (!collection || typeof collection.doc !== 'function') {
    throw new Error('A Firestore webhook outbox collection is required.');
  }

  return async function enqueueOnce(work) {
    if (!work || typeof work !== 'object' ||
        typeof work.deliveryId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(work.deliveryId) ||
        work.event !== 'workflow_run' || work.action !== 'completed' ||
        !Number.isSafeInteger(work.installationId) || work.installationId <= 0 ||
        !Number.isSafeInteger(work.repositoryId) || work.repositoryId <= 0 ||
        !Number.isSafeInteger(work.workflowRunId) || work.workflowRunId <= 0 ||
        typeof work.repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(work.repository)) {
      throw new Error('Invalid GitHub webhook outbox work item.');
    }

    const ref = collection.doc(work.deliveryId);
    return firestore.runTransaction(async transaction => {
      const existing = await transaction.get(ref);
      if (existing.exists) return false;
      transaction.create(ref, {
        deliveryId: work.deliveryId,
        event: work.event,
        action: work.action,
        installationId: work.installationId,
        repositoryId: work.repositoryId,
        repository: work.repository,
        workflowRunId: work.workflowRunId,
        state: 'queued',
        attempts: 0,
        enqueuedAtMs: Date.now(),
      });
      return true;
    });
  };
}
