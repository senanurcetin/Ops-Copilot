import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

// Every unit test file must be listed in the npm scripts CI runs; a file that
// is not listed passes silently by never running. Emulator suites run in their
// own CI job through test:firestore:emulator.
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const files = readdirSync(new URL('./', import.meta.url))
  .filter(name => /\.test\.(?:ts|mjs)$/.test(name))
  .map(name => `tests/${name}`);

for (const script of ['test', 'test:ci', 'test:unit']) {
  test(`${script} runs every unit test file`, () => {
    const listed = new Set(pkg.scripts[script].split(/\s+/));
    const missing = files.filter(f => !f.includes('.emulator.') && !listed.has(f));
    assert.deepEqual(missing, []);
  });
}

test('test:firestore:emulator runs every emulator test file', () => {
  const listed = new Set(pkg.scripts['test:firestore:emulator'].split(/\s+/));
  const missing = files.filter(f => f.includes('.emulator.') && !listed.has(f));
  assert.deepEqual(missing, []);
});
