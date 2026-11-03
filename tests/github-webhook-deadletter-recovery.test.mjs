import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createWebhookDeadLetterRecovery } from '../scripts/github-webhook-deadletter-recovery.mjs';

function fixture(deliveryId = randomUUID()) {
  return {
    deliveryId, event: 'workflow_run', action: 'completed',
    installationId: 11, repositoryId: 42, repository: 'example/private-repo',
    workflowRunId: 765, state: 'dead', attempts: 5, deadAtMs: 10000,
    leaseOwner: null, leaseToken: null, leaseUntilMs: 0,
    failureCode: 'ATTEMPTS_EXHAUSTED',
  };
}
function fakeFirestore(record = fixture()) {
  const docs = new Map([[record.deliveryId, structuredClone(record)]]);
  let chain = Promise.resolve();
  let writes = 0;
  const db = {
    collection(name) {
      assert.equal(name, 'githubWebhookOutbox');
      return {doc: id => ({id})};
    },
    runTransaction(cb) {
      const task = chain.then(async () => {
        const changes = [];
        const tx = {
          get: async ref => ({
            exists: docs.has(ref.id),
            data: () => structuredClone(docs.get(ref.id)),
          }),
          update: (ref, patch) => changes.push([ref.id, structuredClone(patch)]),
        };
        const result = await cb(tx);
        for (const [id, patch] of changes) {
          docs.set(id, {...docs.get(id), ...patch});
          writes++;
        }
        return result;
      });
      chain = task.catch(() => {});
      return task;
    },
  };
  return {db, docs, getWrites: () => writes};
}
const argumentsFor = record => ({
  deliveryId: record.deliveryId, operatorId: 'owner-reviewer',
  expectedDeadAtMs: record.deadAtMs,
});

test('requires an explicit server-side approval callback', async () => {
  const {db} = fakeFirestore();
  assert.throws(() => createWebhookDeadLetterRecovery(db), /configuration/);
  assert.throws(() => createWebhookDeadLetterRecovery(null, {authorizeRecovery: async () => true}), /configuration/);
});

test('refused approval cannot read or write a Firestore record', async () => {
  const record = fixture();
  const {db, getWrites} = fakeFirestore(record);
  let transactions = 0;
  const recovery = createWebhookDeadLetterRecovery({
    collection: name => db.collection(name),
    runTransaction: cb => {transactions++; return db.runTransaction(cb);},
  }, {authorizeRecovery: async () => false});
  await assert.rejects(recovery(argumentsFor(record)), /not authorized/);
  assert.equal(getWrites(), 0);
  assert.equal(transactions, 0);
});

test('approved recovery preserves delivery GUID and work scope while resetting lease and attempts', async () => {
  const record = fixture();
  const {db, docs, getWrites} = fakeFirestore(record);
  const recovery = createWebhookDeadLetterRecovery(db, {
    authorizeRecovery: async approval =>
      approval.operatorId === 'owner-reviewer' && approval.deliveryId === record.deliveryId,
    nowMs: () => 20000,
  });
  assert.deepEqual(await recovery(argumentsFor(record)), {status: 'requeued'});
  assert.equal(getWrites(), 1);
  assert.equal(docs.size, 1);
  const updated = docs.get(record.deliveryId);
  assert.equal(updated.state, 'queued');
  assert.equal(updated.attempts, 0);
  assert.equal(updated.availableAtMs, 20000);
  assert.equal(updated.recoveryCount, 1);
  assert.equal(updated.deadAtMs, null);
  assert.equal(updated.recoveredBy, 'owner-reviewer');
  assert.equal(updated.workflowRunId, 765);
  assert.equal(updated.repositoryId, 42);
  assert.equal(updated.leaseToken, null);
  assert.equal('token' in updated, false);
  assert.equal('payload' in updated, false);
});

test('concurrent and replayed recovery requests never requeue twice', async () => {
  const record = fixture();
  const {db, docs, getWrites} = fakeFirestore(record);
  const callback = async () => true;
  const a = createWebhookDeadLetterRecovery(db, {authorizeRecovery: callback, nowMs: () => 21000});
  const b = createWebhookDeadLetterRecovery(db, {authorizeRecovery: callback, nowMs: () => 21000});
  const results = await Promise.all(Array.from({length: 20}, (_, i) =>
    (i % 2 ? a : b)(argumentsFor(record))));
  assert.equal(results.filter(r => r.status === 'requeued').length, 1);
  assert.equal(results.filter(r => r.status === 'not_dead').length, 19);
  assert.equal(getWrites(), 1);
  assert.equal(docs.get(record.deliveryId).recoveryCount, 1);
});

test('stale expected dead timestamp, unknown and non-dead records remain unchanged', async () => {
  const record = fixture();
  const {db, docs, getWrites} = fakeFirestore(record);
  const recover = createWebhookDeadLetterRecovery(db, {authorizeRecovery: async () => true});
  assert.deepEqual(await recover({...argumentsFor(record), expectedDeadAtMs: 10001}), {status: 'stale'});
  assert.deepEqual(await recover({...argumentsFor(record), deliveryId: randomUUID()}), {status: 'not_found'});
  docs.set(record.deliveryId, {...record, state: 'completed'});
  assert.deepEqual(await recover(argumentsFor(record)), {status: 'not_dead'});
  assert.equal(getWrites(), 0);
});

test('recovery cannot loop indefinitely after one rescue', async () => {
  const record = {...fixture(), recoveryCount: 1};
  const {db, getWrites} = fakeFirestore(record);
  const recover = createWebhookDeadLetterRecovery(db, {authorizeRecovery: async () => true});
  assert.deepEqual(await recover(argumentsFor(record)), {status: 'limit_reached'});
  assert.equal(getWrites(), 0);
});

test('invalid identities and storage errors are rejected without leaking details', async () => {
  const record = fixture();
  const {db, docs, getWrites} = fakeFirestore(record);
  const recover = createWebhookDeadLetterRecovery(db, {authorizeRecovery: async () => true});
  for (const override of [
    {deliveryId: '../bad'}, {operatorId: 'x'}, {expectedDeadAtMs: 0},
  ]) await assert.rejects(recover({...argumentsFor(record), ...override}), /Invalid dead-letter recovery/);
  assert.equal(getWrites(), 0);
  docs.set(record.deliveryId, {...record, leaseToken: randomUUID()});
  await assert.rejects(recover(argumentsFor(record)), /transaction failed/);
  const authFails = createWebhookDeadLetterRecovery(db, {
    authorizeRecovery: async () => {throw Error('secret-owner-credential');},
  });
  await assert.rejects(authFails(argumentsFor(record)),
    error => !error.message.includes('secret-owner-credential'));
});
