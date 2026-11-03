import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createWebhookOutboxCompactor } from '../scripts/github-webhook-outbox-retention.mjs';

const DAY = 86400000;
function fixture(deliveryId = randomUUID()) {
  return {
    deliveryId, state: 'completed', event: 'workflow_run', action: 'completed',
    installationId: 11, repositoryId: 42, repository: 'example/private-repo',
    workflowRunId: 765, attempts: 2, enqueuedAtMs: DAY,
    completedAtMs: 2 * DAY, recoveryCount: 0,
    leaseOwner: null, leaseToken: null, leaseUntilMs: 0,
    failureCode: 'PROCESSING_FAILED', temporaryDebug: 'should-not-retain',
  };
}
function fakeFirestore(record = fixture()) {
  const docs = new Map([[record.deliveryId, structuredClone(record)]]);
  let serial = Promise.resolve();
  let writes = 0;
  const db = {
    collection(name) {
      assert.equal(name, 'githubWebhookOutbox');
      return {doc: id => ({id})};
    },
    runTransaction(cb) {
      const task = serial.then(async () => {
        const changes = [];
        const tx = {
          get: async ref => ({exists: docs.has(ref.id), data: () => structuredClone(docs.get(ref.id))}),
          set: (ref, value) => changes.push([ref.id, structuredClone(value)]),
        };
        const result = await cb(tx);
        for (const [id, value] of changes) {
          docs.set(id, value);
          writes++;
        }
        return result;
      });
      serial = task.catch(() => {});
      return task;
    },
  };
  return {db,docs,getWrites:()=>writes};
}
const request = record => ({
  deliveryId: record.deliveryId, operatorId: 'owner-reviewer',
  expectedCompletedAtMs: record.completedAtMs,
});
const clock = () => 12 * DAY;

test('explicit admin authorization is mandatory and checked before storage', async () => {
  const record = fixture();
  const {db,getWrites} = fakeFirestore(record);
  assert.throws(() => createWebhookOutboxCompactor(db), /configuration/);
  let calls = 0;
  const reject = createWebhookOutboxCompactor({
    collection: name => db.collection(name),
    runTransaction: cb => { calls++; return db.runTransaction(cb); },
  }, {authorizeCompaction: async()=>false});
  await assert.rejects(reject(request(record)), /not authorized/);
  assert.equal(calls, 0);
  assert.equal(getWrites(), 0);
});

test('old completed record is reduced in-place to an immutable deduplication anchor', async () => {
  const record=fixture();
  const {db,docs,getWrites}=fakeFirestore(record);
  const compact=createWebhookOutboxCompactor(db,{authorizeCompaction:async()=>true,nowMs:clock});
  assert.deepEqual(await compact(request(record)),{status:'compacted'});
  assert.equal(docs.size,1);
  assert.equal(getWrites(),1);
  const saved=docs.get(record.deliveryId);
  assert.deepEqual({
    deliveryId:saved.deliveryId,state:saved.state,repository:saved.repository,
    workflowRunId:saved.workflowRunId,completedAtMs:saved.completedAtMs,
    retentionClass:saved.retentionClass,
  },{
    deliveryId:record.deliveryId,state:'completed',repository:'example/private-repo',
    workflowRunId:765,completedAtMs:2*DAY,retentionClass:'dedup_anchor_v1',
  });
  assert.equal(saved.attempts,2);
  assert.equal(saved.failureCode,undefined);
  assert.equal(saved.temporaryDebug,undefined);
  assert.equal(saved.leaseOwner,undefined);
  assert.equal(saved.recoveryCount,0);
  assert.equal(saved.compactedBy,'owner-reviewer');
  assert.equal(await compact(request(record)).then(x=>x.status),'already_compacted');
});

test('20 concurrent compaction requests permit only one transaction replacement', async()=>{
  const record=fixture();
  const {db,docs,getWrites}=fakeFirestore(record);
  const a=createWebhookOutboxCompactor(db,{authorizeCompaction:async()=>true,nowMs:clock});
  const b=createWebhookOutboxCompactor(db,{authorizeCompaction:async()=>true,nowMs:clock});
  const results=await Promise.all(Array.from({length:20},(_,i)=>(i%2?a:b)(request(record))));
  assert.equal(results.filter(x=>x.status==='compacted').length,1);
  assert.equal(results.filter(x=>x.status==='already_compacted').length,19);
  assert.equal(getWrites(),1);
  assert.equal(docs.get(record.deliveryId).state,'completed');
});

test('nonterminal, missing, stale and recent records do not compact', async()=>{
  const record=fixture();
  const {db,docs,getWrites}=fakeFirestore(record);
  const compact=createWebhookOutboxCompactor(db,{authorizeCompaction:async()=>true,nowMs:clock});
  assert.deepEqual(await compact({...request(record),deliveryId:randomUUID()}),{status:'not_found'});
  assert.deepEqual(await compact({...request(record),expectedCompletedAtMs:3*DAY}),{status:'stale'});
  docs.set(record.deliveryId,{...record,state:'dead'});
  assert.deepEqual(await compact(request(record)),{status:'not_completed'});
  docs.set(record.deliveryId,{...record,state:'processing'});
  assert.deepEqual(await compact(request(record)),{status:'not_completed'});
  docs.set(record.deliveryId,{...record,completedAtMs:11*DAY});
  assert.deepEqual(await compact({...request(record),expectedCompletedAtMs:11*DAY}),{status:'too_recent'});
  assert.equal(getWrites(),0);
});

test('corrupt scope and unexpected active lease fail closed and preserve record',async()=>{
  const record=fixture();
  const {db,docs,getWrites}=fakeFirestore(record);
  const compact=createWebhookOutboxCompactor(db,{authorizeCompaction:async()=>true,nowMs:clock});
  docs.set(record.deliveryId,{...record,repositoryId:0});
  await assert.rejects(compact(request(record)),/transaction failed/);
  docs.set(record.deliveryId,{...record,leaseToken:randomUUID()});
  await assert.rejects(compact(request(record)),/transaction failed/);
  assert.equal(getWrites(),0);
});

test('invalid operator, GUID, timestamp and minimum-age settings are rejected',async()=>{
  const record=fixture();
  const {db}=fakeFirestore(record);
  assert.throws(()=>createWebhookOutboxCompactor(db,{authorizeCompaction:async()=>true,minAgeMs:0}),/configuration/);
  assert.throws(()=>createWebhookOutboxCompactor(db,{authorizeCompaction:async()=>true,minAgeMs:DAY-1}),/configuration/);
  const compact=createWebhookOutboxCompactor(db,{authorizeCompaction:async()=>true,nowMs:clock});
  for(const overrides of [
    {deliveryId:'../bad'}, {operatorId:'x'}, {expectedCompletedAtMs:0},
  ]) await assert.rejects(compact({...request(record),...overrides}),/Invalid webhook outbox compaction/);
});

test('authorization and driver failures are sanitized',async()=>{
  const record=fixture();
  const {db}=fakeFirestore(record);
  const authorizeError=createWebhookOutboxCompactor(db,{
    authorizeCompaction:async()=>{throw Error('operator-private-credential');},nowMs:clock,
  });
  await assert.rejects(authorizeError(request(record)),
    error=>error.message==='Webhook compaction authorization failed.');
  const driverFailure=createWebhookOutboxCompactor({
    collection:()=>({doc:id=>({id})}),
    runTransaction:async()=>{throw Error('private-firestore-uri');},
  },{authorizeCompaction:async()=>true,nowMs:clock});
  await assert.rejects(driverFailure(request(record)),
    error=>error.message==='Webhook outbox compaction transaction failed.');
});
