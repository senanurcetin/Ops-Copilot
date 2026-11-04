import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {analyzeWebhookRetentionSnapshot} from '../scripts/github-webhook-retention-inventory.mjs';

const DAY=86400000;
const NOW=20*DAY;
const fresh=(state='queued')=>({
  deliveryId:randomUUID(),event:'workflow_run',action:'completed',
  installationId:11,repositoryId:42,repository:'example/private-repo',
  workflowRunId:765,enqueuedAtMs:DAY,attempts:0,state,
});
const analyze=(records,other={})=>analyzeWebhookRetentionSnapshot(records,{nowMs:NOW,...other});

test('bounded sample counts states and eligible completed work without returning GUIDs',()=>{
  const anchor={
    ...fresh('completed'),completedAtMs:2*DAY,retentionClass:'dedup_anchor_v1',
    compactedAtMs:10*DAY,compactedBy:'owner-reviewer',
  };
  const old={...fresh('completed'),completedAtMs:3*DAY};
  const recent={...fresh('completed'),completedAtMs:19*DAY};
  const queued={...fresh('queued'),token:'synthetic-sensitive-test-value'};
  const dead={...fresh('dead'),deadAtMs:18*DAY};
  const records=[anchor,old,recent,queued,dead];
  const before=JSON.stringify(records);
  const report=analyze(records,{expectedDailyDeliveries:100});
  assert.equal(report.recordCount,5);
  assert.deepEqual(report.byState,{queued:1,processing:0,completed:3,dead:1});
  assert.equal(report.compactedCount,1);
  assert.equal(report.eligibleCompletedCount,1);
  assert.equal(report.sensitiveFieldRecords,1);
  assert.equal(report.serializedJsonBytes,
    records.reduce((total, item) => total + Buffer.byteLength(JSON.stringify(item),'utf8'), 0));
  assert.equal(report.predictedNewJsonBytesPerDay,100*report.averageAnchorJsonBytes);
  assert.equal(report.predictedAdditionalJsonBytes365d,365*report.predictedNewJsonBytesPerDay);
  assert.equal(report.measurement,'sampled-serialized-json-utf8-not-firestore-billed-storage');
  assert.equal(JSON.stringify(report).includes(anchor.deliveryId),false);
  assert.equal(JSON.stringify(report).includes('synthetic-sensitive-test-value'),false);
  assert.equal(JSON.stringify(records),before);
  assert.equal(Object.isFrozen(report),true);
});

test('empty sample and no anchor do not fabricate a long-term byte forecast',()=>{
  const empty=analyze([],{expectedDailyDeliveries:3});
  assert.equal(empty.averageAnchorJsonBytes,null);
  assert.equal(empty.predictedAdditionalJsonBytes365d,null);
  const noAnchor=analyze([fresh('dead')],{expectedDailyDeliveries:100});
  assert.equal(noAnchor.predictedNewJsonBytesPerDay,null);
});

test('bounded byte budget is an explicit review trigger, not a deletion action',()=>{
  const completed={...fresh('completed'),completedAtMs:2*DAY,retentionClass:'dedup_anchor_v1'};
  const sample=analyze([completed]);
  const report=analyze([completed],{reviewBudgetJsonBytes:sample.serializedJsonBytes});
  assert.equal(report.thresholdExceeded,true);
  assert.deepEqual(report.safePolicy,{
    deleteDocuments:false,enableFirestoreTtl:false,
    preserveDeliveryGuidAnchors:true,
    compactionRequiresOperatorApproval:true,
    ownerRetentionApprovalStillRequired:true,
  });
  assert.equal(analyze([completed]).thresholdExceeded,null);
});

test('rejects over-cap samples and unsafe simulation parameters',()=>{
  const records=[fresh(),fresh()];
  for(const opts of [
    {maxRecords:1},{maxRecords:0},{nowMs:0},{expectedDailyDeliveries:-1},
    {expectedDailyDeliveries:1000001},{reviewBudgetJsonBytes:0},
    {minCompactionAgeMs:DAY-1},
  ]) assert.throws(()=>analyze(records,opts),/Invalid bounded/);
});

test('rejected duplicate GUID and unsupported state have sanitized errors',()=>{
  const record=fresh();
  assert.throws(()=>analyze([record,{...record}]),/Invalid or duplicate/);
  assert.throws(()=>analyze([{...record,state:'unknown'}]),/Invalid or duplicate/);
  assert.throws(()=>analyze([{...record,deliveryId:'../secret'}]),/Invalid or duplicate/);
});

test('rejects corrupted terminal anchors and unsafe retention classes',()=>{
  const record=fresh();
  assert.throws(()=>analyze([{...record,retentionClass:'dedup_anchor_v1'}]),/Invalid webhook deduplication anchor/);
  assert.throws(()=>analyze([{...record,retentionClass:'delete_me'}]),/Unsupported webhook retention class/);
  assert.throws(()=>analyze([{...record,state:'completed',completedAtMs:NOW+1}]),/Invalid webhook completion timestamp/);
});

test('rejects unserializable records without echoing their contents',()=>{
  const secret='private-db-credential-never-expose';
  const record={...fresh(),payload:secret,unserializable:1n};
  assert.throws(()=>analyze([record]),error=>
    error.message==='Webhook retention record is not JSON serializable.' &&
    !error.message.includes(secret));
});

test('snapshot only identifies sensitive top-level fields, never emits them',()=>{
  const item={...fresh(),raw_body:'never-show-this',private_key:'secret'};
  const report=analyze([item]);
  assert.equal(report.sensitiveFieldRecords,1);
  assert.equal(JSON.stringify(report).includes('never-show-this'),false);
});
