import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createWebhookLegacyAnchorBackfill} from '../scripts/github-webhook-legacy-anchor-backfill.mjs';

const GUID='711c17df-3579-4c49-a3f1-4becc101abcd';
const ENQUEUED=1700000000000;
const record=(deliveryId=GUID)=>({
  deliveryId,event:'workflow_run',action:'completed',installationId:11,
  repositoryId:42,repository:'example/private-repo',workflowRunId:765,
  state:'completed',attempts:2,enqueuedAtMs:ENQUEUED,
  completedAtMs:ENQUEUED+1000,payload:'should-never-be-copied',
});
const request=(deliveryId=GUID)=>({
  deliveryId,operatorId:'owner-reviewer',expectedEnqueuedAtMs:ENQUEUED,
});
const workPath=id=>'githubWebhookOutbox/'+id;
const anchorPath=id=>'githubWebhookDedupAnchors/'+id;

function fakeFirestore(entries=[[workPath(GUID),record()]]) {
  const docs=new Map(entries.map(([k,v])=>[k,structuredClone(v)]));
  let chain=Promise.resolve();
  let writes=0, runs=0;
  const db={
    collection:name=>{
      assert.ok(['githubWebhookOutbox','githubWebhookDedupAnchors'].includes(name));
      return {doc:guid=>({path:name+'/'+guid})};
    },
    runTransaction:callback=>{
      runs++;
      const task=chain.then(async()=>{
        const changes=[];
        const transaction={
          get:async ref=>({
            exists:docs.has(ref.path),
            data:()=>structuredClone(docs.get(ref.path)),
          }),
          create:(ref,data)=>changes.push([ref.path,structuredClone(data)]),
        };
        const result=await callback(transaction);
        if(changes.some(([key])=>docs.has(key)))throw Error('duplicate create');
        for(const [key,data] of changes){docs.set(key,data);writes++;}
        return result;
      });
      chain=task.catch(()=>{});
      return task;
    },
  };
  return {db,docs,getWrites:()=>writes,getRuns:()=>runs};
}

test('authorized historical work creates only minimal permanent GUID anchor',async()=>{
  const {db,docs,getWrites}=fakeFirestore();
  const backfill=createWebhookLegacyAnchorBackfill(db,{
    authorizeBackfill:async approval=>approval.operatorId==='owner-reviewer',
    nowMs:()=>ENQUEUED+5000,
  });
  assert.deepEqual(await backfill(request()),{status:'anchored'});
  assert.equal(getWrites(),1);
  assert.deepEqual(docs.get(anchorPath(GUID)),{
    kind:'github_workflow_delivery',recordedAtMs:ENQUEUED+5000,
  });
  assert.equal(docs.get(workPath(GUID)).payload,'should-never-be-copied');
  assert.equal(docs.size,2);
  assert.equal(JSON.stringify(docs.get(anchorPath(GUID))).includes('should-never'),false);
});

test('20 competing authorized backfills create exactly one anchor',async()=>{
  const {db,docs,getWrites}=fakeFirestore();
  const opts={authorizeBackfill:async()=>true,nowMs:()=>ENQUEUED+6000};
  const a=createWebhookLegacyAnchorBackfill(db,opts);
  const b=createWebhookLegacyAnchorBackfill(db,opts);
  const results=await Promise.all(Array.from({length:20},(_,i)=>
    (i%2?a:b)(request())));
  assert.equal(results.filter(r=>r.status==='anchored').length,1);
  assert.equal(results.filter(r=>r.status==='already_anchored').length,19);
  assert.equal(getWrites(),1);
  assert.equal(docs.size,2);
});

test('missing/stale source never creates an ungrounded anchor',async()=>{
  const {db,docs,getWrites}=fakeFirestore();
  const backfill=createWebhookLegacyAnchorBackfill(db,{authorizeBackfill:async()=>true});
  assert.deepEqual(await backfill(request(randomUUID())),{status:'not_found'});
  assert.deepEqual(await backfill({...request(),expectedEnqueuedAtMs:ENQUEUED+1}),{status:'stale'});
  assert.equal(docs.has(anchorPath(GUID)),false);
  assert.equal(getWrites(),0);
});

