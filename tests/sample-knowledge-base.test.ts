import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FIRESTORE_BATCH_WRITE_LIMIT,
  MAX_SAMPLE_JSON_BYTES, MAX_SAMPLE_CONTENT_CHARS, MAX_SAMPLE_TITLE_CHARS,
  applyKnowledgeBaseReplacement,
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

test('parser distinguishes malformed JSON from invalid sample structure', () => {
  assert.throws(() => parseSampleKnowledgeBase('not json'), SyntaxError);
  for (const invalid of ['null', '{}', '[]', '[null]', '[23]']) {
    assert.throws(() => parseSampleKnowledgeBase(invalid), /Sample knowledge base/);
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

test('retry planning uses the latest transaction snapshot, not a stale deletion list', () => {
  const initial = planKnowledgeBaseReplacement(['a', 'stale'], documents);
  const retry = planKnowledgeBaseReplacement(['a', 'new-concurrent'], documents);
  assert.deepEqual(initial.obsoleteIds, ['stale']);
  assert.deepEqual(retry.obsoleteIds, ['new-concurrent']);
  assert.deepEqual(retry.writeCount, 3);
});

test('atomic adapter schedules obsolete deletes before incoming sets', () => {
  const actions: string[] = [];
  applyKnowledgeBaseReplacement(['a', 'obsolete', 'b'], documents, {
    deleteById: id => { actions.push('delete:' + id); },
    setDocument: doc => { actions.push('set:' + doc.id); },
  });
  assert.deepEqual(actions, ['delete:obsolete', 'set:a', 'set:b']);
});

test('atomic adapter does not mutate on empty, duplicate, or over-budget plans', () => {
  const actions: string[] = [];
  const writes = {
    deleteById: (id: string) => { actions.push('delete:' + id); },
    setDocument: (doc: { id: string }) => { actions.push('set:' + doc.id); },
  };
  assert.throws(() => applyKnowledgeBaseReplacement(['a'], [], writes), /empty/);
  assert.throws(() => applyKnowledgeBaseReplacement(['a'], [documents[0], documents[0]], writes), /Duplicate/);
  const ids = Array.from({ length: FIRESTORE_BATCH_WRITE_LIMIT }, (_, i) => 'old-' + i);
  assert.throws(() => applyKnowledgeBaseReplacement(ids, documents, writes), /batch limit/);
  assert.deepEqual(actions, [], 'No write may be scheduled if the plan fails validation');
});

test('atomic adapter uses the snapshot provided for each retry attempt', () => {
  const run = (ids: string[]) => {
    const actions: string[] = [];
    applyKnowledgeBaseReplacement(ids, documents, {
      deleteById: id => { actions.push('delete:' + id); },
      setDocument: doc => { actions.push('set:' + doc.id); },
    });
    return actions;
  };
  assert.deepEqual(run(['a', 'old']), ['delete:old', 'set:a', 'set:b']);
  assert.deepEqual(run(['a', 'concurrent']), ['delete:concurrent', 'set:a', 'set:b']);
});

test('sample replacement reads its Firestore snapshot before scheduling mutations', () => {
  const code = readFileSync(new URL('../src/services/vector-store.ts', import.meta.url), 'utf8');
  const fn = code.split('export async function replaceSampleDocuments(')[1]
    ?.split('export async function searchDocuments(')[0];
  assert.ok(fn, 'Expected sample replacement helper');
  assert.match(fn, /await db\.runTransaction\(async transaction =>/);
  assert.match(fn, /await transaction\.get\(collection\)/);
  assert.match(fn, /applyKnowledgeBaseReplacement\(/);
  assert.match(fn, /transaction\.delete\(/);
  assert.match(fn, /transaction\.set\(/);
  assert.doesNotMatch(fn, /await collection\.get\(|batch\.commit\(/);
  assert.ok(fn.indexOf('await transaction.get(collection)') < fn.indexOf('applyKnowledgeBaseReplacement('));
});


test('parser enforces title and content bounds before writing documents', () => {
  const document = { id: 'safe', title: 'T'.repeat(MAX_SAMPLE_TITLE_CHARS), content: 'X'.repeat(MAX_SAMPLE_CONTENT_CHARS) };
  assert.deepEqual(parseSampleKnowledgeBase(JSON.stringify([document])), [document]);
  assert.throws(() => parseSampleKnowledgeBase(JSON.stringify([{ ...document, title: 'T'.repeat(MAX_SAMPLE_TITLE_CHARS + 1) }])), /invalid document fields/);
  assert.throws(() => parseSampleKnowledgeBase(JSON.stringify([{ ...document, content: 'X'.repeat(MAX_SAMPLE_CONTENT_CHARS + 1) }])), /invalid document fields/);
});

test('parser rejects a byte-oversized fixture before JSON decoding or Firestore writes', () => {
  const oversized = 'x'.repeat(MAX_SAMPLE_JSON_BYTES + 1);
  assert.throws(() => parseSampleKnowledgeBase(oversized), /byte limit/);
  const boundary = JSON.stringify([{ id: 'd', title: 'valid', content: 'ok' }]);
  assert.ok(Buffer.byteLength(boundary, 'utf8') <= MAX_SAMPLE_JSON_BYTES);
  assert.equal(parseSampleKnowledgeBase(boundary)[0]?.id, 'd');
});
