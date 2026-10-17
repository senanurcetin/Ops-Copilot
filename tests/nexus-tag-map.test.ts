import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNexusTagMapV1, MAX_NEXUS_TAG_MAP_BYTES } from '../src/lib/nexus-tag-map';

const valid = {
  schema: 'nexus.industrial.tag-map.v1', version: 1, mode: 'read-only',
  evidence: 'local-human-reviewed-concept',
  generatedAt: '2026-10-17T10:00:00.000Z',
  source: { product: 'Vision2DCS', projectId: 'p1', projectTitle: 'Pump diagram' },
  tags: [
    { tag: 'TT-102', description: 'Temperature', signalType: 'AI', pcs7BlockType: 'MonAnL', engineeringUnits: 'C' },
    { tag: 'PT-101', description: 'Pressure', signalType: 'AI', pcs7BlockType: 'MonAnL', engineeringUnits: 'bar' },
  ],
};

test('reads the v1 manual export contract as stable, immutable, read-only concept data', () => {
  const result = parseNexusTagMapV1(JSON.stringify(valid));
  assert.deepEqual(result.tags.map(t => t.tag), ['PT-101', 'TT-102']);
  assert.equal(result.mode, 'read-only');
  assert.equal(result.evidence, 'local-human-reviewed-concept');
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.tags));
  assert.ok(Object.isFrozen(result.tags[0]));
  assert.equal(result.source.projectTitle, 'Pump diagram');
});

test('fails closed on unsupported versions, commands, fabricated live data and malformed tags', () => {
  const cases = [
    { ...valid, version: 2 },
    { ...valid, mode: 'control-write' },
    { ...valid, controlCommand: 'OPEN_VALVE' },
    { ...valid, source: { ...valid.source, apiToken: 'secret' } },
    { ...valid, source: { ...valid.source, projectTitle: '' } },
    { ...valid, source: { ...valid.source, projectId: '../other-tenant' } },
    { ...valid, source: { ...valid.source, projectId: 'tenant/other' } },
    { ...valid, tags: [{ ...valid.tags[0], description: 'Hidden\u202Eoverride' }] },
    { ...valid, tags: [{ ...valid.tags[0], engineeringUnits: 'bad\u0000unit' }] },
    { ...valid, generatedAt: '2026-02-30T10:00:00.000Z' },
    { ...valid, tags: [{ ...valid.tags[0], setpoint: 999 }] },
    { ...valid, tags: [{ ...valid.tags[0], tag: 'BAD/101' }] },
    { ...valid, tags: [{ ...valid.tags[0], signalType: 'PLC_WRITE' }] },
    { ...valid, tags: [{ ...valid.tags[0], tag: 'TT-102' }, { ...valid.tags[0], tag: 'TT-102' }] },
    { ...valid, generatedAt: 'tomorrow' },
    { ...valid, tags: [] },
  ];
  for (const sample of cases) {
    assert.throws(() => parseNexusTagMapV1(JSON.stringify(sample)));
  }
});

test('rejects oversized, malformed and non-string inputs before accepting a map', () => {
  assert.throws(() => parseNexusTagMapV1('x'.repeat(MAX_NEXUS_TAG_MAP_BYTES + 1)), /1 MiB/);
  assert.throws(() => parseNexusTagMapV1('{malformed'), /Invalid.*JSON/);
  assert.throws(() => parseNexusTagMapV1(null), /1 MiB/);
});

test('ignores no extra instrument fields and never manufactures telemetry or controller status', () => {
  const report = parseNexusTagMapV1(JSON.stringify(valid));
  const serialized = JSON.stringify(report);
  for (const disallowed of ['connectedTo', 'setpoint', 'confidence', 'plcAddress', 'currentValue', 'apiKey']) {
    assert.equal(serialized.includes(disallowed), false);
  }
});
