import { parseVerifiedGitHubWebhook } from './github-webhook-verify.mjs';

const REPOSITORY_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const hasPositiveSafeId = value => Number.isSafeInteger(value) && value > 0;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Validate a signed workflow completion, authorize its installation/repository,
 * and atomically enqueue at most one work item for each GitHub delivery GUID.
 *
 * The caller MUST provide enqueueOnce backed by a durable transactional
 * unique-key reservation + outbox insertion. A local Set or check-then-insert
 * implementation is not production safe. This module does not serve HTTP,
 * initiate GitHub API calls, run CI, or execute any action on a repository.
 *
 * enqueueOnce(work) must return true if it committed a NEW item, false if the
 * delivery already exists, and throw if persistence cannot be confirmed.
 */
export async function enqueueAuthorizedGitHubDelivery({
  rawBody, headers, secret, expectedInstallationId, expectedRepositoryId,
  expectedRepository, enqueueOnce, maxBytes,
}) {
  if (!hasPositiveSafeId(expectedInstallationId) ||
      !hasPositiveSafeId(expectedRepositoryId) ||
      typeof expectedRepository !== 'string' ||
      !REPOSITORY_NAME.test(expectedRepository)) {
    throw new Error('GitHub webhook authorization configuration is invalid.');
  }
  if (typeof enqueueOnce !== 'function') {
    throw new Error('An atomic durable webhook delivery queue is required.');
  }

  // Authenticate the original bytes before using any untrusted metadata.
  const { event, deliveryId, payload } = parseVerifiedGitHubWebhook({
    rawBody, headers, secret, maxBytes,
  });
  if (!isRecord(payload.installation) ||
      !isRecord(payload.repository) ||
      payload.installation.id !== expectedInstallationId ||
      payload.repository.id !== expectedRepositoryId ||
      payload.repository.full_name !== expectedRepository) {
    throw new Error('GitHub webhook installation or repository is not authorized.');
  }

  // Only this read-only audit signal is currently supported. GitHub may add
  // new actions, which must not turn into work without a deliberate allowlist.
  if (event !== 'workflow_run' || payload.action !== 'completed') {
    return { status: 'ignored', deliveryId };
  }
  const run = payload.workflow_run;
  if (!isRecord(run) || !hasPositiveSafeId(run.id) ||
      (run.repository_id !== undefined &&
       run.repository_id !== expectedRepositoryId)) {
    throw new Error('GitHub webhook workflow-run scope is invalid.');
  }

  const work = Object.freeze({
    deliveryId,
    event: 'workflow_run',
    action: 'completed',
    installationId: expectedInstallationId,
    repositoryId: expectedRepositoryId,
    repository: expectedRepository,
    workflowRunId: run.id,
  });

  let queued;
  try {
    queued = await enqueueOnce(work);
  } catch {
    // Error messages from persistence drivers can contain internal details.
    throw new Error('GitHub webhook delivery persistence failed.');
  }
  if (queued !== true && queued !== false) {
    throw new Error('GitHub webhook delivery persistence result is invalid.');
  }
  return { status: queued ? 'enqueued' : 'duplicate', deliveryId };
}
