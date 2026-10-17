import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifiedKeyQuote } from '../src/services/source-evidence';

const docs = [
  { title: 'Valve shutdown', content: 'Close the discharge valve before starting the mixer.' },
  { title: 'Motor status', content: 'Reset the fault indicator only after isolation.' },
];

test('accepts only verbatim quotations from retrieved context', () => {
  assert.equal(verifiedKeyQuote(docs, 'Close the discharge valve'), 'Close the discharge valve');
  assert.equal(verifiedKeyQuote(docs, 'Motor status'), 'Motor status');
  assert.equal(verifiedKeyQuote(docs, '  Reset the fault indicator  '), 'Reset the fault indicator');
});

test('refuses unsupported text and documents not returned by retrieval', () => {
  assert.equal(verifiedKeyQuote(docs, 'Turn off all safety interlocks'), undefined);
  assert.equal(verifiedKeyQuote([docs[0]], 'Reset the fault indicator'), undefined);
  assert.equal(verifiedKeyQuote(docs, 'close the discharge valve'), undefined);
  assert.equal(verifiedKeyQuote(docs, ''), undefined);
  assert.equal(verifiedKeyQuote(docs, null), undefined);
});

test('rejects superficial single-character and two-character supporting quotes', () => {
  assert.equal(verifiedKeyQuote(docs, 'a'), undefined);
  assert.equal(verifiedKeyQuote(docs, 'to'), undefined);
  assert.equal(verifiedKeyQuote([{ title: 'PLC', content: 'PLC manual' }], 'PLC'), 'PLC');
});

test('rejects invisible, bidirectional and control-character evidence even when present in a source', () => {
  for (const injected of [
    'Valve\u202Eshutdown',
    'Motor\u200Bstatus',
    'Reset\nindicator',
    '\u2066PLC-101\u2069',
  ]) {
    const hostileDocs = [{ title: 'Reference', content: injected }];
    assert.equal(verifiedKeyQuote(hostileDocs, injected), undefined);
  }
});

test('does not emit oversized quotations or mutate the source', () => {
  const snapshot = structuredClone(docs);
  assert.equal(verifiedKeyQuote(docs, 'x'.repeat(501)), undefined);
  assert.deepEqual(docs, snapshot);
});

test('server action verifies the quote before returning it to the browser', () => {
  const code = readFileSync(new URL('../src/app/actions.ts', import.meta.url), 'utf8');
  assert.match(code, /keyQuote: verifiedKeyQuote\(relevantDocs, result\.keyQuote\)/);
  assert.doesNotMatch(code, /keyQuote: result\.keyQuote/);
});
