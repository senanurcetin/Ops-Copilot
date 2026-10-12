import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FIRESTORE_BATCH_WRITE_LIMIT,
  parseSampleKnowledgeBase,
  planKnowledgeBaseReplacement,
} from '../src/server/sample-knowledge-base';

const documents = [
  { id: 'a', title: 'A', content: 'Step A' },
  { id: 'b', title: 'B', content: 'Step B' },
];

test('bundled sample parses successfully without changing document fields', () => {
  const raw = readFileSync(new URL('../public/knowledge_base.json', import.meta.url), 'utf8');
  const parsed = parseSampleKnowledgeBase(raw);
  assert.ok(parsed.length > 0);
  assert.ok(parsed.every(doc => doc.id && doc.title && doc.content));
});

test('parser rejects missing, invalid or empty sample JSON', () => {
  for (const invalid of ['not json', 'null', '{}', '[]', '[null]', '[23]']) {
    assert.throws(() => parseSampleKnowledgeBase(invalid), { name: 'Error' });
  }
});

test('parser rejects missing text content and invalid document identifiers', () => {
  for (const changed of [
    { id: '', title: 'Title', content: 'Body' },
    { id: '../users/admin', title: 'Title', content: 'Body' },
    { id: 'ok', title: '', content: 'Body' },
    { id: 'ok', title: 'Title', content: ' ' },
  ]) {
    assert.throws(() => parseSampleKnowledgeBase(JSON.stringify([changed])));
  }
});

test('parser rejects duplicate document IDs rather than silently overwriting', () => {
  assert.throws(() => parseSampleKnowledgeBase(JSON.stringify([documents[0], documents[0]])), /duplicate/);
});

test('parser drops unknown properties rather than writing them to Firestore', () => {
  const parsed = parseSampleKnowledgeBase(JSON.stringify([{ ...documents[0], isAdmin: true }]));
  assert.deepEqual(parsed, [documents[0]]);
});

test('replacement plan overwrites overlapping IDs and only deletes obsolete IDs', () => {
  const plan = planKnowledgeBaseReplacement(['a', 'obsolete', 'b'], documents);
  assert.deepEqual(plan, { obsoleteIds: ['obsolete'], writeCount: 3 });
});

test('replacement with all matching IDs requires only one set per document', () => {
  assert.deepEqual(planKnowledgeBaseReplacement(['a', 'b'], documents), {
    obsoleteIds: [], writeCount: 2,
  });
});

test('replacement refuses an empty or duplicate-ID incoming set', () => {
  assert.throws(() => planKnowledgeBaseReplacement(['old'], []), /empty/);
  assert.throws(() => planKnowledgeBaseReplacement(['old'], [documents[0], documents[0]]), /Duplicate/);
});

test('replacement refuses an oversized batch before deleting any old records', () => {
  const previous = Array.from({ length: FIRESTORE_BATCH_WRITE_LIMIT }, (_, i) => 'old-' + i);
  assert.throws(() => planKnowledgeBaseReplacement(previous, documents), /batch limit/);
});

test('replacement allows exactly 500 writes at Firestore limit', () => {
  const old = Array.from({ length: FIRESTORE_BATCH_WRITE_LIMIT - documents.length },
    (_, i) => 'obsolete-' + i);
  const result = planKnowledgeBaseReplacement(old, documents);
  assert.equal(result.writeCount, FIRESTORE_BATCH_WRITE_LIMIT);
});

test('authenticated upload action uses validation and atomic replacement, not clear-then-ingest', () => {
  const code = readFileSync(new URL('../src/app/actions.ts', import.meta.url), 'utf8');
  const fn = code.split('export async function handleUploadManual()')[1]?.split('export async function logChecklistProgress')[0];
  assert.ok(fn, 'Expected upload handler');
  assert.match(fn, /requireCurrentSessionUser\(\)/);
  assert.match(fn, /parseSampleKnowledgeBase\(fileContent\)/);
  assert.match(fn, /replaceSampleDocuments\(sessionUser.uid, knowledgeBase\)/);
  assert.ok(fn.indexOf('parseSampleKnowledgeBase') < fn.indexOf('replaceSampleDocuments'));
  assert.doesNotMatch(fn, /clearDocuments/);
});
