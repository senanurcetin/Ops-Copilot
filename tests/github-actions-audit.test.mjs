import test from 'node:test';
import assert from 'node:assert/strict';

import {
  auditRepository,
  jobDurationMinutes,
  parseArgs,
  renderMarkdownReport,
  summarizeRuns,
  validateSinceDate,
  validateRepository,
} from '../scripts/github-actions-audit.mjs';

const job = (started_at, completed_at) => ({ started_at, completed_at });

test('repository inputs are validated before constructing a URL', () => {
  assert.deepEqual(validateRepository('senanurcetin/Ops-Copilot'), ['senanurcetin', 'Ops-Copilot']);
  for (const value of ['invalid', 'a/b/c', '../repo', 'owner/..', 'a/b?x=1', 'a/b#fragment']) {
    assert.throws(() => validateRepository(value));
  }
});

test('CLI accepts explicit sample limits and JSON output', () => {
  assert.deepEqual(parseArgs(['a/b', '--limit', '12', '--json']), {
    repository: 'a/b', limit: 12, json: true,
  });
  assert.deepEqual(parseArgs(['--help']), { help: true });
  assert.throws(() => parseArgs(['a/b', '--limit', 'abc']));
  assert.throws(() => parseArgs(['a/b', '--limit', '101']));
  assert.throws(() => parseArgs(['a/b', 'other']));
});

test('job durations exclude unfinished, invalid and reversed timestamps', () => {
  assert.equal(jobDurationMinutes(job('2026-10-12T10:00:00Z', '2026-10-12T10:02:30Z')), 2.5);
  assert.equal(jobDurationMinutes(job('2026-10-12T10:02:00Z', null)), 0);
  assert.equal(jobDurationMinutes(job('bad', '2026-10-12T10:00:00Z')), 0);
  assert.equal(jobDurationMinutes(job('2026-10-12T10:02:00Z', '2026-10-12T10:00:00Z')), 0);
});

test('summaries keep failure and schedule counts separate from billing estimates', () => {
  const runs = [
    { id: 1, name: 'Health', event: 'schedule', conclusion: 'failure' },
    { id: 2, name: 'Health', event: 'schedule', conclusion: 'success' },
    { id: 3, name: 'Build', event: 'push', conclusion: 'success' },
  ];
  const jobs = new Map([
    [1, [job('2026-10-12T10:00:00Z', '2026-10-12T10:02:00Z')]],
    [2, [job('2026-10-12T11:00:00Z', '2026-10-12T11:00:30Z')]],
    [3, [job(null, null)]],
  ]);
  const result = summarizeRuns('a/b', runs, jobs);
  assert.equal(result.inspected_runs, 3);
  assert.equal(result.elapsed_job_minutes, 2.5);
  assert.equal(result.completed_jobs, 2);
  assert.equal(result.incomplete_jobs, 1);
  assert.equal(result.workflows[0].name, 'Health');
  assert.equal(result.workflows[0].scheduled, 2);
  assert.equal(result.workflows[0].failures, 1);
  assert.match(result.metric_note, /not GitHub billable minutes/);
});

test('GitHub API integration reads runs and job details without writes', async () => {
  const called = [];
  const fetchImpl = async (url, options) => {
    called.push({ url, options });
    if (url.includes('/actions/runs?')) {
      return { ok: true, json: async () => ({ workflow_runs: [
        { id: 120, name: 'Nightly', event: 'schedule', conclusion: 'success' },
      ] }) };
    }
    if (url.includes('/runs/120/jobs?')) {
      return { ok: true, json: async () => ({
        total_count: 1,
        jobs: [job('2026-10-12T10:00:00Z', '2026-10-12T10:03:00Z')],
      }) };
    }
    throw new Error('Unexpected URL');
  };
  const report = await auditRepository({
    repository: 'a/b', limit: 3, token: 'test-secret', fetchImpl,
  });
  assert.equal(report.elapsed_job_minutes, 3);
  assert.equal(report.inspected_runs, 1);
  assert.equal(report.sample_warning, null);
  assert.equal(called.length, 2);
  assert.ok(called.every(c => c.options.headers.Authorization === 'Bearer test-secret'));
  assert.ok(called.every(c => c.url.startsWith('https://api.github.com/repos/a/b/actions/runs')));
  assert.ok(called.every(c => c.options.signal instanceof AbortSignal));
});

test('access failures provide guidance but never reveal the token', async () => {
  await assert.rejects(
    auditRepository({
      repository: 'a/b',
      token: 'secret-value',
      fetchImpl: async () => ({ ok: false, status: 403 }),
    }),
    error => /HTTP 403/.test(error.message) && !error.message.includes('secret-value'),
  );
});

test('UTC since-date filter rejects impossible dates and malformed input', () => {
  assert.equal(validateSinceDate('2024-02-29'), '2024-02-29');
  for (const value of ['2025-02-29', '2026-13-01', '2026-00-01', '2026-10-32',
    '10/12/2026', '2026-1-01', undefined, '2026-10-12T09:00:00Z']) {
    assert.throws(() => validateSinceDate(value));
  }
  assert.deepEqual(parseArgs(['a/b', '--since', '2026-10-01']), {
    repository: 'a/b', limit: 30, json: false, since: '2026-10-01',
  });
  assert.deepEqual(parseArgs(['a/b', '--markdown']), {
    repository: 'a/b', limit: 30, json: false, markdown: true,
  });
  assert.throws(() => parseArgs(['a/b', '--json', '--markdown']), /either/);
});

test('date filter is sent to GitHub REST API without write requests', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ workflow_runs: [] }) };
  };
  const report = await auditRepository({
    repository: 'a/b', since: '2026-10-01', limit: 5, fetchImpl,
  });
  assert.equal(report.since, '2026-10-01');
  assert.equal(report.inspected_runs, 0);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /created=%3E%3D2026-10-01/);
  assert.equal(calls[0].options.method, undefined);
  await assert.rejects(
    auditRepository({ repository: 'a/b', since: '2026-02-30', fetchImpl }),
    /valid calendar date/,
  );
  assert.equal(calls.length, 1);
});

test('Markdown report is deterministic and sanitizes untrusted workflow labels', () => {
  const report = summarizeRuns('a/b', [
    { id: 7, name: 'Build | <script>alert(1)</script>', event: 'push', conclusion: 'failure' },
  ], new Map([[7, [job('2026-10-12T10:00:00Z', '2026-10-12T10:04:00Z')]]]));
  report.since = '2026-10-01';
  const markdown = renderMarkdownReport(report);
  assert.match(markdown, /Created since \(UTC\):/);
  assert.match(markdown, /Build \\\| &lt;script&gt;/);
  assert.match(markdown, /\| 1 \| 1 \| 0 \| 4 \|/);
  assert.match(markdown, /not GitHub billable minutes/);
  assert.doesNotMatch(markdown, /<script>/);
  assert.equal(renderMarkdownReport(report), markdown);
});
