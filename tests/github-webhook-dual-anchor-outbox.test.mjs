import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDualAnchorWebhookOutbox} from '../scripts/github-webhook-dual-anchor-outbox.mjs';

const GUID = '711c17df-3579-4c49-a3f1-4becc101abcd';
const work = Object.freeze({
  deliveryId: GUID, event:'workflow_run', action:'completed',
  installationId:11, repositoryId:42, repository:'example/private-repo',
  workflowRunId:765,
});

function fakeFirestore() {
  const docs = new Map();
  let chain = Promise.resolve();
  let creates = 0;
  const db = {
    collection: name => {
      assert.ok(['githubWebhookDedupAnchors','githubWebhookOutbox'].includes(name));
      return {doc: deliveryId => ({path:name+'/'+deliveryId})};
    },
    runTransaction: fn => {
      const task = chain.then(async () => {
        const changes = [];
        const tx = {
          get: async ref => ({exists:docs.has(ref.path)}),
          create: (ref, data) => changes.push([ref.path,structuredClone(data)]),
        };
        const result = await fn(tx);
        // Atomic simulated transaction commit: validate all writes first.
        for (const [path] of changes) {
          if (docs.has(path)) throw Error('duplicate create');
        }
        for (const [path, data] of changes) {
          docs.set(path, data);
          creates++;
        }
        return result;
      });
      chain = task.catch(() => {});
      return task;
    },
  };
  return {db, docs, getCreates:()=>creates};
}
const anchorPath = id => 'githubWebhookDedupAnchors/'+id;
const outboxPath = id => 'githubWebhookOutbox/'+id;

test('one transaction creates minimal permanent anchor and queued work document', async()=>{
  const {db,docs,getCreates}=fakeFirestore();
  const enqueue=createDualAnchorWebhookOutbox(db,{nowMs:()=>1700000000000});
  assert.equal(await enqueue(work),true);
  assert.equal(getCreates(),2);
  assert.equal(docs.size,2);
  assert.deepEqual(docs.get(anchorPath(GUID)),{
    kind:'github_workflow_delivery',recordedAtMs:1700000000000,
  });
  const queued=docs.get(outboxPath(GUID));
  assert.equal(queued.deliveryId,GUID);
  assert.equal(queued.state,'queued');
  assert.equal(queued.attempts,0);
  assert.equal(queued.enqueuedAtMs,1700000000000);
  assert.equal(queued.workflowRunId,765);
  assert.equal(JSON.stringify(docs.get(anchorPath(GUID))).includes('repo'),false);
});

test('30 concurrent deliveries from two instances create only one anchor/work pair',async()=>{
  const {db,docs,getCreates}=fakeFirestore();
  const a=createDualAnchorWebhookOutbox(db);
  const b=createDualAnchorWebhookOutbox(db);
  const results=await Promise.all(Array.from({length:30},(_,i)=>
    (i%2?a:b)(work)));
  assert.equal(results.filter(x=>x===true).length,1);
  assert.equal(results.filter(x=>x===false).length,29);
  assert.equal(getCreates(),2);
  assert.equal(docs.size,2);
});

test('anchor stops signed redelivery even after its original outbox document is absent',async()=>{
  const {db,docs}=fakeFirestore();
  const enqueue=createDualAnchorWebhookOutbox(db);
  assert.equal(await enqueue(work),true);
  docs.delete(outboxPath(GUID)); // synthetic fixture only, never production.
  assert.equal(await enqueue(work),false);
  assert.equal(docs.has(outboxPath(GUID)),false);
  assert.equal(docs.has(anchorPath(GUID)),true);
});

test('legacy outbox document remains a duplicate without implicitly backfilling',async()=>{
  const {db,docs,getCreates}=fakeFirestore();
  docs.set(outboxPath(GUID),{state:'completed',deliveryId:GUID});
  const enqueue=createDualAnchorWebhookOutbox(db);
  assert.equal(await enqueue(work),false);
  assert.equal(docs.has(anchorPath(GUID)),false);
  assert.equal(getCreates(),0);
  // A separately reviewed legacy backfill is required before any deletion.
});

test('invalid work is rejected before any Firestore transaction',async()=>{
  const {db,getCreates}=fakeFirestore();
  let runs=0;
  const monitored={
    collection:name=>db.collection(name),
    runTransaction:fn=>{runs++;return db.runTransaction(fn);},
  };
  const enqueue=createDualAnchorWebhookOutbox(monitored);
  for(const delta of [
    {deliveryId:'../bad'}, {deliveryId:GUID.toUpperCase()},
    {installationId:0},{installationId:'11'},
    {repositoryId:0},{workflowRunId:0},
    {event:'push'}, {action:'requested'},
    {repository:'owner/..'},{repository:'./repo'},
    {repository:'owner/path/extra'},
  ]) await assert.rejects(enqueue({...work,...delta}),/Invalid dual-anchor webhook work item/);
  assert.equal(runs,0);
  assert.equal(getCreates(),0);
});

test('invalid configuration and clock fail closed with no partial pair',async()=>{
  const {db,docs,getCreates}=fakeFirestore();
  assert.throws(()=>createDualAnchorWebhookOutbox(null),/configuration/);
  const enqueue=createDualAnchorWebhookOutbox(db,{nowMs:()=>0});
  await assert.rejects(enqueue(work),/Dual-anchor webhook persistence failed/);
  assert.equal(docs.size,0);
  assert.equal(getCreates(),0);
});

test('transport error is sanitized and cannot falsely acknowledge a persisted delivery',async()=>{
  const privateValue='emulator-secret-not-for-output';
  const broken={
    collection:name=>({doc:id=>({path:name+'/'+id})}),
    runTransaction:async()=>{throw Error(privateValue);},
  };
  const enqueue=createDualAnchorWebhookOutbox(broken);
  await assert.rejects(enqueue(work),error=>
    error.message==='Dual-anchor webhook persistence failed.' &&
    !error.message.includes(privateValue));
});

test('anchor existing without work never creates a second work item',async()=>{
  const {db,docs,getCreates}=fakeFirestore();
  docs.set(anchorPath(GUID),{kind:'github_workflow_delivery',recordedAtMs:1000});
  const enqueue=createDualAnchorWebhookOutbox(db);
  assert.equal(await enqueue(work),false);
  assert.equal(getCreates(),0);
  assert.equal(docs.has(outboxPath(GUID)),false);
});

test('independent GUIDs yield exactly one pair each',async()=>{
  const {db,docs,getCreates}=fakeFirestore();
  const enqueue=createDualAnchorWebhookOutbox(db);
  const second={...work,deliveryId:randomUUID()};
  assert.equal(await enqueue(work),true);
  assert.equal(await enqueue(second),true);
  assert.equal(docs.size,4);
  assert.equal(getCreates(),4);
});
