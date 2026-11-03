/**
 * Machine-readable evidence for one actual localhost emulator recovery test.
 * The caller must first ASSERT successful replay, durable work identity and
 * lack of false write acknowledgement. Passing flags alone is not proof;
 * release authorizers must inspect the exact test and its CI run.
 */
export function formatSyntheticRecoveryEvidence({
  replayVerificationMs, disconnectedWriteUnacknowledged,
  durableWorkVerified, duplicateReplayRejected,
} = {}) {
  if (!Number.isSafeInteger(replayVerificationMs) ||
      replayVerificationMs < 0 || replayVerificationMs > 45000 ||
      disconnectedWriteUnacknowledged !== true ||
      durableWorkVerified !== true ||
      duplicateReplayRejected !== true) {
    throw new Error('Invalid synthetic recovery evidence.');
  }
  return Object.freeze({
    kind:'synthetic-webhook-recovery-v1',
    environment:'demo-nexus-ops-isolation-localhost',
    scenario:'tcp-proxy-disconnect-kill-new-client-replay',
    sampleCount:1,
    measuredReplayVerificationMs:replayVerificationMs,
    disconnectedWriteUnacknowledged:true,
    durableWorkVerified:true,
    duplicateReplayRejected:true,
    measuredProductionRTO:false,
    measuredProductionRPO:false,
    measuredStagingRollback:false,
    productionReleaseAuthorized:false,
  });
}
