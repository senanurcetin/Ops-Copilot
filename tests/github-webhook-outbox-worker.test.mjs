import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createWebhookOutboxWorker } from '../scripts/github-webhook-outbox-worker.mjs';

function fixture(deliveryId = randomUUID()) {
  return {
    deliveryId, state: 'queued', attempts: 0, enqueuedAtMs: 1000,
    event: 'workflow_run', action: 'completed',
    installationId: 11, repositoryId: 42,
    repository: 'example/private-repo', workflowRunId: 765,
  };
}

function fakeFirestore(record = fixture()) {
  const docs = new Map([[record.deliveryId, structuredClone(record)]]);
  let chain = Promise.resolve();
  const db = {
    collection(name) {
      assert.equal(name, 'githubWebhookOutbox');
      return { doc: id => ({ id }) };
    },
    runTransaction(fn) {
      // Serialize fake transaction callbacks so concurrent callers can only
      // observe fully committed states, just as an emulator transaction should.
      const task = chain.then(async () => {
        const updates = [];
        const tx = {
          get: async ref => ({
            exists: docs.has(ref.id),
            data: () => structuredClone(docs.get(ref.id)),
          }),
          update: (ref, patch) => updates.push([ref.id, structuredClone(patch)]),
        };
        const outcome = await fn(tx);
        for (const [id, patch] of updates) {
          if (!docs.has(id)) throw Error('missing record');
          docs.set(id, { ...docs.get(id), ...patch });
        }
        return outcome;
      });
      chain = task.catch(() => {});
      return task;
    },
  };
  return { docs, db };
}

test('only one of 20 concurrent workers holds an exclusive lease', async () => {
  const record = fixture();
  const { db, docs } = fakeFirestore(record);
  const worker = createWebhookOutboxWorker(db, { nowMs: () => 10000 });
  const claimed = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    worker.claim(record.deliveryId, 'worker-' + i)));
  const accepted = claimed.filter(Boolean);
  assert.equal(accepted.length, 1);
  assert.equal(docs.get(record.deliveryId).state, 'processing');
  assert.equal(docs.get(record.deliveryId).attempts, 1);
  assert.equal(accepted[0].repository, 'example/private-repo');
  assert.equal(Object.isFrozen(accepted[0]), true);
  assert.equal('payload' in accepted[0], false);
});

test('completion requires current lease owner and token; a completed record stays terminal', async () => {
  const record = fixture();
  const { db, docs } = fakeFirestore(record);
  const worker = createWebhookOutboxWorker(db, { nowMs: () => 10000 });
  const claim = await worker.claim(record.deliveryId, 'worker-A');
  assert.ok(claim);
  assert.equal(await worker.complete(record.deliveryId, 'worker-B', claim.leaseToken), false);
  assert.equal(await worker.complete(record.deliveryId, 'worker-A', randomUUID()), false);
  assert.equal(await worker.complete(record.deliveryId, 'worker-A', claim.leaseToken), true);
  assert.equal(await worker.complete(record.deliveryId, 'worker-A', claim.leaseToken), false);
  assert.equal(await worker.claim(record.deliveryId, 'worker-A'), null);
  assert.equal(docs.get(record.deliveryId).state, 'completed');
});

test('expired lease can be reclaimed; stale previous worker cannot acknowledge', async () => {
  const record = fixture();
  const { db, docs } = fakeFirestore(record);
  let now = 10000;
  const worker = createWebhookOutboxWorker(db, { nowMs: () => now, leaseMs: 2000 });
  const first = await worker.claim(record.deliveryId, 'worker-A');
  now += 2001;
  const second = await worker.claim(record.deliveryId, 'worker-B');
  assert.notEqual(first.leaseToken, second.leaseToken);
  assert.equal(second.attempts, 2);
  assert.equal(await worker.complete(record.deliveryId, 'worker-A', first.leaseToken), false);
  assert.deepEqual(await worker.fail(record.deliveryId, 'worker-A', first.leaseToken), { status: 'stale' });
  assert.equal(await worker.complete(record.deliveryId, 'worker-B', second.leaseToken), true);
  assert.equal(docs.get(record.deliveryId).attempts, 2);
});

test('failure schedules bounded backoff then dead-letters exhausted work without raw errors', async () => {
  const record = fixture();
  const { db, docs } = fakeFirestore(record);
  let now = 50000;
  const worker = createWebhookOutboxWorker(db, {
    nowMs: () => now, maxAttempts: 3, leaseMs: 5000,
    baseRetryMs: 1000, maxRetryMs: 4000,
  });
  let active = await worker.claim(record.deliveryId, 'worker-A');
  assert.deepEqual(await worker.fail(record.deliveryId, 'worker-A', active.leaseToken),
    { status: 'retry_scheduled', retryAtMs: 51000 });
  assert.equal(await worker.claim(record.deliveryId, 'worker-B'), null);
  now = 51000;
  active = await worker.claim(record.deliveryId, 'worker-B');
  assert.equal(active.attempts, 2);
  assert.deepEqual(await worker.fail(record.deliveryId, 'worker-B', active.leaseToken),
    { status: 'retry_scheduled', retryAtMs: 53000 });
  now = 53000;
  active = await worker.claim(record.deliveryId, 'worker-C');
  assert.equal(active.attempts, 3);
  assert.deepEqual(await worker.fail(record.deliveryId, 'worker-C', active.leaseToken),
    { status: 'dead' });
  assert.equal(docs.get(record.deliveryId).state, 'dead');
  assert.equal(docs.get(record.deliveryId).failureCode, 'ATTEMPTS_EXHAUSTED');
  assert.equal(await worker.claim(record.deliveryId, 'worker-C'), null);
  assert.equal('error' in docs.get(record.deliveryId), false);
});

test('invalid identities, configs and corrupt stored records fail closed', async () => {
  const record = fixture();
  const { db, docs } = fakeFirestore(record);
  assert.throws(() => createWebhookOutboxWorker(null), /configuration/);
  assert.throws(() => createWebhookOutboxWorker(db, { maxAttempts: 0 }), /configuration/);
  const worker = createWebhookOutboxWorker(db, { nowMs: () => 10000 });
  await assert.rejects(worker.claim('../invalid', 'worker-A'), /delivery ID/);
  await assert.rejects(worker.claim(record.deliveryId, 'worker/A'), /worker identity/);
  await assert.rejects(worker.complete(record.deliveryId, 'worker-A', 'bad-token'), /worker identity/);
  docs.set(record.deliveryId, { ...record, state: 'not-a-state' });
  await assert.rejects(worker.claim(record.deliveryId, 'worker-A'), /transaction failed/);
});

test('Firestore driver exceptions are sanitized before they reach callers', async () => {
  const db = {
    collection: () => ({ doc: id => ({id}) }),
    runTransaction: async () => { throw Error('secret-backend-connection-string'); },
  };
  const worker = createWebhookOutboxWorker(db);
  const deliveryId = randomUUID();
  await assert.rejects(worker.claim(deliveryId, 'worker-A'),
    error => error.message === 'Webhook outbox transaction failed.' &&
      !error.message.includes('secret-backend-connection-string'));
});
