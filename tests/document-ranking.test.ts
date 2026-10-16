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

test('industrial Turkish terms are searchable even when mostly non-ASCII', () => {
  const docs = [
    { id: 'thermal', title: 'Isı kontrolü', content: 'Sıcaklık sensörü alarmı' },
    { id: 'lamp', title: 'Işık arızası', content: 'İkaz lambasını kontrol edin.' },
    { id: 'unrelated', title: 'Sevkiyat', content: 'Üretim takvimi' },
  ];
  assert.equal(rankDocuments(docs, 'ısı')[0]?.id, 'thermal');
  assert.equal(rankDocuments(docs, 'ışık')[0]?.id, 'lamp');
  assert.equal(rankDocuments(docs, 'ISI')[0]?.id, 'thermal');
});

test('decomposed accents and punctuation preserve word boundaries', () => {
  const docs = [
    { id: 'fault', title: 'Motor - S7-1200 arıza prosedürü', content: 'Bölüm 3' },
    { id: 'other', title: 'Bakım', content: 'Hidrolik basınç' },
  ];
  assert.equal(rankDocuments(docs, 's7-1200')[0]?.id, 'fault');
  assert.equal(rankDocuments(docs, 'Motor—S7-1200')[0]?.id, 'fault');
  assert.equal(rankDocuments(docs, 'arıza')[0]?.id, 'fault');
  assert.deepEqual(rankDocuments(docs, '?!;'), []);
});

test('normalization remains order-stable and does not mutate source strings', () => {
  const docs = [
    { id: 'a', title: 'Isı', content: 'PLC' },
    { id: 'b', title: 'ISI', content: 'PLC' },
  ];
  const before = structuredClone(docs);
  assert.deepEqual(rankDocuments(docs, 'ısı').map(doc => doc.id), ['a', 'b']);
  assert.deepEqual(docs, before);
});

test('rankDocuments rejects substring-only matches for distinct equipment IDs', () => {
  const docs = [
    { id: 'wrong', title: 'PLC-12001 fault', content: 'Only PLC-12001 applies.' },
    { id: 'correct', title: 'PLC-1200 fault', content: 'Follow the PLC-1200 checklist.' },
  ];
  const results = rankDocuments(docs, 'PLC-1200');
  assert.deepEqual(results.map(doc => doc.id), ['correct']);
});

test('rankDocuments does not mistake embedded words for a matching term', () => {
  const docs = [
    { id: 'partial', title: 'Subsystem diagnostics', content: 'Review the subsystem.' },
    { id: 'match', title: 'System diagnostics', content: 'Review the system.' },
  ];
  assert.deepEqual(rankDocuments(docs, 'system').map(doc => doc.id), ['match']);
});

test('rankDocuments retains partial matches for non-code descriptive questions', () => {
  const docs = [
    { id: 'general', title: 'Motor lubrication', content: 'Check the motor bearings.' },
  ];
  assert.deepEqual(rankDocuments(docs, 'motor vibration').map(doc => doc.id), ['general']);
});

test('rankDocuments does not splice tokens from two equipment IDs into a false match', () => {
  const docs = [
    { id: 'combined', title: 'S7-1500 and PLC-1200 diagnostics', content: 'Separate controller families.' },
    { id: 'exact', title: 'S7-1200 diagnostics', content: 'Check the SF fault LED.' },
  ];
  assert.deepEqual(rankDocuments(docs, 'S7-1200').map(doc => doc.id), ['exact']);
  assert.deepEqual(rankDocuments(docs, 'S7-1200 diagnostics').map(doc => doc.id), ['exact']);
});

test('rankDocuments permits code phrases in document content and ordinary partial prose matches', () => {
  const docs = [
    { id: 'manual', title: 'PLC fault guides', content: 'For S7-1200 check wiring and restart.' },
  ];
  assert.deepEqual(rankDocuments(docs, 'S7-1200 maintenance').map(doc => doc.id), ['manual']);
});


test('rankDocuments does not fabricate Siemens hexadecimal fault-code matches from separate tokens', () => {
  const docs = [
    { id: 'mismatch', title: 'Fault 16 report', content: 'See alarm 800D on a different system.' },
    { id: 'exact', title: 'Motion error 16#800D', content: 'Command interrupted by another motion command.' },
  ];
  assert.deepEqual(rankDocuments(docs, '16#800D').map(doc => doc.id), ['exact']);
  assert.deepEqual(rankDocuments(docs, 'What causes 16#800D?').map(doc => doc.id), ['exact']);
});

test('rankDocuments accepts the compound hex code appearing in the document body', () => {
  const docs = [
    { id: 'motion', title: 'S7-1500 motion', content: 'Error 16#800D means an interrupted command.' },
  ];
  assert.deepEqual(rankDocuments(docs, '16#800D').map(doc => doc.id), ['motion']);
});
