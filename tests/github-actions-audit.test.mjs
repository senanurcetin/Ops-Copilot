import test from 'node:test';
import assert from 'node:assert/strict';

import {
  auditRepository,
  jobDurationMinutes,
  parseArgs,
  renderMarkdownReport,
  summarizeRuns,
  validateBranch,
  validateSinceDate,
  validateDateRange,
  createdDateFilter,
  createPublicGithubCache,
  parseRetryAfter,
  validateRepository,
  validateEvent,
  validateStatus,
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


test('CLI accepts Git branch names and rejects missing or control-character branches', () => {
  assert.deepEqual(parseArgs(['a/b', '--branch', 'feature/sensor-audit']), {
    repository: 'a/b', limit: 30, json: false, branch: 'feature/sensor-audit',
  });
  assert.equal(validateBranch('release/v1.2'), 'release/v1.2');
  for (const value of ['', '--json', 'feature\nbranch', 'a'.repeat(256), undefined]) {
    assert.throws(() => validateBranch(value));
  }
  assert.throws(() => parseArgs(['a/b', '--branch']));
});

test('branch and UTC date filters are transmitted as encoded read-only query values', async () => {
  const called = [];
  const fetchImpl = async (url, options) => {
    called.push({ url, options });
    return { ok: true, json: async () => ({ workflow_runs: [] }) };
  };
  const report = await auditRepository({
    repository: 'a/b', limit: 3, since: '2026-10-01',
    branch: 'feature/sensor-audit', fetchImpl,
  });
  assert.equal(report.branch, 'feature/sensor-audit');
  assert.equal(report.since, '2026-10-01');
  assert.equal(called.length, 1);
  assert.match(called[0].url, /created=%3E%3D2026-10-01/);
  assert.match(called[0].url, /branch=feature%2Fsensor-audit/);
  assert.equal(called[0].options.method, undefined);
  assert.match(renderMarkdownReport(report), /Branch: \*\*feature\/sensor-audit\*\*/);

  await assert.rejects(auditRepository({
    repository: 'a/b', branch: '', fetchImpl,
  }), /--branch/);
  assert.equal(called.length, 1);
});


test('UTC date window accepts inclusive equal bounds and checks ordering', () => {
  assert.deepEqual(validateDateRange({ since: '2026-10-01', until: '2026-10-12' }), {
    since: '2026-10-01', until: '2026-10-12',
  });
  assert.equal(createdDateFilter({ since: '2026-10-12', until: '2026-10-12' }),
    '2026-10-12..2026-10-12');
  assert.equal(createdDateFilter({ since: '2026-10-01' }), '>=2026-10-01');
  assert.equal(createdDateFilter({ until: '2026-10-12' }), '<=2026-10-12');
  assert.equal(createdDateFilter({}), null);
  assert.throws(() => validateDateRange({
    since: '2026-10-13', until: '2026-10-12',
  }), /--since must not be later than --until/);
  assert.throws(() => validateDateRange({ until: '2026-02-30' }), /--until.*valid/);
});

test('CLI validates single-repository end dates and inverted ranges', () => {
  assert.deepEqual(parseArgs(['a/b', '--until', '2026-10-12']), {
    repository: 'a/b', limit: 30, json: false, until: '2026-10-12',
  });
  assert.deepEqual(parseArgs(['a/b', '--since', '2026-10-01',
    '--until', '2026-10-12', '--branch', 'main']), {
    repository: 'a/b', limit: 30, json: false,
    since: '2026-10-01', until: '2026-10-12', branch: 'main',
  });
  assert.throws(() => parseArgs(['a/b', '--until']), /--until/);
  assert.throws(() => parseArgs(['a/b', '--until', '2026-10-01',
    '--since', '2026-10-12']), /--since must not be later/);
});

test('GitHub API date search query uses inclusive range before sampling', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ workflow_runs: [] }) };
  };
  const report = await auditRepository({
    repository: 'a/b', limit: 4, since: '2026-10-01',
    until: '2026-10-12', branch: 'feature/demo', fetchImpl,
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /created=2026-10-01\.\.2026-10-12/);
  assert.match(calls[0].url, /branch=feature%2Fdemo/);
  assert.equal(calls[0].options.method, undefined);
  assert.equal(report.until, '2026-10-12');
  assert.match(renderMarkdownReport(report), /Created until \(UTC\): \*\*2026-10-12\*\*/);
  const untilOnly = await auditRepository({
    repository: 'a/b', until: '2026-10-12', fetchImpl,
  });
  assert.match(calls[1].url, /created=%3C%3D2026-10-12/);
  assert.equal(untilOnly.since, undefined);
  assert.equal(untilOnly.until, '2026-10-12');
  await assert.rejects(
    auditRepository({ repository: 'a/b', since: '2026-10-13',
      until: '2026-10-12', fetchImpl }),
    /--since must not be later/,
  );
  assert.equal(calls.length, 2);
});


