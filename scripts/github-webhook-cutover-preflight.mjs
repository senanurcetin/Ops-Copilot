const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODES = new Set(['legacy', 'dual_anchor', 'unknown']);
const MAX_IDS = 10000;
const MAX_WRITERS = 100;

/**
 * Pure, bounded, read-only cutover preflight for EXPLICITLY SUPPLIED samples.
 *
 * Inputs are document IDs and manually declared writer modes. It never scans
 * Firestore, accesses GitHub, enables TTL, migrates records, or changes an
 * ingestion adapter. Caller attestations are not independently verified.
 *
 * A matching sample cannot establish production completeness or permission
 * to delete legacy records; productionReleaseAuthorized is ALWAYS false.
 */
export function assessWebhookCutoverSnapshot({
  outboxIds, anchorIds, writerModes,
  historicalInventoryAttested = false,
  writerInventoryAttested = false,
} = {}) {
  if (!Array.isArray(outboxIds) || !Array.isArray(anchorIds) ||
      !Array.isArray(writerModes) ||
      outboxIds.length > MAX_IDS || anchorIds.length > MAX_IDS ||
      writerModes.length > MAX_WRITERS ||
      typeof historicalInventoryAttested !== 'boolean' ||
      typeof writerInventoryAttested !== 'boolean') {
    throw new Error('Invalid bounded webhook cutover inventory.');
  }

  function indexIds(ids) {
    const seen = new Set();
    for (const id of ids) {
      // Preserve exact Firestore document identity. Never lower-case stored
      // IDs for lookup: an existing uppercase document may be distinct.
      if (typeof id !== 'string' || !GUID.test(id) || seen.has(id)) {
        throw new Error('Invalid or duplicate webhook document identifier.');
      }
      seen.add(id);
    }
    return seen;
  }
  const works = indexIds(outboxIds);
  const anchors = indexIds(anchorIds);
  if (!writerModes.every(mode => typeof mode === 'string' && MODES.has(mode))) {
    throw new Error('Invalid webhook writer inventory.');
  }

  const variants = new Map();
  for (const id of new Set([...works, ...anchors])) {
    const key = id.toLowerCase();
    if (!variants.has(key)) variants.set(key, new Set());
    variants.get(key).add(id);
  }
  const caseVariantCollisionGroups = [...variants.values()]
    .filter(set => set.size > 1).length;
  const mixedCaseWorkCount = [...works].filter(id => id !== id.toLowerCase()).length;
  const mixedCaseAnchorCount = [...anchors].filter(id => id !== id.toLowerCase()).length;
  const missingAnchorCount = [...works].filter(id => !anchors.has(id)).length;
  const anchorWithoutWorkCount = [...anchors].filter(id => !works.has(id)).length;
  const legacyWriterCount = writerModes.filter(mode => mode === 'legacy').length;
  const unknownWriterCount = writerModes.filter(mode => mode === 'unknown').length;

  const blockers = [];
  if (works.size === 0) blockers.push('empty_outbox_snapshot');
  if (writerModes.length === 0) blockers.push('empty_writer_inventory');
  if (!historicalInventoryAttested) blockers.push('historical_scope_unattested');
  if (!writerInventoryAttested) blockers.push('writer_scope_unattested');
  if (missingAnchorCount > 0) blockers.push('missing_exact_guid_anchor');
  if (caseVariantCollisionGroups > 0) blockers.push('case_variant_collision');
  if (mixedCaseWorkCount + mixedCaseAnchorCount > 0) {
    blockers.push('historical_mixed_case_guid');
  }
  if (legacyWriterCount > 0) blockers.push('legacy_writers_present');
  if (unknownWriterCount > 0) blockers.push('unknown_writers_present');

  const observedSampleInvariantsPass = blockers.length === 0;
  // Always block a production release, even if user-supplied attestations
  // claim completeness and no issues appear in the sample. This is NOT a
  // verified live census, writer inventory or owner's consent.
  return Object.freeze({
    outboxCount: works.size,
    anchorCount: anchors.size,
    writerCount: writerModes.length,
    missingAnchorCount,
    anchorWithoutWorkCount,
    mixedCaseWorkCount,
    mixedCaseAnchorCount,
    caseVariantCollisionGroups,
    legacyWriterCount,
    unknownWriterCount,
    historicalInventoryAttested,
    writerInventoryAttested,
    observedSampleInvariantsPass,
    blockers: Object.freeze(blockers),
    evidenceScope: 'caller-supplied-snapshot-not-live-production-census',
    productionReleaseAuthorized: false,
    ttlAllowed: false,
    deleteAllowed: false,
    backfillOrCutoverActivated: false,
    requiresIndependentOwnerApproval: true,
  });
}
