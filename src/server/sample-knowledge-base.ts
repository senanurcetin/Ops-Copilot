/**
 * Pure validation and Firestore write-budget planning for the bundled demo KB.
 *
 * This code has no Firebase/network dependency, so destructive replacement
 * decisions can be regression-tested without credentials or live user data.
 */
export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
}

export const FIRESTORE_BATCH_WRITE_LIMIT = 500;
const MAX_SAMPLE_DOCUMENTS = 500;
const DOCUMENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function parseSampleKnowledgeBase(raw: string): KnowledgeDocument[] {
  const decoded: unknown = JSON.parse(raw);
  if (!Array.isArray(decoded) || decoded.length === 0 || decoded.length > MAX_SAMPLE_DOCUMENTS) {
    throw new Error('Sample knowledge base must be a nonempty, bounded array.');
  }

  const ids = new Set<string>();
  const documents: KnowledgeDocument[] = [];
  for (const entry of decoded) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error('Sample knowledge base contains a malformed document.');
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== 'string' || !DOCUMENT_ID.test(record.id)
      || typeof record.title !== 'string' || !record.title.trim()
      || typeof record.content !== 'string' || !record.content.trim()) {
      throw new Error('Sample knowledge base contains invalid document fields.');
    }
    if (ids.has(record.id)) {
      throw new Error('Sample knowledge base contains duplicate document IDs.');
    }
    ids.add(record.id);
    // Copy only known fields; do not persist arbitrary JSON keys.
    documents.push({ id: record.id, title: record.title, content: record.content });
  }
  return documents;
}

/**
 * Existing matching IDs are overwritten in a single batch, not deleted first.
 * Only absent IDs require a delete. The entire write set must fit in one
 * Firestore batch; otherwise fail BEFORE touching the existing knowledge base.
 */
export function planKnowledgeBaseReplacement(
  existingIds: readonly string[],
  incoming: readonly KnowledgeDocument[],
): { obsoleteIds: string[]; writeCount: number } {
  if (incoming.length === 0) {
    throw new Error('Cannot replace a knowledge base with an empty document set.');
  }
  const newIds = new Set(incoming.map(doc => doc.id));
  if (newIds.size !== incoming.length) {
    throw new Error('Duplicate IDs cannot be used in a knowledge-base replacement.');
  }
  const obsoleteIds = existingIds.filter(id => !newIds.has(id));
  const writeCount = obsoleteIds.length + incoming.length;
  if (writeCount > FIRESTORE_BATCH_WRITE_LIMIT) {
    throw new Error('Knowledge-base replacement exceeds the atomic Firestore batch limit.');
  }
  return { obsoleteIds, writeCount };
}