test('GitHub Actions trigger event and status filters accept API names and reject malformed input', () => {
  for (const event of ['push', 'pull_request', 'workflow_dispatch', 'schedule', 'pull_request_target']) {
    assert.equal(validateEvent(event), event);
  }
  for (const event of ['', 'Push', '--json', 'push&status=failure', 'push\nstatus', 'x'.repeat(65), undefined]) {
    assert.throws(() => validateEvent(event), /--event/);
  }
  for (const status of ['completed', 'success', 'failure', 'in_progress', 'queued', 'cancelled', 'timed_out']) {
    assert.equal(validateStatus(status), status);
  }
  for (const status of ['', 'FAILURE', 'nonexistent', 'failure&branch=main', undefined]) {
    assert.throws(() => validateStatus(status), /--status/);
  }
});

test('CLI accepts both filters and rejects absent or invalid values before fetching', () => {
  assert.deepEqual(parseArgs(['a/b', '--event', 'pull_request', '--status', 'failure']), {
    repository: 'a/b', limit: 30, json: false, event: 'pull_request', status: 'failure',
  });
  for (const args of [
    ['a/b', '--event'], ['a/b', '--event', '--json'], ['a/b', '--status'],
    ['a/b', '--status', '--markdown'], ['a/b', '--status', 'failed'],
  ]) {
    assert.throws(() => parseArgs(args));
  }
});

test('REST event/status filtering occurs before run sampling and preserves query scope', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ workflow_runs: [] }) };
  };
  const result = await auditRepository({
    repository: 'a/b', limit: 8, since: '2026-10-01', until: '2026-10-12',
    branch: 'feature/demo', event: 'pull_request', status: 'failure', fetchImpl,
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /created=2026-10-01\.\.2026-10-12/);
  assert.match(calls[0].url, /branch=feature%2Fdemo/);
  assert.match(calls[0].url, /event=pull_request/);
  assert.match(calls[0].url, /status=failure/);
  assert.equal(calls[0].options.method, undefined);
  assert.equal(result.event, 'pull_request');
  assert.equal(result.status, 'failure');
  const markdown = renderMarkdownReport(result);
  assert.match(markdown, /Trigger event: \*\*pull_request\*\*/);
  assert.match(markdown, /Run status\/conclusion: \*\*failure\*\*/);
  await assert.rejects(auditRepository({
    repository: 'a/b', event: 'push?status=success', fetchImpl,
  }), /--event/);
  await assert.rejects(auditRepository({
    repository: 'a/b', status: 'failed', fetchImpl,
  }), /--status/);
  assert.equal(calls.length, 1);
});

test('individual GitHub event and status filters are independently optional', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    return { ok: true, json: async () => ({ workflow_runs: [] }) };
  };
  const eventReport = await auditRepository({ repository: 'a/b', event: 'schedule', fetchImpl });
  const statusReport = await auditRepository({ repository: 'a/b', status: 'in_progress', fetchImpl });
  assert.match(calls[0], /event=schedule/);
  assert.doesNotMatch(calls[0], /status=/);
  assert.match(calls[1], /status=in_progress/);
  assert.doesNotMatch(calls[1], /event=/);
  assert.equal(eventReport.status, undefined);
  assert.equal(statusReport.event, undefined);
});


