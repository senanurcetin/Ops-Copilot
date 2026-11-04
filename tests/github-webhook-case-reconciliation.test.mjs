import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {assessWebhookGuidCaseReconciliation} from '../scripts/github-webhook-case-reconciliation.mjs';

const lower='711c17df-3579-4c49-a3f1-4becc101abcd';
const upper=lower.toUpperCase();
const second='8a7b1c2d-3579-4c49-a3f1-4becc101dcba';
const row=(id=lower, extra={})=>({
  documentId:id,
  data:{
    deliveryId:id, event:'workflow_run', action:'completed',
    installationId:11, repositoryId:42, repository:'example/private-repo',
    workflowRunId:765, state:'completed', attempts:1,
    enqueuedAtMs:1700000000000,...extra,
  },
});
const analyze=(documents, extra={})=>
  assessWebhookGuidCaseReconciliation({documents,historicalScopeAttested:true,...extra});

test('clean unique lowercase sample never authorizes production migration',()=>{
  const report=analyze([row(lower),row(second)]);
  assert.equal(report.inputDocumentCount,2);
  assert.equal(report.logicalGuidCount,2);
  assert.equal(report.caseVariantGroups,0);
  assert.equal(report.observedSampleConsistent,true);
  assert.equal(report.productionMigrationAuthorized,false);
  assert.equal(report.ttlAllowed,false);
  assert.equal(report.deleteAllowed,false);
  assert.equal(Object.isFrozen(report),true);
});

test('matching immutable identities do not authorize collapsing case variants',()=>{
  const report=analyze([row(lower),row(upper)]);
  assert.equal(report.caseVariantGroups,1);
  assert.equal(report.affectedDocumentCount,2);
  assert.equal(report.potentialExtraWorkDocuments,1);
  assert.equal(report.conflictingIdentityGroups,0);
  assert.equal(report.divergentLifecycleGroups,0);
  assert.equal(report.nonCanonicalDocumentCount,1);
  assert.equal(report.observedSampleConsistent,false);
  assert.equal(report.recommendedHandling,'manual-investigation-no-automatic-collapse');
  assert.ok(report.blockers.includes('case_variant_duplicate_documents'));
});

test('same logical GUID with different workflow run IDs flags identity conflict',()=>{
  const report=analyze([row(lower),row(upper,{workflowRunId:766})]);
  assert.equal(report.caseVariantGroups,1);
  assert.equal(report.conflictingIdentityGroups,1);
  assert.ok(report.blockers.includes('conflicting_immutable_work_identity'));
});

test('repository and installation mismatches count as immutable identity conflict',()=>{
  const report=analyze([
    row(lower),
    row(upper,{installationId:12,repositoryId:43,repository:'other/repo'}),
  ]);
  assert.equal(report.conflictingIdentityGroups,1);
});

test('divergent terminal state and processing in a case group block release',()=>{
  const report=analyze([
    row(lower,{state:'completed'}),
    row(upper,{state:'processing'}),
  ]);
  assert.equal(report.divergentLifecycleGroups,1);
  assert.equal(report.inFlightCollisionGroups,1);
  assert.equal(report.terminalCollisionGroups,0);
  assert.ok(report.blockers.includes('divergent_work_lifecycle'));
  assert.ok(report.blockers.includes('in_flight_case_variant_work'));
});

test('terminal completed/dead divergence remains a collision and requires review',()=>{
  const report=analyze([row(lower,{state:'completed'}),row(upper,{state:'dead'})]);
  assert.equal(report.terminalCollisionGroups,1);
  assert.equal(report.divergentLifecycleGroups,1);
  assert.equal(report.inFlightCollisionGroups,0);
});

test('single uppercase historical record is not declared fully reconciled',()=>{
  const report=analyze([row(upper)]);
  assert.equal(report.caseVariantGroups,0);
  assert.equal(report.nonCanonicalDocumentCount,1);
  assert.equal(report.observedSampleConsistent,false);
  assert.ok(report.blockers.includes('noncanonical_historical_guid'));
});

test('empty and unattested samples fail closed with fixed risk codes',()=>{
  const empty=analyze([]);
  assert.deepEqual(empty.blockers,['empty_reconciliation_snapshot']);
  const unattested=analyze([row(lower)],{historicalScopeAttested:false});
  assert.deepEqual(unattested.blockers,['historical_scope_unattested']);
  assert.equal(unattested.releaseAuthorized,false);
});

test('malformed UUID, exact duplicates and mismatched document identity are rejected',()=>{
  const cases=[
    [row('not-uuid')],[row(lower),row(lower)],
    [{...row(lower),documentId:upper}],
    [row(lower,{installationId:0})],
    [row(lower,{repository:'owner/..'})],
    [row(lower,{state:'unknown'})],
    [row(lower,{attempts:-1})],
  ];
  for(const documents of cases){
    assert.throws(()=>analyze(documents),/Invalid/);
  }
});

test('bounded inputs cannot grow unbounded or echo data in errors',()=>{
  assert.throws(()=>analyze(Array(10001).fill(row(lower))),/Invalid/);
  assert.throws(()=>assessWebhookGuidCaseReconciliation({
    documents:[row(lower)],historicalScopeAttested:'true',
  }),/Invalid/);
  assert.throws(()=>analyze([row(lower,{repository:'secret/../path'})]),
    error=>!error.message.includes('secret'));
});

test('reports redact GUIDs, immutable metadata and payloads without mutating input',()=>{
  const records=[
    row(lower,{secret:'never-report-this',payload:{token:'private-token'}}),
    row(upper,{secret:'never-report-this',workflowRunId:999}),
  ];
  const before=JSON.stringify(records);
  const report=analyze(records);
  const serialized=JSON.stringify(report);
  for(const value of [lower,upper,'example/private-repo','never-report-this','private-token']) {
    assert.equal(serialized.includes(value),false);
  }
  assert.equal(JSON.stringify(records),before);
  assert.equal(Object.isFrozen(report.blockers),true);
});

test('independent groups count only case collisions, not unrelated unique GUIDs',()=>{
  const other=randomUUID();
  const report=analyze([
    row(lower),row(upper),row(other,{state:'queued'}),
  ]);
  assert.equal(report.logicalGuidCount,2);
  assert.equal(report.caseVariantGroups,1);
  assert.equal(report.affectedDocumentCount,2);
  assert.equal(report.inFlightCollisionGroups,0);
});
