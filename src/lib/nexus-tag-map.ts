/**
 * Read-only, offline parser for manually exported Vision2DCS NEXUS Tag Map v1.
 * Does not grant permission to operate machinery, read live telemetry or send
 * a file to Firestore/Gemini. All incoming file contents are untrusted.
 */
export const TAG_MAP_SCHEMA = 'nexus.industrial.tag-map.v1' as const;
export const MAX_NEXUS_TAG_MAP_BYTES = 1024 * 1024;

export type ReadOnlyTag = Readonly<{
  tag: string;
  description: string;
  signalType: 'AI' | 'AO' | 'DI' | 'DO';
  pcs7BlockType: 'MonAnL' | 'MonDiL' | 'MotL' | 'VlvL' | 'VlvAnL' | 'PIDConL';
  engineeringUnits: string;
}>;

export type ParsedTagMap = Readonly<{
  schema: typeof TAG_MAP_SCHEMA;
  version: 1;
  mode: 'read-only';
  evidence: 'local-human-reviewed-concept';
  generatedAt: string;
  source: Readonly<{ product: 'Vision2DCS'; projectId: string; projectTitle: string }>;
  tags: ReadonlyArray<ReadOnlyTag>;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const allowed = (obj: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(obj).every(key => keys.includes(key));
const bounded = (v: unknown, maximum: number): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= maximum &&
  !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/u.test(v);

const SIGNAL = new Set(['AI', 'AO', 'DI', 'DO']);
const BLOCK = new Set(['MonAnL', 'MonDiL', 'MotL', 'VlvL', 'VlvAnL', 'PIDConL']);
const TAG = /^[A-Z]{1,4}-[0-9]{2,5}[A-Z]?$/;

export function parseNexusTagMapV1(raw: unknown): ParsedTagMap {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_NEXUS_TAG_MAP_BYTES) {
    throw new Error('NEXUS tag map must be a JSON file within 1 MiB.');
  }
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Invalid NEXUS tag-map JSON.'); }
  if (!isRecord(value) || !allowed(value, ['schema','version','mode','evidence','generatedAt','source','tags']) ||
      value.schema !== TAG_MAP_SCHEMA || value.version !== 1 || value.mode !== 'read-only' ||
      value.evidence !== 'local-human-reviewed-concept') {
    throw new Error('Unsupported or unsafe NEXUS tag-map contract.');
  }
  const generatedAt = value.generatedAt;
  if (typeof generatedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(generatedAt) ||
      Number.isNaN(Date.parse(generatedAt))) {
    throw new Error('Invalid tag-map export timestamp.');
  }
  const source = value.source;
  if (!isRecord(source) || !allowed(source, ['product','projectId','projectTitle']) ||
      source.product !== 'Vision2DCS' || !bounded(source.projectId, 128) ||
      !bounded(source.projectTitle, 500)) {
    throw new Error('Invalid tag-map project provenance.');
  }
  const rawTags = value.tags;
  if (!Array.isArray(rawTags) || rawTags.length === 0 || rawTags.length > 2000) {
    throw new Error('Tag-map instrument count is invalid.');
  }
  const seen = new Set<string>();
  const tags: ReadOnlyTag[] = rawTags.map((item: unknown) => {
    if (!isRecord(item) || !allowed(item, ['tag','description','signalType','pcs7BlockType','engineeringUnits']) ||
        typeof item.tag !== 'string' || !TAG.test(item.tag) ||
        typeof item.description !== 'string' || item.description.length > 1000 ||
        typeof item.engineeringUnits !== 'string' || item.engineeringUnits.length > 100 ||
        !SIGNAL.has(String(item.signalType)) || !BLOCK.has(String(item.pcs7BlockType))) {
      throw new Error('Invalid or unsafe tag-map instrument.');
    }
    if (seen.has(item.tag)) throw new Error('Duplicate NEXUS tag-map instrument.');
    seen.add(item.tag);
    return Object.freeze({
      tag: item.tag,
      description: item.description,
      signalType: item.signalType as ReadOnlyTag['signalType'],
      pcs7BlockType: item.pcs7BlockType as ReadOnlyTag['pcs7BlockType'],
      engineeringUnits: item.engineeringUnits,
    });
  });
  tags.sort((a, b) => a.tag.localeCompare(b.tag, 'en'));
  return Object.freeze({
    schema: TAG_MAP_SCHEMA, version: 1, mode: 'read-only',
    evidence: 'local-human-reviewed-concept',
    generatedAt,
    source: Object.freeze({
      product: 'Vision2DCS',
      projectId: source.projectId,
      projectTitle: source.projectTitle,
    }),
    tags: Object.freeze(tags),
  });
}