test('missing GitHub jobs in a later API page cause an explicit integrity failure', async () => {
  const first = Array.from({ length: 100 }, (_, i) => ({
    id: i + 1, started_at: '2026-10-12T10:00:00Z',
    completed_at: '2026-10-12T10:01:00Z',
  }));
  const fetchImpl = async url => ({
    ok: true,
    json: async () => url.includes('/actions/runs?')
      ? { workflow_runs: [{ id: 11, name: 'CI', workflow_id: 99 }] }
      : url.endsWith('&page=1')
        ? { total_count: 101, jobs: first }
        : { total_count: 101, jobs: [] },
  });
  await assert.rejects(auditRepository({ repository: 'a/b', fetchImpl }),
    /inconsistent job count for run 11/);
});

test('unexpectedly short first pages cannot silently undercount job time', async () => {
  const fetchImpl = async url => ({
    ok: true,
    json: async () => url.includes('/actions/runs?')
      ? { workflow_runs: [{ id: 12, name: 'CI' }] }
      : { total_count: 4, jobs: [{ id: 1 }] },
  });
  await assert.rejects(auditRepository({ repository: 'a/b', fetchImpl }),
    /inconsistent job count for run 12/);
});

test('duplicated GitHub job IDs across API pages cannot inflate elapsed time', async () => {
  const first = Array.from({ length: 100 }, (_, i) => ({
    id: i + 1, started_at: '2026-10-12T10:00:00Z',
    completed_at: '2026-10-12T10:01:00Z',
  }));
  const fetchImpl = async url => ({
    ok: true,
    json: async () => url.includes('/actions/runs?')
      ? { workflow_runs: [{ id: 13, name: 'CI' }] }
      : url.endsWith('&page=1')
        ? { total_count: 101, jobs: first }
        : { total_count: 101, jobs: [{ ...first[99] }] },
  });
  await assert.rejects(auditRepository({ repository: 'a/b', fetchImpl }),
    /duplicate job IDs for run 13/);
});

test('valid 500-job cap reports truncation instead of pretending an exhaustive result', async () => {
  const urls = [];
  const fetchImpl = async url => {
    urls.push(url);
    if (url.includes('/actions/runs?')) {
      return { ok: true, json: async () => ({
        workflow_runs: [{ id: 14, name: 'CI', workflow_id: 99 }],
      }) };
    }
    const page = Number(new URL(url).searchParams.get('page'));
    const jobs = Array.from({ length: 100 }, (_, i) => ({
      id: (page - 1) * 100 + i + 1,
      started_at: '2026-10-12T10:00:00Z',
      completed_at: '2026-10-12T10:01:00Z',
    }));
    return { ok: true, json: async () => ({ total_count: 501, jobs }) };
  };
  const result = await auditRepository({ repository: 'a/b', limit: 2, fetchImpl });
  assert.equal(urls.length, 6);
  assert.equal(result.completed_jobs, 500);
  assert.equal(result.elapsed_job_minutes, 500);
  assert.match(result.sample_warning, /more than 500 jobs/);
});


test('short-lived public cache reuses GET results without mixing private access', async () => {
  const cache = createPublicGithubCache({ ttlMs: 30000 });
  let calls = 0;
  const fetchImpl = async url => {
    calls++;
    return { ok: true, json: async () => url.includes('/actions/runs?')
      ? { workflow_runs: [{ id: 1, name: 'CI', workflow_id: 11 }] }
      : { total_count: 1, jobs: [{
        id: 5, started_at: '2026-10-12T10:00:00Z',
        completed_at: '2026-10-12T10:01:00Z',
      }] },
    };
  };
  const options = { repository: 'a/b', fetchImpl, publicCache: cache };
  const first = await auditRepository(options);
  assert.equal(calls, 2);
  assert.equal(first.elapsed_job_minutes, 1);
  first.workflows[0].name = 'mutated';
  const second = await auditRepository(options);
  assert.equal(calls, 2, 'Second public audit should use cached read-only data');
  assert.equal(second.workflows[0].name, 'CI');
  assert.equal(cache.size(), 2);
});

test('cache has a TTL, a strict entry cap and returns defensive copies', () => {
  let currentTime = 1_000;
  const cache = createPublicGithubCache({
    ttlMs: 1000, maxEntries: 2, now: () => currentTime,
  });
  cache.set('a', { items: [1] });
  const cloned = cache.get('a');
  cloned.items.push(2);
  assert.deepEqual(cache.get('a'), { items: [1] });
  cache.set('b', 2);
  cache.set('c', 3);
  assert.equal(cache.size(), 2);
  assert.equal(cache.get('a'), undefined, 'Least recently inserted entry is evicted');
  currentTime += 1000;
  assert.equal(cache.get('b'), undefined, 'Expired data is not served');
  for (const options of [{ ttlMs: 0 }, { maxEntries: 0 }, { maxEntries: 1001 }]) {
    assert.throws(() => createPublicGithubCache(options));
  }
});

