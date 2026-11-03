const STATES = new Set(['queued', 'processing', 'completed', 'dead']);
const DELIVERY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86400000;
const SENSITIVE_KEYS = new Set([
  'payload', 'rawbody', 'token', 'authorization', 'secret',
  'privatekey', 'headers', 'webhooksecret', 'accesskey',
]);
const safeNonnegative = value => Number.isSafeInteger(value) && value >= 0;
const safePositive = value => Number.isSafeInteger(value) && value > 0;

/**
 * Analyze a caller-supplied, size-bounded snapshot of webhook outbox records.
 * This is pure/offline: no Firestore client, network call or cloud read is
 * performed. Callers must explicitly collect authorized data elsewhere.
 *
 * Byte counts measure serialized JSON UTF-8 only. They are NOT Firestore
 * billed storage, index bytes, document-name overhead, or monetary costs.
 * A partial snapshot is NOT a whole-collection census.
 */
export function analyzeWebhookRetentionSnapshot(records, {
  nowMs = Date.now(),
  maxRecords = 10000,
  minCompactionAgeMs = 7 * DAY_MS,
  expectedDailyDeliveries = null,
  reviewBudgetJsonBytes = null,
} = {}) {
  if (!Array.isArray(records) || !safePositive(maxRecords) ||
      maxRecords > 100000 || records.length > maxRecords ||
      !safePositive(nowMs) ||
      !safePositive(minCompactionAgeMs) ||
      minCompactionAgeMs < DAY_MS || minCompactionAgeMs > 365 * DAY_MS ||
      (expectedDailyDeliveries !== null &&
       (!safeNonnegative(expectedDailyDeliveries) || expectedDailyDeliveries > 1000000)) ||
      (reviewBudgetJsonBytes !== null && !safePositive(reviewBudgetJsonBytes))) {
    throw new Error('Invalid bounded webhook retention snapshot input.');
  }

  const seen = new Set();
  const byState = {queued: 0, processing: 0, completed: 0, dead: 0};
  let serializedJsonBytes = 0;
  let anchorJsonBytes = 0;
  let compactedCount = 0;
  let eligibleCompletedCount = 0;
  let sensitiveFieldRecords = 0;
  for (const record of records) {
    if (!record || typeof record !== 'object' || Array.isArray(record) ||
        typeof record.deliveryId !== 'string' ||
        !DELIVERY_ID.test(record.deliveryId) ||
        seen.has(record.deliveryId.toLowerCase()) ||
        !STATES.has(record.state) ||
        !safePositive(record.enqueuedAtMs) ||
        record.enqueuedAtMs > nowMs ||
        !safeNonnegative(record.attempts)) {
      throw new Error('Invalid or duplicate webhook retention snapshot record.');
    }
    seen.add(record.deliveryId.toLowerCase());
    if (record.retentionClass !== undefined &&
        record.retentionClass !== 'dedup_anchor_v1') {
      throw new Error('Unsupported webhook retention class.');
    }
    if (record.retentionClass === 'dedup_anchor_v1' &&
        (record.state !== 'completed' || !safePositive(record.completedAtMs) ||
         record.completedAtMs > nowMs)) {
      throw new Error('Invalid webhook deduplication anchor.');
    }
    if (record.state === 'completed' &&
        (!safePositive(record.completedAtMs) || record.completedAtMs > nowMs)) {
      throw new Error('Invalid webhook completion timestamp.');
    }
    let serialized;
    try { serialized = JSON.stringify(record); }
    catch { throw new Error('Webhook retention record is not JSON serializable.'); }
    if (typeof serialized !== 'string') {
      throw new Error('Webhook retention record is not JSON serializable.');
    }
    const bytes = Buffer.byteLength(serialized, 'utf8');
    if (!safeNonnegative(bytes) || !Number.isSafeInteger(serializedJsonBytes + bytes)) {
      throw new Error('Webhook retention byte total exceeds safe range.');
    }
    serializedJsonBytes += bytes;
    byState[record.state] += 1;

    if (record.retentionClass === 'dedup_anchor_v1') {
      compactedCount += 1;
      anchorJsonBytes += bytes;
    } else if (record.state === 'completed' &&
               nowMs - record.completedAtMs >= minCompactionAgeMs) {
      eligibleCompletedCount += 1;
    }
    if (Object.keys(record).some(key =>
      SENSITIVE_KEYS.has(key.toLowerCase().replace(/[-_]/g, '')))) {
      sensitiveFieldRecords += 1;
    }
  }
  const averageAnchorJsonBytes = compactedCount > 0
    ? Math.ceil(anchorJsonBytes / compactedCount) : null;
  const predictedNewJsonBytesPerDay = averageAnchorJsonBytes !== null &&
    expectedDailyDeliveries !== null
    ? averageAnchorJsonBytes * expectedDailyDeliveries : null;
  if (predictedNewJsonBytesPerDay !== null &&
      !Number.isSafeInteger(predictedNewJsonBytesPerDay * 365 + serializedJsonBytes)) {
    throw new Error('Webhook retention forecast exceeds safe range.');
  }
  const predictedAdditionalJsonBytes365d = predictedNewJsonBytesPerDay === null
    ? null : predictedNewJsonBytesPerDay * 365;
  const thresholdExceeded = reviewBudgetJsonBytes === null
    ? null : serializedJsonBytes >= reviewBudgetJsonBytes;
  return Object.freeze({
    recordCount: records.length,
    byState: Object.freeze(byState),
    serializedJsonBytes,
    compactedCount,
    eligibleCompletedCount,
    sensitiveFieldRecords,
    averageAnchorJsonBytes,
    expectedDailyDeliveries,
    predictedNewJsonBytesPerDay,
    predictedAdditionalJsonBytes365d,
    reviewBudgetJsonBytes,
    thresholdExceeded,
    measurement: 'sampled-serialized-json-utf8-not-firestore-billed-storage',
    safePolicy: Object.freeze({
      deleteDocuments: false,
      enableFirestoreTtl: false,
      preserveDeliveryGuidAnchors: true,
      compactionRequiresOperatorApproval: true,
      ownerRetentionApprovalStillRequired: true,
    }),
  });
}