test('explicit operator authorization is mandatory before any Firestore transaction',async()=>{
  const {db,getRuns,getWrites}=fakeFirestore();
  assert.throws(()=>createWebhookLegacyAnchorBackfill(db),/configuration/);
  assert.throws(()=>createWebhookLegacyAnchorBackfill(null,{
    authorizeBackfill:async()=>true,
  }),/configuration/);
  const denied=createWebhookLegacyAnchorBackfill(db,{authorizeBackfill:async()=>false});
  await assert.rejects(denied(request()),/not authorized/);
  const errors=createWebhookLegacyAnchorBackfill(db,{
    authorizeBackfill:async()=>{throw Error('private-approval-key');},
  });
  await assert.rejects(errors(request()),error=>
    error.message==='Legacy GUID backfill authorization failed.');
  assert.equal(getRuns(),0);
  assert.equal(getWrites(),0);
});

test('malformed GUIDs, actor, clock and scope fail closed',async()=>{
  const {db,docs,getRuns}=fakeFirestore();
  const backfill=createWebhookLegacyAnchorBackfill(db,{authorizeBackfill:async()=>true});
  for(const delta of [
    {deliveryId:'../bad'},{deliveryId:GUID.toUpperCase()},
    {operatorId:'x'}, {expectedEnqueuedAtMs:0},
  ])await assert.rejects(backfill({...request(),...delta}),/Invalid legacy GUID backfill request/);
  assert.equal(getRuns(),0);
  docs.set(workPath(GUID),{...record(),repository:'owner/..'});
  await assert.rejects(backfill(request()),/transaction failed/);
  docs.set(workPath(GUID),{...record(),installationId:0});
  await assert.rejects(backfill(request()),/transaction failed/);
  assert.equal(docs.has(anchorPath(GUID)),false);
});

test('preexisting anchor is idempotent, but corrupt anchor is refused',async()=>{
  const {db,docs,getWrites}=fakeFirestore();
  docs.set(anchorPath(GUID),{kind:'github_workflow_delivery',recordedAtMs:1234});
  const backfill=createWebhookLegacyAnchorBackfill(db,{authorizeBackfill:async()=>true});
  assert.deepEqual(await backfill(request()),{status:'already_anchored'});
  docs.set(anchorPath(GUID),{kind:'unknown',recordedAtMs:1234});
  await assert.rejects(backfill(request()),/transaction failed/);
  assert.equal(getWrites(),0);
});

test('driver or invalid timestamp failures are sanitized and preserve source',async()=>{
  const secret='private-firestore-endpoint';
  const badDb={
    collection:name=>({doc:id=>({path:name+'/'+id})}),
    runTransaction:async()=>{throw Error(secret);},
  };
  const broken=createWebhookLegacyAnchorBackfill(badDb,{authorizeBackfill:async()=>true});
  await assert.rejects(broken(request()),error=>
    error.message==='Legacy GUID backfill transaction failed.' &&
    !error.message.includes(secret));
  const {db,docs}=fakeFirestore();
  const invalidClock=createWebhookLegacyAnchorBackfill(db,{
    authorizeBackfill:async()=>true,nowMs:()=>0,
  });
  await assert.rejects(invalidClock(request()),/transaction failed/);
  assert.equal(docs.has(anchorPath(GUID)),false);
  assert.equal(docs.get(workPath(GUID)).deliveryId,GUID);
});

test('backfill covers all legacy lifecycle states without changing their work records',async()=>{
  for(const state of ['queued','processing','completed','dead']){
    const id=randomUUID();
    const initial={...record(id),state};
    const {db,docs}=fakeFirestore([[workPath(id),initial]]);
    const backfill=createWebhookLegacyAnchorBackfill(db,{
      authorizeBackfill:async()=>true,nowMs:()=>ENQUEUED+7000,
    });
    assert.deepEqual(await backfill(request(id)),{status:'anchored'});
    assert.deepEqual(docs.get(workPath(id)),initial);
    assert.equal(docs.has(anchorPath(id)),true);
  }
});
