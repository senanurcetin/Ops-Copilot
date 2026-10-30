import test from 'node:test';
import assert from 'node:assert/strict';
import {
  csvCell, parseArgs, renderCsvReport,
} from '../scripts/github-actions-audit.mjs';
import {
  parseComparisonArgs, renderComparisonCsv,
} from '../scripts/github-actions-compare.mjs';

test('CSV cells escape quotes and flatten line breaks while retaining commas', () => {
  assert.equal(csvCell('one,"two"\nthree'), '"one,""two"" three"');
  assert.equal(csvCell(''), '""');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
  assert.equal(csvCell(0), '0');
  assert.throws(() => csvCell(Infinity), /finite numbers/);
});

test('CSV strings are protected against formula injection in spreadsheets', () => {
  for (const input of ['=1+1', '+SUM(1,2)', '-2+3', '@SUM(1)', '  =1+1', '\t=1+1']) {
    assert.ok(csvCell(input).startsWith('"\''), input);
  }
  assert.equal(csvCell('normal'), '"normal"');
});

test('auditor CSV format is exclusive with JSON and Markdown', () => {
  assert.deepEqual(parseArgs(['owner/repo', '--csv']), {
    repository: 'owner/repo', limit: 30, json: false, csv: true,
  });
  assert.throws(() => parseArgs(['owner/repo', '--csv', '--json']), /only one output format/);
  assert.throws(() => parseArgs(['owner/repo', '--markdown', '--csv']), /only one output format/);
});

test('comparison CSV format is exclusive with JSON and Markdown', () => {
  assert.deepEqual(parseComparisonArgs(['owner/one', 'owner/two', '--csv']), {
    repositories: ['owner/one', 'owner/two'], limit: 10,
    json: false, markdown: false, csv: true,
  });
  assert.throws(() => parseComparisonArgs(['owner/one', 'owner/two', '--json', '--csv']), /only one output format/);
});

test('single-repository CSV separates complete summary totals from workflow rows', () => {
  const csv = renderCsvReport({
    repository: 'owner/repo', inspected_runs: 1, total_matching_runs: 42,
    completed_jobs: 2, incomplete_jobs: 1, elapsed_job_minutes: 3.5,
    sample_warning: 'Only 1 of 42 runs, sampled', since: '2026-10-01',
    until: '2026-10-30', status: 'failure',
    metric_note: 'Sampled time, not billing',
    workflows: [{
      workflow_id: 123, name: '=HYPERLINK("https://example.invalid")',
      runs: 1, failures: 1, scheduled: 0,
      job_count: 2, incomplete_jobs: 1, elapsed_job_minutes: 3.5,
    }],
  });
  const lines = csv.trimEnd().split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^record_type,repository,workflow_id,workflow_name,runs/);
  assert.ok(lines[1].startsWith('"summary","owner/repo",,,,,,2,1,3.5,1,42,'));
  assert.ok(lines[1].includes('"Only 1 of 42 runs, sampled"'));
  assert.ok(lines[2].startsWith('"workflow","owner/repo",123,'));
  assert.ok(lines[2].includes('"\'=HYPERLINK(""https://example.invalid"")"'));
  assert.ok(lines[2].includes(',1,1,0,2,1,3.5,,,,')); // per-workflow incomplete count; no summary totals
  assert.ok(lines[2].includes('"Sampled time, not billing"'));
});

test('single-repository CSV keeps a summary when zero runs match', () => {
  const csv = renderCsvReport({
    repository: 'owner/empty', inspected_runs: 0, total_matching_runs: 0,
    completed_jobs: 0, incomplete_jobs: 0, elapsed_job_minutes: 0,
    sample_warning: null, metric_note: 'Not billed minutes', workflows: [],
  });
  const lines = csv.trimEnd().split('\n');
  assert.equal(lines.length, 2);
  assert.ok(lines[1].startsWith('"summary","owner/empty",,,,,,0,0,0,0,0,'));
  assert.ok(lines[1].includes('"Not billed minutes"'));
});

test('comparison CSV exports each repository with coverage and caution', () => {
  const csv = renderComparisonCsv({
    since: '2026-10-01', comparison_note: 'Not a normalized performance ranking',
    repositories: [
      { repository: 'owner/one', inspected_runs: 2, total_matching_runs: 99,
        failed_runs: 1, scheduled_runs: 0, completed_jobs: 2,
        incomplete_jobs: 0, elapsed_job_minutes: 3.5,
        sample_warning: 'Only 2 of 99 runs' },
      { repository: 'owner/two', inspected_runs: 0, total_matching_runs: 0,
        failed_runs: 0, scheduled_runs: 0, completed_jobs: 0,
        incomplete_jobs: 0, elapsed_job_minutes: 0, sample_warning: null },
    ],
  });
  const lines = csv.trimEnd().split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^repository,inspected_runs,total_matching_runs,failed_runs/);
  assert.ok(lines[1].startsWith('"owner/one",2,99,1,0,2,0,3.5,'));
  assert.ok(lines[1].includes('"Not a normalized performance ranking"'));
  assert.ok(lines[2].startsWith('"owner/two",0,0,0,0,0,0,0,'));
});
