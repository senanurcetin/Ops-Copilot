import test from 'node:test';
import assert from 'node:assert/strict';
import { readLocalNexusTagMap } from '../src/lib/nexus-tag-map-file';
import { MAX_NEXUS_TAG_MAP_BYTES } from '../src/lib/nexus-tag-map';

const valid = JSON.stringify({
  schema: 'nexus.industrial.tag-map.v1',
  version: 1,
  mode: 'read-only',
  evidence: 'local-human-reviewed-concept',
  generatedAt: '2026-10-17T10:00:00.000Z',
  source: { product: 'Vision2DCS', projectId: 'local-1', projectTitle: 'Test drawing' },
  tags: [{ tag: 'PT-101', description: 'Pressure', signalType: 'AI',
    pcs7BlockType: 'MonAnL', engineeringUnits: 'bar' }],
});

test('reads locally provided valid export without any network calls', async () => {
  let reads = 0;
  const output = await readLocalNexusTagMap({
    size: Buffer.byteLength(valid),
    async text() { reads++; return valid; },
  });
  assert.equal(reads, 1);
  assert.equal(output.tags[0].tag, 'PT-101');
  assert.equal(output.mode, 'read-only');
});

test('rejects oversized and empty input BEFORE reading potentially sensitive bytes', async () => {
  for (const size of [0, -1, MAX_NEXUS_TAG_MAP_BYTES + 1, Number.NaN, 0.5]) {
    let reads = 0;
    await assert.rejects(
      readLocalNexusTagMap({ size, async text() { reads++; return valid; } }),
      /nonempty JSON file no larger than 1 MiB/,
    );
    assert.equal(reads, 0);
  }
});

test('rejects invalid, mismatched and command-bearing exports, without persisting data', async () => {
  for (const text of [
    '{bad-json',
    JSON.stringify({ ...JSON.parse(valid), mode: 'write' }),
    JSON.stringify({ ...JSON.parse(valid), plcCommand: 'START_MOTOR' }),
  ]) {
    await assert.rejects(readLocalNexusTagMap({
      size: Buffer.byteLength(text),
      async text() { return text; },
    }));
  }
});

test('the local UI does not call fetch, Firestore, server actions, storage, or model API', () => {
  const source = require('node:fs').readFileSync(
    new URL('../src/app/developer-tools/nexus-tag-map/page.tsx', import.meta.url), 'utf8',
  );
  assert.doesNotMatch(source, /\bfetch\s*\(|\baddDoc\s*\(|\blocalStorage\b|\bsessionStorage\b|\bhandleUserMessage\s*\(/);
  assert.match(source, /readLocalNexusTagMap\(file\)/);
  assert.match(source, /role="alert"/);
});
