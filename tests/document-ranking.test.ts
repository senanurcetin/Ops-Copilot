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
