import {
  MAX_NEXUS_TAG_MAP_BYTES,
  parseNexusTagMapV1,
  type ParsedTagMap,
} from './nexus-tag-map';

export interface LocalJsonFile {
  size: number;
  text(): Promise<string>;
}

/**
 * Browser-only file handoff. Reject over-limit files before any bytes are
 * read; re-check the decoded text before returning the validated concept.
 * This helper does not call fetch, Firestore, a model or localStorage.
 */
export async function readLocalNexusTagMap(file: LocalJsonFile): Promise<ParsedTagMap> {
  if (!Number.isSafeInteger(file.size) || file.size < 1 ||
      file.size > MAX_NEXUS_TAG_MAP_BYTES) {
    throw new Error('Choose a nonempty JSON file no larger than 1 MiB.');
  }
  const raw = await file.text();
  return parseNexusTagMapV1(raw);
}
