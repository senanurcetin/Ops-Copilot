import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { enqueueAuthorizedGitHubDelivery } from '../scripts/github-webhook-gate.mjs';
import { createFirestoreWebhookOutbox } from '../scripts/github-webhook-firestore-outbox.mjs';

const id = '711c17df-3579-4c49-a3f1-4becc101abcd';
const work = Object.freeze({
  deliveryId: id, event: 'workflow_run', action: 'completed',
  installationId: 11, repositoryId: 42, repository: 'example/private-repo',
  workflowRunId: 765,
});

function fakeFirestore() {
  const records = new Map();
  let chain = Promise.resolve();
  const db = {
    collection: name => {
      assert.equal(name, 'githubWebhookOutbox');
      return { doc: guid => ({guid}) };
    },
    runTransaction: callback => {
      // An offline fake implementing serializable transaction ordering.
      const task = chain.then(async () => {
        const changes = [];
        const transaction = {
          get: async ref => ({exists: records.has(ref.guid)}),
          create: (ref, data) => { changes.push([ref.guid, data]); },
        };
        const result = await callback(transaction);
        for (const [guid, data] of changes) {
          if (records.has(guid)) throw new Error('duplicate write');
          records.set(guid, data);
        }
        return result;
      });
      chain = task.catch(() => {});
      return task;
    },
  };
  return {db, records};
}

test('firestore outbox atomically creates a durable work record', async () => {
  const {db, records} = fakeFirestore();
  const enqueueOnce = createFirestoreWebhookOutbox(db);
  assert.equal(await enqueueOnce(work), true);
  assert.equal(records.size, 1);
  assert.deepEqual(Object.keys(records.get(id)).sort(), [
    'action', 'attempts', 'deliveryId', 'enqueuedAtMs', 'event',
    'installationId', 'repository', 'repositoryId', 'state', 'workflowRunId',
  ].sort());
  assert.equal(records.get(id).state, 'queued');
  assert.equal(records.get(id).attempts, 0);
  assert.equal(typeof records.get(id).enqueuedAtMs, 'number');
});

test('duplicate/concurrent delivery is stored once even with distinct adapter instances', async () => {
  const {db, records} = fakeFirestore();
  const enqueueA = createFirestoreWebhookOutbox(db);
  const enqueueB = createFirestoreWebhookOutbox(db);
  const results = await Promise.all(Array.from({length: 30}, (_, index) =>
    (index % 2 ? enqueueA : enqueueB)(work)));
  assert.equal(results.filter(x => x === true).length, 1);
  assert.equal(results.filter(x => x === false).length, 29);
  assert.equal(records.size, 1);
});

test('rejects invalid work before touching the outbox', async () => {
  const {db, records} = fakeFirestore();
  const outbox = createFirestoreWebhookOutbox(db);
  for (const change of [
    {deliveryId: '../path'}, {workflowRunId: '765'},
    {repositoryId: 0}, {repository: 'other/repo/path'},
    {action: 'delete'},
  ]) {
    await assert.rejects(outbox({...work, ...change}), /Invalid GitHub webhook outbox/);
  }
  assert.equal(records.size, 0);
  assert.throws(() => createFirestoreWebhookOutbox(null), /transaction client/);
});

test('invalid database errors do not become successful webhook acceptance', async () => {
  const brokenDb = {
    collection: () => ({doc: guid => ({guid})}),
    runTransaction: async () => {throw new Error('internal-db-secret');},
  };
  const rawBody = Buffer.from(JSON.stringify({
    action: 'completed', installation: {id: 11},
    repository: {id: 42, full_name: 'example/private-repo'},
    workflow_run: {id: 765},
  }));
  const secret = 'offline-test-secret';
  const headers = {
    'x-github-event': 'workflow_run', 'x-github-delivery': id,
    'x-hub-signature-256': 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex'),
  };
  await assert.rejects(enqueueAuthorizedGitHubDelivery({
    rawBody, headers, secret, expectedInstallationId: 11,
    expectedRepositoryId: 42, expectedRepository: 'example/private-repo',
    enqueueOnce: createFirestoreWebhookOutbox(brokenDb),
  }), error => error.message === 'GitHub webhook delivery persistence failed.' &&
      !error.message.includes('internal-db-secret'));
});
