import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseArgs } from '../scripts/github-actions-audit.mjs';
import { parseComparisonArgs } from '../scripts/github-actions-compare.mjs';
import { saveNewReportFile, validateReportPath } from '../scripts/actions-report-file.mjs';

test('explicit export requires one machine-readable output format', () => {
  assert.deepEqual(parseArgs(['owner/repo', '--csv', '--output-file', 'audit.csv']), {
    repository: 'owner/repo', limit: 30, json: false, csv: true, outputFile: 'audit.csv',
  });
  assert.deepEqual(parseComparisonArgs(['a/one', 'b/two', '--json', '--output-file', 'compare.json']), {
    repositories: ['a/one', 'b/two'], limit: 10, json: true,
    markdown: false, outputFile: 'compare.json',
  });
  for (const parse of [
    args => parseArgs(['owner/repo', ...args]),
    args => parseComparisonArgs(['a/one', 'b/two', ...args]),
  ]) {
    assert.throws(() => parse(['--output-file', 'output.json']), /requires --json, --markdown or --csv/);
    assert.throws(() => parse(['--json', '--output-file']), /requires a nonempty file path/);
    assert.throws(() => parse(['--csv', '--output-file', '--limit', '5']), /requires a nonempty file path/);
    assert.throws(() => parse(['--csv', '--output-file', 'one', '--output-file', 'two']), /Repeated option/);
    assert.throws(() => parse(['--json', '--csv', '--output-file', 'result']), /only one output format/);
  }
  assert.throws(() => validateReportPath('directory/'), /nonempty file path/);
});

test('new report writer creates a file and refuses to overwrite existing content', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ops-report-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const destination = join(dir, 'audit.csv');
  const saved = await saveNewReportFile(destination, 'safe,report\n');
  assert.equal(saved, destination);
  assert.equal(await readFile(destination, 'utf8'), 'safe,report\n');
  await assert.rejects(
    () => saveNewReportFile(destination, 'REPLACE'),
    { code: 'EEXIST' },
  );
  assert.equal(await readFile(destination, 'utf8'), 'safe,report\n');
  if (process.platform !== 'win32') {
    const details = await stat(destination);
    assert.equal(details.mode & 0o077, 0);
  }
});

test('writer does not invent parent folders or write to directories', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ops-report-no-parent-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await assert.rejects(
    () => saveNewReportFile(join(dir, 'missing', 'output.json'), '{}\n'),
    { code: 'ENOENT' },
  );
  await assert.rejects(
    () => saveNewReportFile(dir, 'contents'),
  );
});