test('authenticated repository audits never populate or read the shared public cache', async () => {
  const cache = createPublicGithubCache();
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls++;
    assert.equal(options.headers.Authorization, 'Bearer private-token');
    return { ok: true, json: async () => url.includes('/actions/runs?')
      ? { workflow_runs: [] } : { jobs: [], total_count: 0 } };
  };
  for (let i = 0; i < 2; i++) {
    await auditRepository({ repository: 'private/repo', token: 'private-token', fetchImpl, publicCache: cache });
  }
  assert.equal(calls, 2, 'Authenticated queries are never cached');
  assert.equal(cache.size(), 0);
});

test('temporary GitHub 429 responses are retried when Retry-After permits', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    if (calls === 1) return {
      ok: false, status: 429, headers: { get: name => name === 'retry-after' ? '0' : null },
    };
    return { ok: true, json: async () => ({ workflow_runs: [] }) };
  };
  const result = await auditRepository({ repository: 'a/b', fetchImpl });
  assert.equal(calls, 2);
  assert.equal(result.inspected_runs, 0);
});

test('large Retry-After stops rather than hammering GitHub or disclosing a token', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return {
      ok: false, status: 429,
      headers: { get: name => name === 'retry-after' ? '3600' : null },
    };
  };
  await assert.rejects(auditRepository({
    repository: 'private/repo', token: 'private-token',
    fetchImpl,
  }), error => /rate limit reached/i.test(error.message) && !error.message.includes('private-token'));
  assert.equal(calls, 1);
});


test('API matching count exposes a precisely bounded workflow sample', async () => {
  const urls = [];
  const fetchImpl = async url => {
    urls.push(url);
    return { ok: true, json: async () => url.includes('/actions/runs?')
      ? { total_count: 25, workflow_runs: [
          { id: 101, workflow_id: 9, name: 'CI', conclusion: 'success' },
          { id: 102, workflow_id: 9, name: 'CI', conclusion: 'failure' },
        ] }
      : { total_count: 0, jobs: [] } };
  };
  const result = await auditRepository({ repository: 'a/b', limit: 2, fetchImpl });
  assert.equal(urls.length, 3);
  assert.equal(result.inspected_runs, 2);
  assert.equal(result.total_matching_runs, 25);
  assert.match(result.sample_warning, /Only 2 of 25 matching workflow runs were sampled/);
  assert.match(renderMarkdownReport(result), /Runs matching the GitHub API query: \*\*25\*\*/);
});

test('a complete API sample is not mislabeled as truncated when at its limit', async () => {
  const fetchImpl = async url => ({
    ok: true,
    json: async () => url.includes('/actions/runs?')
      ? { total_count: 2, workflow_runs: [{ id: 3, name: 'Build' }, { id: 4, name: 'Build' }] }
      : { total_count: 0, jobs: [] },
  });
  const result = await auditRepository({ repository: 'a/b', limit: 2, fetchImpl });
  assert.equal(result.total_matching_runs, 2);
  assert.equal(result.sample_warning, null);
  assert.equal(result.inspected_runs, 2);
});

test('zero total matches are reported explicitly without invented activity', async () => {
  const result = await auditRepository({
    repository: 'a/b',
    fetchImpl: async () => ({ ok: true, json: async () => ({
      total_count: 0, workflow_runs: [],
    }) }),
  });
  assert.equal(result.inspected_runs, 0);
  assert.equal(result.total_matching_runs, 0);
  assert.equal(result.sample_warning, null);
});

test('invalid GitHub workflow match counts are rejected before job queries', async () => {
  for (const total_count of [-1, 1.5, '2', null, 0]) {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return { ok: true, json: async () => ({
        total_count, workflow_runs: [{ id: 77, name: 'CI' }],
      }) };
    };
    await assert.rejects(auditRepository({ repository: 'a/b', fetchImpl }),
      /invalid workflow run total_count/);
    assert.equal(calls, 1);
  }
});

