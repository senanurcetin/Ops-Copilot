import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = (relative) => readFileSync(new URL(relative, root), 'utf8');

const internalModules = [
  'src/services/vector-store.ts',
  'src/ai/flows/initial-knowledge-base-setup.ts',
  'src/ai/flows/obtain-answers-from-documents.ts',
  'src/ai/flows/receive-concise-answers.ts',
];

// A module-level "use server" directive exposes exported async functions as
// Server Actions; several helpers accept a caller-selected user ID or context.
// Keep these helpers internal to the authenticated action entry points.
for (const relative of internalModules) {
  test(`internal helper is not a remotely callable Server Action: ${relative}`, () => {
    const content = read(relative);
    assert.doesNotMatch(content, /^\s*['"]use server['"];?\s*$/m);
    assert.match(content, /export\s+(?:async\s+)?function\s+/);
  });
}

test('authenticated application actions keep the public server action boundary', () => {
  const actions = read('src/app/actions.ts');
  assert.match(actions, /^['"]use server['"];?\s*$/m);
  assert.match(actions, /requireCurrentSessionUser\(/);
});

test('Genkit local dev still imports internal flow modules', () => {
  const dev = read('src/ai/dev.ts');
  for (const name of [
    'initial-knowledge-base-setup',
    'receive-concise-answers',
    'obtain-answers-from-documents',
  ]) {
    assert.ok(dev.includes(name), `Missing flow registration: ${name}`);
  }
});
