import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { enqueueAuthorizedGitHubDelivery } from '../scripts/github-webhook-gate.mjs';

const secret = 'webhook-secret-for-tests';
const deliveryId = '711c17df-3579-4c49-a3f1-4becc101abcd';
const expectedInstallationId = 11;
const expectedRepositoryId = 42;
const expectedRepository = 'example/private-repo';
const payload = () => ({
  action: 'completed',
  installation: {id: expectedInstallationId},
  repository: {id: expectedRepositoryId, full_name: expectedRepository},
  workflow_run: {id: 765, repository_id: expectedRepositoryId},
});
const signed = (data = payload(), event = 'workflow_run') => {
  const rawBody = Buffer.from(JSON.stringify(data));
  return {
    rawBody,
    headers: {
      'x-github-event': event,
      'x-github-delivery': deliveryId,
      'x-hub-signature-256': 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex'),
    },
  };
};
const defaultConfig = {
  secret, expectedInstallationId, expectedRepositoryId, expectedRepository,
};
const call = (props, enqueueOnce = async () => true, config = defaultConfig) =>
  enqueueAuthorizedGitHubDelivery({...config, ...props, enqueueOnce});

test('atomically enqueues a permitted workflow completion with minimal work metadata', async () => {
  const items = [];
  const result = await call(signed(), async work => {items.push(work); return true;});
  assert.deepEqual(result, {status: 'enqueued', deliveryId});
  assert.deepEqual(items, [{
    deliveryId, event: 'workflow_run', action: 'completed',
    installationId: 11, repositoryId: 42, repository: expectedRepository,
    workflowRunId: 765,
  }]);
  assert.equal(Object.isFrozen(items[0]), true);
  assert.equal('token' in items[0], false);
  assert.equal('payload' in items[0], false);
});

test('same delivery identifier is enqueued at most once by transactional adapter', async () => {
  const seen = new Set();
  const enqueueOnce = async work => {
    if (seen.has(work.deliveryId)) return false;
    seen.add(work.deliveryId);
    return true;
  };
  const responses = await Promise.all(Array.from({length: 20}, () => call(signed(), enqueueOnce)));
  assert.equal(responses.filter(r => r.status === 'enqueued').length, 1);
  assert.equal(responses.filter(r => r.status === 'duplicate').length, 19);
  assert.equal(seen.size, 1);
});

test('signature is verified first; a modified payload can never hit storage', async () => {
  const request = signed();
  request.rawBody = Buffer.from(request.rawBody.toString().replace('765', '766'));
  let calls = 0;
  await assert.rejects(call(request, async () => {calls++; return true;}), /signature validation/);
  assert.equal(calls, 0);
});

test('rejects other installation IDs, repository IDs and repo names', async () => {
  const mutations = [
    {installation: {id: 12}},
    {installation: {id: '11'}},
    {installation: undefined},
    {repository: {id: 999, full_name: expectedRepository}},
    {repository: {id: 42, full_name: 'other/repo'}},
    {repository: {id: '42', full_name: expectedRepository}},
    {repository: undefined},
  ];
  for (const patch of mutations) {
    let calls = 0;
    await assert.rejects(call(signed({...payload(), ...patch}), async () => {calls++; return true;}), /not authorized/);
    assert.equal(calls, 0);
  }
});

test('ignores non-allowlisted event and actions without persisting', async () => {
  for (const [event, action] of [
    ['workflow_run', 'requested'],
    ['workflow_run', 'in_progress'],
    ['workflow_job', 'completed'],
    ['ping', undefined],
  ]) {
    let calls = 0;
    const result = await call(signed({...payload(), action}, event), async () => {calls++; return true;});
    assert.deepEqual(result, {status: 'ignored', deliveryId});
    assert.equal(calls, 0);
  }
});

test('rejects malformed or cross-repository workflow-run identity', async () => {
  for (const run of [undefined, {}, {id: 0}, {id: '765'},
    {id: 765, repository_id: 99}, {id: Number.MAX_SAFE_INTEGER + 1}]) {
    await assert.rejects(call(signed({...payload(), workflow_run: run})), /workflow-run scope/);
  }
});

test('invalid server configuration fails before any queue operation', async () => {
  for (const configPatch of [
    {expectedInstallationId: 0}, {expectedInstallationId: '11'},
    {expectedRepositoryId: -1}, {expectedRepository: 'bad-path'},
    {expectedRepository: ''},
  ]) {
    await assert.rejects(call(signed(), async () => true, {...defaultConfig, ...configPatch}), /configuration is invalid/);
  }
  await assert.rejects(enqueueAuthorizedGitHubDelivery({...defaultConfig, ...signed()}), /durable webhook delivery queue/);
});

test('store failure is sanitized and never reported as accepted', async () => {
  await assert.rejects(call(signed(), async () => {throw new Error('sensitive-database-uri');}),
    error => error.message === 'GitHub webhook delivery persistence failed.' &&
      !error.message.includes('sensitive-database-uri'));
  for (const invalid of [undefined, null, 0, 1, 'true', {}]) {
    await assert.rejects(call(signed(), async () => invalid), /persistence result is invalid/);
  }
});

test('adapter cannot alter frozen work record', async () => {
  await call(signed(), async work => {
    assert.throws(() => {work.repositoryId = 99;}, TypeError);
    return true;
  });
});
