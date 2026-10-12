import test from 'node:test';
import assert from 'node:assert/strict';
import { rankDocuments } from '../src/services/document-ranking';

const sampleDocuments = [
  {
    id: '1',
    title: 'S7-1200 System Fault',
    content: 'The SF LED indicates a system fault on the PLC CPU.',
  },
  {
    id: '2',
    title: 'Duplicate IP Address',
    content: 'Resolve duplicate IP conflicts by scanning the network in TIA Portal.',
  },
  {
    id: '3',
    title: 'PID Tuning Basics',
    content: 'PID tuning adjusts proportional, integral, and derivative parameters.',
  },
];

test('rankDocuments prioritizes exact title matches', () => {
  const results = rankDocuments(sampleDocuments, 'duplicate ip address');

  assert.equal(results[0]?.id, '2');
});

test('rankDocuments returns an empty array for non-meaningful queries', () => {
  const results = rankDocuments(sampleDocuments, 'a');

  assert.deepEqual(results, []);
});

test('rankDocuments limits the result set to five items', () => {
  const manyDocuments = Array.from({ length: 8 }, (_, index) => ({
    id: String(index),
    title: `Alarm ${index}`,
    content: 'alarm alarm alarm',
  }));

  const results = rankDocuments(manyDocuments, 'alarm');

  assert.equal(results.length, 5);
});


test('rankDocuments ignores whitespace and punctuation-only queries', () => {
  assert.deepEqual(rankDocuments(sampleDocuments, '   '), []);
  assert.deepEqual(rankDocuments(sampleDocuments, '?!.,:;'), []);
  assert.deepEqual(rankDocuments(sampleDocuments, 'x'), []);
});

test('rankDocuments does not mutate or reorder the source documents', () => {
  const before = structuredClone(sampleDocuments);
  const results = rankDocuments(sampleDocuments, 'system fault');

  assert.equal(results[0]?.id, '1');
  assert.deepEqual(sampleDocuments, before);
});

test('rankDocuments returns no results when no term is relevant', () => {
  assert.deepEqual(rankDocuments(sampleDocuments, 'hydraulic pressure'), []);
});

test('rankDocuments accepts case-insensitive exact title and content matches', () => {
  const results = rankDocuments(sampleDocuments, 'DUPLICATE IP ADDRESS');
  assert.equal(results[0]?.id, '2');
  assert.equal(results.length, 1);
});

test('rankDocuments counts a repeated query word only once', () => {
  const docs = [
    { id: 'a', title: 'PLC', content: 'controllers' },
    { id: 'b', title: 'Unrelated', content: 'PLC' },
  ];
  const normal = rankDocuments(docs, 'plc');
  const repeated = rankDocuments(docs, 'plc plc');

  assert.deepEqual(repeated.map((doc) => doc.id), normal.map((doc) => doc.id));
});

test('rankDocuments preserves input order for equal relevance scores', () => {
  const docs = [
    { id: 'a', title: 'Pump', content: 'motor diagnostics' },
    { id: 'b', title: 'Valve', content: 'motor diagnostics' },
    { id: 'c', title: 'Line', content: 'motor diagnostics' },
  ];
  assert.deepEqual(rankDocuments(docs, 'motor').map((doc) => doc.id), ['a', 'b', 'c']);
});

test('rankDocuments handles an empty document corpus', () => {
  assert.deepEqual(rankDocuments([], 'system fault'), []);
});
