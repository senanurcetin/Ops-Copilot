const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const STATES = new Set(['queued', 'processing', 'completed', 'dead']);
const MAX_RECORDS = 10000;
const positive = n => Number.isSafeInteger(n) && n > 0;
const nonnegative = n => Number.isSafeInteger(n) && n >= 0;

/**
 * Pure, bounded, offline reconciliation assessment of caller-supplied legacy
 * Firestore documents. Do not confuse this report with a verified census.
 *
 * Every input is {documentId, data}, where data is an existing outbox record.
 * No Firestore SDK/client, network, credentials, collection scans or writes.
 * The report contains ONLY counts and fixed risk tags: never source IDs,
 * repository identities, tokens, payloads or a migration permission.
 *
 * An immutable-identity match does NOT authorize collapsing two work records:
 * they may have been processed independently with different external effects.
 */
export function assessWebhookGuidCaseReconciliation({
  documents, historicalScopeAttested = false,
} = {}) {
  if (!Array.isArray(documents) || documents.length > MAX_RECORDS ||
      typeof historicalScopeAttested !== 'boolean') {
    throw new Error('Invalid bounded GUID reconciliation input.');
  }
  const exactIds = new Set();
  const logicalGroups = new Map();
  let nonCanonicalDocumentCount = 0;
  for (const item of documents) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        typeof item.documentId !== 'string' || !GUID.test(item.documentId) ||
        exactIds.has(item.documentId) ||
        !item.data || typeof item.data !== 'object' || Array.isArray(item.data)) {
      throw new Error('Invalid or duplicate GUID reconciliation document.');
    }
    const data = item.data;
    if (data.deliveryId !== item.documentId ||
        data.event !== 'workflow_run' || data.action !== 'completed' ||
        !positive(data.installationId) || !positive(data.repositoryId) ||
        !positive(data.workflowRunId) ||
        typeof data.repository !== 'string' || !REPOSITORY.test(data.repository) ||
        data.repository.split('/').some(part => part === '.' || part === '..') ||
        !STATES.has(data.state) || !nonnegative(data.attempts) ||
        !positive(data.enqueuedAtMs)) {
      throw new Error('Invalid legacy GUID reconciliation record metadata.');
    }
    exactIds.add(item.documentId);
    const key = item.documentId.toLowerCase();
    if (item.documentId !== key) nonCanonicalDocumentCount++;
    const identity = [
      data.event, data.action, data.installationId,
      data.repositoryId, data.repository, data.workflowRunId,
    ];
    const member = {identity, state:data.state};
    if (!logicalGroups.has(key)) logicalGroups.set(key, []);
    logicalGroups.get(key).push(member);
  }

  let caseVariantGroups = 0;
  let affectedDocumentCount = 0;
  let potentialExtraWorkDocuments = 0;
  let conflictingIdentityGroups = 0;
  let divergentLifecycleGroups = 0;
  let inFlightCollisionGroups = 0;
  let terminalCollisionGroups = 0;
  for (const group of logicalGroups.values()) {
    if (group.length < 2) continue;
    caseVariantGroups++;
    affectedDocumentCount += group.length;
    potentialExtraWorkDocuments += group.length - 1;
    const canonicalIdentity = JSON.stringify(group[0].identity);
    if (group.some(item => JSON.stringify(item.identity) !== canonicalIdentity)) {
      conflictingIdentityGroups++;
    }
    if (group.some(item => item.state !== group[0].state)) {
      divergentLifecycleGroups++;
    }
    if (group.some(item => item.state === 'queued' || item.state === 'processing')) {
      inFlightCollisionGroups++;
    }
    if (group.every(item => item.state === 'completed' || item.state === 'dead')) {
      terminalCollisionGroups++;
    }
  }
  const blockers = [];
  if (documents.length === 0) blockers.push('empty_reconciliation_snapshot');
  if (!historicalScopeAttested) blockers.push('historical_scope_unattested');
  if (caseVariantGroups) blockers.push('case_variant_duplicate_documents');
  if (conflictingIdentityGroups) blockers.push('conflicting_immutable_work_identity');
  if (divergentLifecycleGroups) blockers.push('divergent_work_lifecycle');
  if (inFlightCollisionGroups) blockers.push('in_flight_case_variant_work');
  if (nonCanonicalDocumentCount) blockers.push('noncanonical_historical_guid');

  return Object.freeze({
    inputDocumentCount: documents.length,
    logicalGuidCount: logicalGroups.size,
    nonCanonicalDocumentCount,
    caseVariantGroups,
    affectedDocumentCount,
    potentialExtraWorkDocuments,
    conflictingIdentityGroups,
    divergentLifecycleGroups,
    inFlightCollisionGroups,
    terminalCollisionGroups,
    historicalScopeAttested,
    observedSampleConsistent: blockers.length === 0,
    blockers: Object.freeze(blockers),
    evidenceScope:'caller-supplied-record-snapshot-not-live-census',
    recommendedHandling:'manual-investigation-no-automatic-collapse',
    productionMigrationAuthorized:false,
    releaseAuthorized:false,
    ttlAllowed:false,
    deleteAllowed:false,
  });
}
