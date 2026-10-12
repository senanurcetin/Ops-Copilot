import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseChecklistProgress } from '../src/server/checklist-progress';

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
