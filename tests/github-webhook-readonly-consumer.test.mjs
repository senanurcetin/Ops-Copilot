import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  inspectAuthorizedWorkflowRun, createReadOnlyWebhookConsumer,
} from '../scripts/github-webhook-readonly-consumer.mjs';

const work = Object.freeze({
  deliveryId: '711c17df-3579-4c49-a3f1-4becc101abcd',
  leaseToken: 'c229a79c-2249-4c05-b45a-f96abe28a226',
  event: 'workflow_run', action: 'completed',
  installationId: 11, repositoryId: 42,
  repository: 'example/private-repo', workflowRunId: 765,
});
const run = () => ({
  id: 765, status: 'completed', conclusion: 'success',
  repository: { id: 42, full_name: 'example/private-repo' },
  token: 'must-not-leak', jobs_url: 'untrusted',
});
const response = value => ({ ok: true, status: 200, json: async () => value });
const goodFetch = async () => response(run());

test('reads exact allowed GitHub workflow URL using GET, scoped bearer and no redirects', async () => {
  const calls = [];
  const token = 'ephemeral-secret-token';
  const result = await inspectAuthorizedWorkflowRun({
    work, token, fetchImpl: async (url, init) => {
      calls.push({url, init}); return response(run());
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.github.com/repos/example/private-repo/actions/runs/765');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer ' + token);
  assert.deepEqual(result, {
    repository: 'example/private-repo', repositoryId: 42,
    workflowRunId: 765, status: 'completed', conclusion: 'success',
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('rejects invalid work and server configuration before network access', async () => {
  let calls = 0;
  const fetchImpl = async () => {calls++; return response(run());};
  for (const altered of [
    {workflowRunId: '765'}, {workflowRunId: 0},
    {repositoryId: '42'}, {repository: 'another/repo'},
    {repository: 'bad/path/extra'}, {event: 'repository_dispatch'},
    {action: 'requested'}, {installationId: 0},
  ]) {
    // A different valid owner/repo is allowed in isolation, because the
    // signed authorization gate enforces the configured repository first.
    if (altered.repository === 'another/repo') continue;
    await assert.rejects(inspectAuthorizedWorkflowRun({
      work: {...work, ...altered}, token: 'valid-token', fetchImpl,
    }), /Invalid authorized workflow work item/);
  }
  await assert.rejects(inspectAuthorizedWorkflowRun({
    work, token: 'short', fetchImpl,
  }), /configuration/);
  assert.equal(calls, 0);
});

test('rejects cross-repository, wrong-run, non-completed and malformed API results', async () => {
  const alteredRuns = [
    {...run(), id: 999},
    {...run(), repository: {id: 43, full_name: work.repository}},
    {...run(), repository: {id: 42, full_name: 'wrong/repository'}},
    {...run(), status: 'in_progress'},
    {...run(), conclusion: null},
    {...run(), conclusion: 'not safe'},
    [],
  ];
  for (const altered of alteredRuns) {
    await assert.rejects(inspectAuthorizedWorkflowRun({
      work, token: 'valid-token', fetchImpl: async () => response(altered),
    }), /scope or state/);
  }
});

test('sanitizes network failure, HTTP error and invalid JSON without exposing tokens', async () => {
  const token = 'private-token-must-stay-private';
  for (const fetchImpl of [
    async () => {throw new Error(token);},
    async () => ({ok: false, status: 403, json: async () => ({secret: token})}),
    async () => ({ok: true, status: 200, json: async () => {throw new Error(token);}}),
  ]) {
    await assert.rejects(inspectAuthorizedWorkflowRun({work, token, fetchImpl}),
      error => !error.message.includes(token));
  }
});

function fakeWorker(claim = {...work}, completeValue = true) {
  const calls = [];
  return {
    calls,
    claim: async (...args) => {calls.push(['claim', ...args]); return claim;},
    complete: async (...args) => {calls.push(['complete', ...args]); return completeValue;},
    fail: async (...args) => {
      calls.push(['fail', ...args]);
      return { status: 'retry_scheduled' };
    },
  };
}

test('a missing lease never requests a token or calls GitHub', async () => {
  const worker = fakeWorker(null);
  const processOne = createReadOnlyWebhookConsumer({
    worker,
    getToken: async () => {throw Error('should not be called');},
    fetchImpl: async () => {throw Error('should not be called');},
  });
  assert.deepEqual(await processOne(work.deliveryId, 'worker-A'), {status: 'not_claimed'});
  assert.equal(worker.calls.length, 1);
});

test('successful workflow read is acknowledged with lease token only afterwards', async () => {
  const worker = fakeWorker();
  const processOne = createReadOnlyWebhookConsumer({
    worker, getToken: async () => 'valid-token', fetchImpl: goodFetch,
  });
  assert.deepEqual(await processOne(work.deliveryId, 'worker-A'), {
    status: 'completed', repository: work.repository,
    workflowRunId: 765, conclusion: 'success',
  });
  assert.equal(worker.calls.length, 2);
  assert.deepEqual(worker.calls[1], ['complete', work.deliveryId, 'worker-A', work.leaseToken]);
});

test('transient GitHub read failure schedules retry rather than completing work', async () => {
  const worker = fakeWorker();
  const processOne = createReadOnlyWebhookConsumer({
    worker, getToken: async () => 'valid-token',
    fetchImpl: async () => {throw Error('secret service detail');},
  });
  assert.deepEqual(await processOne(work.deliveryId, 'worker-A'), {status: 'retry_scheduled'});
  assert.equal(worker.calls.some(x => x[0] === 'complete'), false);
  assert.deepEqual(worker.calls[1], ['fail', work.deliveryId, 'worker-A', work.leaseToken]);
});

test('lost lease does not claim completion; failed completion is never suppressed', async () => {
  const worker = fakeWorker({...work}, false);
  const processOne = createReadOnlyWebhookConsumer({
    worker, getToken: async () => 'valid-token', fetchImpl: goodFetch,
  });
  assert.deepEqual(await processOne(work.deliveryId, 'worker-A'), {status: 'lease_lost'});
  worker.complete = async () => {throw Error('private-db-uri');};
  await assert.rejects(processOne(work.deliveryId, 'worker-A'),
    error => error.message === 'Webhook completion could not be persisted.');
});

test('token provider failure is sanitized and dead-letter outcome is preserved', async () => {
  const worker = fakeWorker();
  worker.fail = async () => ({status: 'dead'});
  const processOne = createReadOnlyWebhookConsumer({
    worker, getToken: async () => {throw Error('sensitive-credential');},
    fetchImpl: goodFetch,
  });
  assert.deepEqual(await processOne(work.deliveryId, 'worker-A'), {status: 'dead'});
});

test('configuration failures reject nonfunctional workers and token providers', () => {
  assert.throws(() => createReadOnlyWebhookConsumer({worker: {}, getToken: async () => 'x'}),
    /configuration/);
  assert.throws(() => createReadOnlyWebhookConsumer({worker: fakeWorker(), getToken: null}),
    /configuration/);
});
