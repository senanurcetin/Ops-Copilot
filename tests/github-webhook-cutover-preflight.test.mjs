import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {assessWebhookCutoverSnapshot} from '../scripts/github-webhook-cutover-preflight.mjs';

const first='711c17df-3579-4c49-a3f1-4becc101abcd';
const second='8a7b1c2d-3579-4c49-a3f1-4becc101dcba';
const req=(extra={})=>({
  outboxIds:[first,second],anchorIds:[first,second],
  writerModes:['dual_anchor','dual_anchor'],
  historicalInventoryAttested:true,writerInventoryAttested:true,
  ...extra,
});

test('a perfect synthetic snapshot passes sample invariants but never authorizes production',()=>{
  const report=assessWebhookCutoverSnapshot(req());
  assert.equal(report.observedSampleInvariantsPass,true);
  assert.deepEqual(report.blockers,[]);
  assert.equal(report.missingAnchorCount,0);
  assert.equal(report.caseVariantCollisionGroups,0);
  assert.equal(report.productionReleaseAuthorized,false);
  assert.equal(report.ttlAllowed,false);
  assert.equal(report.deleteAllowed,false);
  assert.equal(report.requiresIndependentOwnerApproval,true);
  assert.equal(Object.isFrozen(report),true);
  assert.equal(Object.isFrozen(report.blockers),true);
});

test('a partial or unattested sample is blocked even without observed anomalies',()=>{
  const report=assessWebhookCutoverSnapshot(req({
    historicalInventoryAttested:false,writerInventoryAttested:false,
  }));
  assert.equal(report.observedSampleInvariantsPass,false);
  assert.deepEqual(report.blockers,[
    'historical_scope_unattested','writer_scope_unattested',
  ]);
});

test('missing exact anchors are counted and prohibit a clean sample result',()=>{
  const report=assessWebhookCutoverSnapshot(req({anchorIds:[first]}));
  assert.equal(report.missingAnchorCount,1);
  assert.ok(report.blockers.includes('missing_exact_guid_anchor'));
  assert.equal(report.observedSampleInvariantsPass,false);
});

test('case-variant collision is detected across and within collections',()=>{
  const uppercase=first.toUpperCase();
  const report=assessWebhookCutoverSnapshot(req({
    outboxIds:[first,uppercase],anchorIds:[first],
  }));
  assert.equal(report.caseVariantCollisionGroups,1);
  assert.equal(report.mixedCaseWorkCount,1);
  assert.equal(report.missingAnchorCount,1);
  assert.ok(report.blockers.includes('case_variant_collision'));
  assert.ok(report.blockers.includes('historical_mixed_case_guid'));
});

test('same exact uppercase legacy ID remains unsafe even if exact anchor exists',()=>{
  const uppercase=second.toUpperCase();
  const report=assessWebhookCutoverSnapshot(req({
    outboxIds:[uppercase],anchorIds:[uppercase],
  }));
  assert.equal(report.missingAnchorCount,0);
  assert.equal(report.caseVariantCollisionGroups,0);
  assert.equal(report.mixedCaseWorkCount,1);
  assert.equal(report.mixedCaseAnchorCount,1);
  assert.equal(report.observedSampleInvariantsPass,false);
});

test('old and unknown writers independently block the cutover sample',()=>{
  const report=assessWebhookCutoverSnapshot(req({
    writerModes:['legacy','dual_anchor','unknown'],
  }));
  assert.equal(report.legacyWriterCount,1);
  assert.equal(report.unknownWriterCount,1);
  assert.ok(report.blockers.includes('legacy_writers_present'));
  assert.ok(report.blockers.includes('unknown_writers_present'));
});

test('orphaned permanent anchors are informational and never release TTL',()=>{
  const orphan=randomUUID();
  const report=assessWebhookCutoverSnapshot(req({
    anchorIds:[first,second,orphan],
  }));
  assert.equal(report.anchorWithoutWorkCount,1);
  assert.equal(report.observedSampleInvariantsPass,true);
  assert.equal(report.ttlAllowed,false);
});

test('empty snapshots and empty writer list are blocked',()=>{
  const report=assessWebhookCutoverSnapshot(req({
    outboxIds:[],anchorIds:[],writerModes:[],
  }));
  assert.ok(report.blockers.includes('empty_outbox_snapshot'));
  assert.ok(report.blockers.includes('empty_writer_inventory'));
  assert.equal(report.observedSampleInvariantsPass,false);
});

test('rejects malformed, repeated and over-limit identifiers without echoing them',()=>{
  const secret='secret-not-for-output';
  for(const args of [
    req({outboxIds:[first,first]}),
    req({outboxIds:[secret]}),
    req({anchorIds:['../../secrets']}),
    req({writerModes:['write_everything']}),
    req({historicalInventoryAttested:'true'}),
    req({outboxIds:Array(10001).fill(first)}),
    req({writerModes:Array(101).fill('dual_anchor')}),
  ]){
    assert.throws(()=>assessWebhookCutoverSnapshot(args),error=>
      !error.message.includes(secret) && !error.message.includes(first));
  }
});

test('preflight output never contains source GUIDs or writer identities',()=>{
  const record=assessWebhookCutoverSnapshot(req());
  const json=JSON.stringify(record);
  assert.equal(json.includes(first),false);
  assert.equal(json.includes(second),false);
  assert.equal(json.includes('dual_anchor'),false);
  assert.equal(record.evidenceScope,'caller-supplied-snapshot-not-live-production-census');
});
