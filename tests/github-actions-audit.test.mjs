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


test('invalid and unfinished job timings never count as completed jobs', () => {
  const runs = [{ id: 9, name: 'CI', event: 'pull_request', conclusion: 'success' }];
  const jobs = [
    job('2026-10-12T10:00:00Z', '2026-10-12T10:00:00Z'),
    job('not-a-date', '2026-10-12T10:20:00Z'),
    job('2026-10-12T10:20:00Z', '2026-10-12T10:19:00Z'),
    job(null, null),
  ];
  const result = summarizeRuns('a/b', runs, new Map([[9, jobs]]));
  assert.equal(result.completed_jobs, 1);
  assert.equal(result.incomplete_jobs, 3);
  assert.equal(result.elapsed_job_minutes, 0);
  assert.match(renderMarkdownReport(result), /Jobs without valid completed timestamps: \*\*3\*\*/);
});

test('unexpected workflow-run payload is an error, never an empty success report', async () => {
  for (const payload of [{}, { workflow_runs: null }, { workflow_runs: 'invalid' }, null]) {
    await assert.rejects(
      auditRepository({ repository: 'a/b', fetchImpl: async () => ({
        ok: true, json: async () => payload,
      }) }),
      /workflow_runs must be an array/,
    );
  }
});

test('invalid workflow identifiers and job collections cannot silently underestimate usage', async () => {
  const runPayload = { workflow_runs: [{ id: 55, name: 'CI', event: 'push' }] };
  for (const badJobs of [{}, { jobs: null, total_count: 0 }, { jobs: [], total_count: -1 },
    { jobs: [job('2026-10-12T10:00:00Z', '2026-10-12T10:02:00Z')], total_count: 0 }]) {
    const fetchImpl = async url => ({
      ok: true,
      json: async () => url.includes('/actions/runs?') ? runPayload : badJobs,
    });
    await assert.rejects(auditRepository({ repository: 'a/b', fetchImpl }), /invalid job collection/);
  }
  await assert.rejects(auditRepository({
    repository: 'a/b',
    fetchImpl: async () => ({ ok: true, json: async () => ({ workflow_runs: [{ id: '55' }] }) }),
  }), /invalid workflow run id/);
});

test('pagination includes every job when GitHub splits results over multiple pages', async () => {
  const calls = [];
  const oneMinute = job('2026-10-12T10:00:00Z', '2026-10-12T10:01:00Z');
  const fetchImpl = async url => {
    calls.push(url);
    let body;
    if (url.includes('/actions/runs?')) body = { workflow_runs: [{ id: 3, name: 'CI' }] };
    else if (url.endsWith('&page=1')) body = { total_count: 101, jobs: Array(100).fill(oneMinute) };
    else if (url.endsWith('&page=2')) body = { total_count: 101, jobs: [oneMinute] };
    else throw new Error('Unexpected page');
    return { ok: true, json: async () => body };
  };
  const report = await auditRepository({ repository: 'a/b', fetchImpl });
  assert.equal(report.completed_jobs, 101);
  assert.equal(report.elapsed_job_minutes, 101);
  assert.equal(report.sample_warning, null);
  assert.equal(calls.length, 3);
});

test('bad pagination data fails closed instead of dropping job time', async () => {
  const fetchImpl = async url => ({
    ok: true,
    json: async () => url.includes('/actions/runs?')
      ? { workflow_runs: [{ id: 3, name: 'CI' }] }
      : url.endsWith('&page=1')
        ? { total_count: 101, jobs: Array(100).fill({}) }
        : { jobs: null },
  });
  await assert.rejects(auditRepository({ repository: 'a/b', fetchImpl }), /invalid job page/);
});

test('GitHub rate limit and malformed JSON errors never disclose a token', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 403,
    headers: { get: name => name === 'x-ratelimit-remaining' ? '0' : null },
  });
  await assert.rejects(auditRepository({
    repository: 'a/b', token: 'private-token', fetchImpl,
  }), error => /rate limit reached/.test(error.message) && !error.message.includes('private-token'));
  await assert.rejects(auditRepository({
    repository: 'a/b',
    fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError('invalid json'); } }),
  }), /returned invalid JSON/);
});


