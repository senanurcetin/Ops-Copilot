const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const positive = n => Number.isSafeInteger(n) && n > 0;
const CONCLUSION = /^[a-z][a-z_]{0,31}$/;

/**
 * Read one completed workflow run from the GitHub REST API with a
 * repository-scoped, Actions:read installation token.
 *
 * Never make a write request, follow redirects with credentials, log tokens,
 * or return raw API payloads. The caller supplies the short-lived token.
 */
export async function inspectAuthorizedWorkflowRun({
  work, token, fetchImpl = fetch, timeoutMs = 15000,
}) {
  if (!work || work.event !== 'workflow_run' || work.action !== 'completed' ||
      !positive(work.installationId) || !positive(work.repositoryId) ||
      !positive(work.workflowRunId) || typeof work.repository !== 'string' ||
      !REPOSITORY.test(work.repository)) {
    throw new Error('Invalid authorized workflow work item.');
  }
  if (typeof token !== 'string' || token.length < 8 ||
      typeof fetchImpl !== 'function' ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
    throw new Error('Invalid read-only GitHub consumer configuration.');
  }
  const [owner, name] = work.repository.split('/');
  const url = 'https://api.github.com/repos/' + owner + '/' + name +
    '/actions/runs/' + work.workflowRunId;

  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + token,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ops-copilot-readonly-webhook-consumer',
      },
    });
  } catch {
    throw new Error('GitHub workflow read could not be completed.');
  }
  if (!response || response.ok !== true || response.status !== 200) {
    throw new Error('GitHub workflow read failed.');
  }
  let run;
  try { run = await response.json(); }
  catch { throw new Error('GitHub workflow read returned invalid JSON.'); }
  if (!run || run.id !== work.workflowRunId ||
      run.status !== 'completed' ||
      !run.repository || run.repository.id !== work.repositoryId ||
      run.repository.full_name !== work.repository ||
      typeof run.conclusion !== 'string' ||
      !CONCLUSION.test(run.conclusion)) {
    throw new Error('GitHub workflow run scope or state is invalid.');
  }
  return Object.freeze({
    repository: work.repository,
    repositoryId: work.repositoryId,
    workflowRunId: work.workflowRunId,
    status: 'completed',
    conclusion: run.conclusion,
  });
}

/**
 * Explicit, single-delivery read-only consumer. No poller or event loop.
 * The injected worker owns Firestore claim/fail/complete transactions.
 * A provider returns a fresh, appropriately scoped installation token.
 */
export function createReadOnlyWebhookConsumer({
  worker, getToken, inspectImpl = inspectAuthorizedWorkflowRun,
  fetchImpl = fetch, timeoutMs = 15000,
}) {
  if (!worker || typeof worker.claim !== 'function' ||
      typeof worker.complete !== 'function' ||
      typeof worker.fail !== 'function' ||
      typeof getToken !== 'function' || typeof inspectImpl !== 'function' ||
      typeof fetchImpl !== 'function' ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
    throw new Error('Invalid GitHub read-only consumer configuration.');
  }

  return async function processOne(deliveryId, workerId) {
    // No API calls and no token retrieval unless the worker owns a lease.
    const claim = await worker.claim(deliveryId, workerId);
    if (claim === null) return { status: 'not_claimed' };
    if (!claim || claim.deliveryId !== deliveryId ||
        typeof claim.leaseToken !== 'string') {
      throw new Error('Invalid claimed webhook delivery.');
    }

    let inspection;
    try {
      const token = await getToken();
      inspection = await inspectImpl({ work: claim, token, fetchImpl, timeoutMs });
    } catch {
      let result;
      try { result = await worker.fail(deliveryId, workerId, claim.leaseToken); }
      catch { throw new Error('Webhook read failure could not be persisted.'); }
      if (!result || !['retry_scheduled', 'dead', 'stale'].includes(result.status)) {
        throw new Error('Invalid webhook failure state.');
      }
      // Never return the upstream error, token, payload or GitHub response.
      return { status: result.status };
    }

    let completed;
    try { completed = await worker.complete(deliveryId, workerId, claim.leaseToken); }
    catch { throw new Error('Webhook completion could not be persisted.'); }
    if (completed !== true) return { status: 'lease_lost' };
    return Object.freeze({
      status: 'completed', repository: inspection.repository,
      workflowRunId: inspection.workflowRunId,
      conclusion: inspection.conclusion,
    });
  };
}
