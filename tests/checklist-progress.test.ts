import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertChecklistMatchesSource, parseChecklistProgress } from '../src/server/checklist-progress';

const valid = {
  documentId: 'manual-1',
  documentTitle: '  Pump inspection  ',
  completedSteps: ['  Lockout completed  ', 'Pressure verified'],
};

test('normalizes valid checklist progress and excludes extra fields', () => {
  assert.deepEqual(
    parseChecklistProgress({ ...valid, isAdmin: true }),
    { documentId: 'manual-1', documentTitle: 'Pump inspection',
      completedSteps: ['Lockout completed', 'Pressure verified'] },
  );
});

test('preserves empty step lists without inventing completion', () => {
  assert.deepEqual(parseChecklistProgress({ ...valid, completedSteps: [] }).completedSteps, []);
});

test('rejects invalid payload and document identifiers', () => {
  for (const input of [null, [], 'bad', {}, { ...valid, documentId: '' },
    { ...valid, documentId: '../user' },
    { ...valid, documentId: 'a'.repeat(129) }]) {
    assert.throws(() => parseChecklistProgress(input));
  }
});

test('rejects missing, blank or oversized titles', () => {
  for (const title of [null, ' ', 'x'.repeat(201)]) {
    assert.throws(() => parseChecklistProgress({ ...valid, documentTitle: title }));
  }
});

test('rejects malformed, duplicate and oversized completed steps', () => {
  for (const steps of [null, 'step', [12], [' '], ['a', ' a '],
    ['x'.repeat(1001)], Array.from({ length: 201 }, (_, i) => String(i))]) {
    assert.throws(() => parseChecklistProgress({ ...valid, completedSteps: steps }));
  }
});

test('accepts maximum supported title and step lengths', () => {
  const output = parseChecklistProgress({
    ...valid, documentTitle: 'x'.repeat(200),
    completedSteps: ['a'.repeat(1000)],
  });
  assert.equal(output.documentTitle.length, 200);
  assert.equal(output.completedSteps[0].length, 1000);
});

test('server action authenticates and validates before persisting a checklist', () => {
  const code = readFileSync(new URL('../src/app/actions.ts', import.meta.url), 'utf8');
  const action = code.split('export async function logChecklistProgress(')[1];
  assert.ok(action);
  const auth = action.indexOf('await requireCurrentSessionUser()');
  const validate = action.indexOf('parseChecklistProgress(input)');
  const persist = action.indexOf(".collection('checklistLogs')");
  assert.ok(auth >= 0 && validate > auth && persist > validate);
  assert.match(action, /completedStepCount: progress\.completedSteps\.length/);
});


test('checklist progress is verified against an existing workspace source', () => {
  const progress = parseChecklistProgress({
    documentId: 'manual-1',
    documentTitle: 'Pump inspection',
    completedSteps: ['Lockout completed'],
  });
  const source = { title: 'Pump inspection', content: '1. Lockout completed\n2. Pressure verified' };
  assert.doesNotThrow(() => assertChecklistMatchesSource(progress, source));
  assert.throws(() => assertChecklistMatchesSource(progress, null), /missing or has changed/);
  assert.throws(() => assertChecklistMatchesSource(progress, { ...source, title: 'Other pump' }), /missing or has changed/);
  assert.throws(() => assertChecklistMatchesSource(
    { ...progress, completedSteps: ['Bypass the safety interlock'] }, source
  ), /not present/);
  assert.throws(() => assertChecklistMatchesSource(
    { ...progress, completedSteps: ['Pressure verified externally'] }, source
  ), /not present/);
});

test('audit evidence is bound to the exact, immutable source content version', () => {
  const progress = parseChecklistProgress({
    documentId: 'manual-1', documentTitle: 'Pump inspection',
    completedSteps: ['Lockout completed'],
  });
  const original = { title: 'Pump inspection', content: '1. Lockout completed\\n2. Pressure verified' };
  const first = assertChecklistMatchesSource(progress, original);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first, assertChecklistMatchesSource(progress, original));
  assert.notEqual(first, assertChecklistMatchesSource(progress, {
    ...original, content: original.content + '\\n3. Record operator name',
  }));
  assert.notEqual(first, assertChecklistMatchesSource(progress, {
    ...original, title: 'Pump inspection'.replace('inspection', 'inspection').concat(' '),
  }));
});

test('checklist audit stores source fingerprint within the verified transaction', () => {
  const source = readFileSync(new URL('../src/app/actions.ts', import.meta.url), 'utf8');
  const action = source.split('export async function logChecklistProgress(')[1];
  assert.ok(action);
  const start = action.indexOf('await db.runTransaction(async transaction => {');
  const fingerprint = action.indexOf('const sourceSha256 = assertChecklistMatchesSource(');
  const write = action.indexOf('transaction.create(logRef, {');
  assert.ok(fingerprint > start && write > fingerprint);
  assert.match(action, /sourceSha256,\\s*sourceHashAlgorithm:/);
});

test('free prose cannot be submitted as a completed numbered checklist step', () => {
  const progress = parseChecklistProgress({
    documentId: 'manual-1',
    documentTitle: 'Pump inspection',
    completedSteps: ['Do not ignore alarms'],
  });
  assert.throws(() => assertChecklistMatchesSource(progress, {
    title: 'Pump inspection',
    content: 'Safety: Do not ignore alarms\n1. Isolate power',
  }), /not present/);
});

test('authenticated checklist action fetches current user-owned evidence before logging', () => {
  const code = readFileSync(new URL('../src/app/actions.ts', import.meta.url), 'utf8');
  const action = code.split('export async function logChecklistProgress(')[1];
  assert.ok(action);
  const read = action.indexOf('await transaction.get(sourceRef)');
  const verify = action.indexOf('assertChecklistMatchesSource(');
  const write = action.indexOf('transaction.create(logRef, {');
  assert.ok(read > 0 && verify > read && write > verify);
  assert.match(action, /sourceSnapshot\.exists/);
});


test('checklist inspector resets state on document identity changes and disables duplicate submissions', () => {
  const code = readFileSync(new URL('../src/components/context-inspector.tsx', import.meta.url), 'utf8');
  assert.match(code, /\[documentId, content\]/);
  assert.match(code, /if \(isLogging\) return;/);
  assert.match(code, /disabled=\{isLogging\}/);
  assert.match(code, /finally \{\s*setIsLogging\(false\)/);
});


test('checklist source verification and audit record creation are one Firestore transaction', () => {
  const code = readFileSync(new URL('../src/app/actions.ts', import.meta.url), 'utf8');
  const action = code.split('export async function logChecklistProgress(')[1];
  assert.ok(action);
  const transactionStart = action.indexOf('await db.runTransaction(async transaction => {');
  const read = action.indexOf('await transaction.get(sourceRef)');
  const verify = action.indexOf('assertChecklistMatchesSource(');
  const write = action.indexOf('transaction.create(logRef, {');
  assert.ok(transactionStart > 0 && read > transactionStart);
  assert.ok(verify > read && write > verify);
  assert.doesNotMatch(action, /await sourceRef\.get\(/);
  assert.doesNotMatch(action, /\.collection\('checklistLogs'\)\s*\.add\(/);
});