test('separate workflow IDs prevent unrelated same-name workflows from merging', () => {
  const runs = [
    { id: 1, workflow_id: 101, name: 'CI', event: 'push', conclusion: 'failure' },
    { id: 2, workflow_id: 202, name: 'CI', event: 'schedule', conclusion: 'success' },
    { id: 3, workflow_id: 101, name: 'Old CI', event: 'push', conclusion: 'success' },
  ];
  const timings = new Map([
    [1, [job('2026-10-12T10:00:00Z', '2026-10-12T10:02:00Z')]],
    [2, [job('2026-10-12T11:00:00Z', '2026-10-12T11:04:00Z')]],
    [3, [job('2026-10-12T12:00:00Z', '2026-10-12T12:03:00Z')]],
  ]);
  const report = summarizeRuns('a/b', runs, timings);
  assert.equal(report.inspected_runs, 3);
  assert.equal(report.elapsed_job_minutes, 9);
  assert.equal(report.workflows.length, 2);
  const first = report.workflows.find(w => w.workflow_id === 101);
  const second = report.workflows.find(w => w.workflow_id === 202);
  assert.deepEqual({ name: first.name, runs: first.runs, failures: first.failures, minutes: first.elapsed_job_minutes },
    { name: 'CI', runs: 2, failures: 1, minutes: 5 });
  assert.deepEqual({ name: second.name, runs: second.runs, scheduled: second.scheduled, minutes: second.elapsed_job_minutes },
    { name: 'CI', runs: 1, scheduled: 1, minutes: 4 });
  const markdown = renderMarkdownReport(report);
  assert.match(markdown, /CI \(#101\)/);
  assert.match(markdown, /CI \(#202\)/);
});

test('recommendations identify the actual workflow ID rather than ambiguous name', () => {
  const runs = Array.from({ length: 5 }, (_, idx) => ({
    id: idx + 1, workflow_id: 99, name: 'Hourly', event: 'schedule',
    conclusion: 'success',
  }));
  const report = summarizeRuns('a/b', runs, new Map());
  assert.equal(report.workflows[0].workflow_id, 99);
  assert.match(report.recommendations[0], /Hourly \(#99\): 5 scheduled runs/);
});

test('legacy run records without a workflow ID remain supported by name fallback', () => {
  const runs = [
    { id: 1, name: 'CI', event: 'push', conclusion: 'success' },
    { id: 2, name: 'CI', event: 'schedule', conclusion: 'failure' },
  ];
  const report = summarizeRuns('a/b', runs, new Map());
  assert.equal(report.workflows.length, 1);
  assert.equal(report.workflows[0].workflow_id, null);
  assert.equal(report.workflows[0].runs, 2);
});

test('GitHub API audit groups same-name workflows by their actual IDs', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    if (url.includes('/actions/runs?')) {
      return { ok: true, json: async () => ({
        workflow_runs: [
          { id: 10, workflow_id: 10_001, name: 'Build', event: 'push', conclusion: 'success' },
          { id: 20, workflow_id: 20_002, name: 'Build', event: 'push', conclusion: 'success' },
        ],
      }) };
    }
    const start = '2026-10-12T10:00:00Z';
    return { ok: true, json: async () => ({
      jobs: [job(start, url.includes('/runs/10/') ? '2026-10-12T10:01:00Z' : '2026-10-12T10:02:00Z')],
      total_count: 1,
    }) };
  };
  const report = await auditRepository({ repository: 'a/b', fetchImpl });
  assert.equal(calls.length, 3);
  assert.deepEqual(report.workflows.map(w => w.workflow_id), [20_002, 10_001]);
  assert.equal(report.elapsed_job_minutes, 3);
  assert.match(renderMarkdownReport(report), /Build \(#20002\)/);
});
