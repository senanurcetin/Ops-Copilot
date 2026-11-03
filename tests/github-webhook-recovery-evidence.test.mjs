import test from 'node:test';
import assert from 'node:assert/strict';
import {formatSyntheticRecoveryEvidence} from '../scripts/github-webhook-recovery-evidence.mjs';

const valid=()=>({
  replayVerificationMs:1234,
  disconnectedWriteUnacknowledged:true,
  durableWorkVerified:true,
  duplicateReplayRejected:true,
});

test('synthetic recovery evidence is stable, redacted, aggregate-only and explicitly nonproduction',()=>{
  const evidence=formatSyntheticRecoveryEvidence(valid());
  assert.equal(evidence.kind,'synthetic-webhook-recovery-v1');
  assert.equal(evidence.environment,'demo-nexus-ops-isolation-localhost');
  assert.equal(evidence.sampleCount,1);
  assert.equal(evidence.measuredReplayVerificationMs,1234);
  assert.equal(evidence.measuredProductionRTO,false);
  assert.equal(evidence.measuredProductionRPO,false);
  assert.equal(evidence.measuredStagingRollback,false);
  assert.equal(evidence.productionReleaseAuthorized,false);
  assert.equal(Object.isFrozen(evidence),true);
});

test('one measurement is not automatically classified as service recovery SLO',()=>{
  const evidence=formatSyntheticRecoveryEvidence(valid());
  assert.equal('p95' in evidence,false);
  assert.equal('sla' in evidence,false);
  assert.equal('guid' in evidence,false);
  assert.equal('customer' in evidence,false);
});

test('missing or false safety assertions fail closed',()=>{
  for(const name of ['disconnectedWriteUnacknowledged','durableWorkVerified','duplicateReplayRejected']){
    for(const value of [false,undefined,1]){
      assert.throws(()=>formatSyntheticRecoveryEvidence({...valid(),[name]:value}),/Invalid synthetic recovery evidence/);
    }
  }
});

test('invalid timing and type fail closed instead of generating misleading metrics',()=>{
  for(const value of [undefined,null,-1,45001,NaN,Infinity,12.34,'12']){
    assert.throws(()=>formatSyntheticRecoveryEvidence({...valid(),replayVerificationMs:value}));
  }
  assert.equal(formatSyntheticRecoveryEvidence({...valid(),replayVerificationMs:0}).measuredReplayVerificationMs,0);
  assert.equal(formatSyntheticRecoveryEvidence({...valid(),replayVerificationMs:45000}).measuredReplayVerificationMs,45000);
});

test('unrecognized input and private tokens are never copied to output',()=>{
  const evidence=formatSyntheticRecoveryEvidence({
    ...valid(), deliveryId:'SECRET-GUID', token:'SECRET-PRIVATE-TOKEN',
    customer:'SECRET-CUSTOMER',
  });
  const serialized=JSON.stringify(evidence);
  for(const value of ['SECRET-GUID','SECRET-PRIVATE-TOKEN','SECRET-CUSTOMER']) {
    assert.equal(serialized.includes(value),false);
  }
});

test('invalid evidence errors never echo caller-provided secrets',()=>{
  assert.throws(()=>formatSyntheticRecoveryEvidence({
    ...valid(), replayVerificationMs:'PRIVATE-TOKEN',
  }),error=>error.message==='Invalid synthetic recovery evidence.');
});