test('legacy mocks without a total_count retain explicitly uncertain coverage', async () => {
  const result = await auditRepository({
    repository: 'a/b', limit: 1,
    fetchImpl: async url => ({ ok: true, json: async () =>
      url.includes('/actions/runs?')
        ? { workflow_runs: [{ id: 6, name: 'CI' }] }
        : { total_count: 0, jobs: [] } }),
  });
  assert.equal(result.total_matching_runs, undefined);
  assert.match(result.sample_warning, /API match count was unavailable/);
});


test('Retry-After parser handles seconds and RFC-style HTTP dates', () => {
  const base = Date.parse('2026-10-12T12:00:00Z');
  assert.equal(parseRetryAfter(undefined, base), null);
  assert.equal(parseRetryAfter(null, base), null);
  assert.equal(parseRetryAfter('0', base), 0);
  assert.equal(parseRetryAfter('3', base), 3000);
  assert.equal(parseRetryAfter(' 2 ', base), 2000);
  assert.equal(parseRetryAfter('Mon, 12 Oct 2026 12:00:02 GMT', base), 2000);
  assert.equal(parseRetryAfter('Mon, 12 Oct 2026 11:59:59 GMT', base), 0);
  assert.equal(parseRetryAfter('Mon, 12 Oct 2026 12:01:00 GMT', base), 60000);
});

test('malformed or huge Retry-After values fail closed', () => {
  for (const value of ['', 'nope', '-1', '1e6', '99999999999999999999',
    '20/10/2026', 'Wed, not-a-real-time GMT', true]) {
    assert.equal(parseRetryAfter(value), Infinity);
  }
});

test('GitHub HTTP-date Retry-After far in the future stops immediately', async () => {
  let requests = 0;
  const future = new Date(Date.now() + 3600000).toUTCString();
  const fetchImpl = async () => {
    requests++;
    return {
      ok: false,
      status: 429,
      headers: { get: name => name === 'retry-after' ? future : null },
    };
  };
  await assert.rejects(auditRepository({
    repository: 'a/b', fetchImpl,
  }), /rate limit reached/);
  assert.equal(requests, 1);
});

test('unparseable Retry-After does not bypass GitHub server throttling', async () => {
  let requests = 0;
  const fetchImpl = async () => {
    requests++;
    return {
      ok: false,
      status: 429,
      headers: { get: name => name === 'retry-after' ? 'invalid-date' : null },
    };
  };
  await assert.rejects(auditRepository({
    repository: 'a/b', token: 'private-token', fetchImpl,
  }), error => /HTTP 429/.test(error.message) && !error.message.includes('private-token'));
  assert.equal(requests, 1);
});

test('per-workflow completed and incomplete job counts reconcile to report totals', () => {
  const runs = [
    { id: 51, workflow_id: 101, name: 'Build', event: 'push', conclusion: 'success' },
    { id: 52, workflow_id: 202, name: 'Tests', event: 'pull_request', conclusion: 'success' },
    { id: 53, workflow_id: 101, name: 'Renamed Build', event: 'push', conclusion: 'failure' },
  ];
  const jobs = new Map([
    [51, [job('2026-10-12T10:00:00Z', '2026-10-12T10:02:00Z'), job(null, null)]],
    [52, [job('2026-10-12T11:00:00Z', '2026-10-12T11:00:00Z')]],
    [53, [job('bad', '2026-10-12T12:00:00Z'), job('2026-10-12T12:00:00Z', '2026-10-12T12:03:00Z')]],
  ]);
  const report = summarizeRuns('owner/repo', runs, jobs);
  const build = report.workflows.find(w => w.workflow_id === 101);
  const tests = report.workflows.find(w => w.workflow_id === 202);
  assert.equal(build.job_count, 2);
  assert.equal(build.incomplete_jobs, 2);
  assert.equal(tests.job_count, 1);
  assert.equal(tests.incomplete_jobs, 0);
  assert.equal(report.completed_jobs, 3);
  assert.equal(report.incomplete_jobs, 2);
  assert.equal(report.workflows.reduce((sum, w) => sum + w.job_count, 0), report.completed_jobs);
  assert.equal(report.workflows.reduce((sum, w) => sum + w.incomplete_jobs, 0), report.incomplete_jobs);
});
