import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMPARISON_NOTE,
  compareRepositories,
  parseComparisonArgs,
  renderComparisonMarkdown,
} from '../scripts/github-actions-compare.mjs';

function report(repository, minutes, overrides = {}) {
  return {
    repository,
    inspected_runs: 3,
    completed_jobs: 2,
    incomplete_jobs: 1,
    elapsed_job_minutes: minutes,
    workflows: [
      { name: 'CI', failures: 1, scheduled: 0 },
      { name: 'Nightly', failures: 0, scheduled: 2 },
    ],
    sample_warning: null,
    ...overrides,
  };
}

test('comparison CLI accepts 2–5 repositories with bounded options', () => {
  assert.deepEqual(parseComparisonArgs([
    'org/first', '--since', '2026-10-01', 'org/second', '--limit', '8', '--markdown',
  ]), {
    repositories: ['org/first', 'org/second'],
    limit: 8, since: '2026-10-01', json: false, markdown: true,
  });
  assert.deepEqual(parseComparisonArgs(['--help']), { help: true });
  assert.deepEqual(parseComparisonArgs(['org/one', 'org/two', '--json']), {
    repositories: ['org/one', 'org/two'], limit: 10, json: true, markdown: false,
  });
});

test('comparison CLI fails on invalid, repeated, oversized or ambiguous arguments', () => {
  for (const args of [
    [], ['org/only'], ['org/one', 'ORG/ONE'],
    ['org/one', 'org/two', 'org/two'],
    ['org/one', 'org/two', 'org/three', 'org/four', 'org/five', 'org/six'],
    ['org/one', 'not-a-repo'], ['org/one', 'org/two', '--json', '--markdown'],
    ['org/one', 'org/two', '--limit', '0'],
    ['org/one', 'org/two', '--limit', '101'],
    ['org/one', 'org/two', '--limit', 'hello'],
    ['org/one', 'org/two', '--since', '2026-02-30'],
    ['org/one', 'org/two', '--unexpected'],
  ]) {
    assert.throws(() => parseComparisonArgs(args), 'Expected rejection of ' + JSON.stringify(args));
  }
});

test('comparison reuses existing read-only auditor and respects query scope', async () => {
  const calls = [];
  const actual = await compareRepositories({
    repositories: ['org/alpha', 'org/beta'],
    limit: 4,
    since: '2026-10-01',
    token: 'test-token',
    auditImpl: async options => {
      calls.push(options);
      return report(options.repository, options.repository.endsWith('alpha') ? 5 : 2);
    },
  });
  assert.deepEqual(calls, [
    { repository: 'org/alpha', limit: 4, since: '2026-10-01', token: 'test-token' },
    { repository: 'org/beta', limit: 4, since: '2026-10-01', token: 'test-token' },
  ]);
  assert.equal(actual.repositories_inspected, 2);
  assert.equal(actual.limit_per_repository, 4);
  assert.equal(actual.since, '2026-10-01');
  assert.deepEqual(actual.repositories.map(r => r.repository), ['org/alpha', 'org/beta']);
  assert.equal(actual.repositories[0].failed_runs, 1);
  assert.equal(actual.repositories[0].scheduled_runs, 2);
  assert.equal(actual.repositories[0].incomplete_jobs, 1);
  assert.match(actual.comparison_note, /NOT GitHub billed minutes/);
});

test('sorting is deterministic and does not alter supplied repository input', async () => {
  const repositories = ['org/zeta', 'org/alpha', 'org/beta'];
  const values = { 'org/zeta': 1, 'org/alpha': 7, 'org/beta': 7 };
  const actual = await compareRepositories({
    repositories,
    auditImpl: async ({ repository }) => report(repository, values[repository]),
  });
  assert.deepEqual(actual.repositories.map(r => r.repository), ['org/alpha', 'org/beta', 'org/zeta']);
  assert.deepEqual(repositories, ['org/zeta', 'org/alpha', 'org/beta']);
});

test('partial API failures abort the comparison instead of returning misleading results', async () => {
  const visited = [];
  await assert.rejects(compareRepositories({
    repositories: ['org/one', 'org/two', 'org/three'],
    auditImpl: async ({ repository }) => {
      visited.push(repository);
      if (repository === 'org/two') throw new Error('GitHub API HTTP 403');
      return report(repository, 1);
    },
  }), /Could not audit org\/two: GitHub API HTTP 403/);
  assert.deepEqual(visited, ['org/one', 'org/two']);
});

test('invalid audit results are not silently counted as zero elapsed minutes', async () => {
  for (const invalid of [null, {}, report('org/wrong', 2),
    report('org/a', Number.NaN), report('org/a', 2, { inspected_runs: -1 }),
    report('org/a', 2, { workflows: null })]) {
    await assert.rejects(compareRepositories({
      repositories: ['org/a', 'org/b'],
      auditImpl: async () => invalid,
    }), /Unexpected audit result/);
  }
});

test('Markdown includes sample caveats and safely escapes repository and API warning text', () => {
  const doc = renderComparisonMarkdown({
    repositories_inspected: 2,
    limit_per_repository: 5,
    since: '2026-10-01',
    comparison_note: COMPARISON_NOTE,
    repositories: [
      {
        repository: 'safe/repo',
        inspected_runs: 2,
        failed_runs: 1,
        scheduled_runs: 0,
        completed_jobs: 1,
        incomplete_jobs: 1,
        elapsed_job_minutes: 1.5,
        sample_warning: 'one | <script>alert(1)</script> page was truncated',
      },
      {
        repository: 'other/second',
        inspected_runs: 0,
        failed_runs: 0,
        scheduled_runs: 0,
        completed_jobs: 0,
        incomplete_jobs: 0,
        elapsed_job_minutes: 0,
        sample_warning: null,
      },
    ],
  });
  assert.match(doc, /Repositories inspected: \*\*2\*\*/);
  assert.match(doc, /Created since \(UTC\): \*\*2026-10-01\*\*/);
  assert.match(doc, /safe\/repo \| 2 \| 1 \| 0 \| 1 \| 1 \| 1\.5/);
  assert.match(doc, /one \\\| &lt;script&gt;/);
  assert.doesNotMatch(doc, /<script>/);
  assert.match(doc, /not a normalized performance ranking/);
  assert.equal(doc, renderComparisonMarkdown({
    repositories_inspected: 2,
    limit_per_repository: 5,
    since: '2026-10-01',
    comparison_note: COMPARISON_NOTE,
    repositories: [
      { repository: 'safe/repo', inspected_runs: 2, failed_runs: 1,
        scheduled_runs: 0, completed_jobs: 1, incomplete_jobs: 1,
        elapsed_job_minutes: 1.5, sample_warning: 'one | <script>alert(1)</script> page was truncated' },
      { repository: 'other/second', inspected_runs: 0, failed_runs: 0, scheduled_runs: 0,
        completed_jobs: 0, incomplete_jobs: 0, elapsed_job_minutes: 0, sample_warning: null },
    ],
  }));
});

test('sample truncation warnings remain specific to each repository', async () => {
  const comparison = await compareRepositories({
    repositories: ['org/first', 'org/second'],
    auditImpl: async ({ repository }) => report(repository, 3, {
      sample_warning: repository.endsWith('first') ? 'Older runs excluded' : null,
    }),
  });
  assert.equal(comparison.repositories.filter(r => r.sample_warning).length, 1);
  const doc = renderComparisonMarkdown(comparison);
  assert.match(doc, /org\/first.*Older runs excluded/);
  assert.doesNotMatch(doc, /org\/second.*Older runs excluded/);
});


test('multi-repository CLI supports a common inclusive end date', () => {
  assert.deepEqual(parseComparisonArgs(['a/one', 'a/two', '--since', '2026-10-01',
    '--until', '2026-10-12']), {
    repositories: ['a/one', 'a/two'],
    limit: 10, since: '2026-10-01', until: '2026-10-12',
    json: false, markdown: false,
  });
  assert.throws(() => parseComparisonArgs(['a/one', 'a/two', '--until']), /--until/);
  assert.throws(() => parseComparisonArgs(['a/one', 'a/two',
    '--since', '2026-10-14', '--until', '2026-10-12']), /--since must not be later/);
});

test('comparison propagates exact UTC date bounds to every repository', async () => {
  const calls = [];
  const result = await compareRepositories({
    repositories: ['a/one', 'a/two'],
    since: '2026-10-01',
    until: '2026-10-12',
    auditImpl: async options => {
      calls.push(options);
      return report(options.repository, 1);
    },
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(call => call.until), ['2026-10-12', '2026-10-12']);
  assert.deepEqual(calls.map(call => call.since), ['2026-10-01', '2026-10-01']);
  assert.equal(result.until, '2026-10-12');
  assert.match(renderComparisonMarkdown(result),
    /Created until \(UTC\): \*\*2026-10-12\*\*/);
});

test('comparison rejects invalid date windows before making any API calls', async () => {
  let calls = 0;
  await assert.rejects(compareRepositories({
    repositories: ['a/one', 'a/two'],
    since: '2026-10-14',
    until: '2026-10-12',
    auditImpl: async () => { calls++; return report('a/one', 1); },
  }), /--since must not be later/);
  assert.equal(calls, 0);
});


test('comparison CLI accepts a shared GitHub Actions event and status', () => {
  assert.deepEqual(parseComparisonArgs(['org/one', 'org/two',
    '--event', 'pull_request', '--status', 'failure']), {
    repositories: ['org/one', 'org/two'], limit: 10,
    event: 'pull_request', status: 'failure', json: false, markdown: false,
  });
  for (const args of [
    ['org/one', 'org/two', '--event'],
    ['org/one', 'org/two', '--event', '--json'],
    ['org/one', 'org/two', '--status'],
    ['org/one', 'org/two', '--status', 'failed'],
  ]) {
    assert.throws(() => parseComparisonArgs(args));
  }
});

test('comparison applies both filters consistently to each repository and reports their scope', async () => {
  const calls = [];
  const reportData = await compareRepositories({
    repositories: ['org/one', 'org/two'],
    event: 'schedule', status: 'success',
    auditImpl: async options => {
      calls.push(options);
      return report(options.repository, 2);
    },
  });
  assert.deepEqual(calls.map(x => [x.event, x.status]), [
    ['schedule', 'success'], ['schedule', 'success'],
  ]);
  assert.equal(reportData.event, 'schedule');
  assert.equal(reportData.status, 'success');
  assert.match(renderComparisonMarkdown(reportData), /Trigger event: \*\*schedule\*\*/);
  assert.match(renderComparisonMarkdown(reportData), /Run status\/conclusion: \*\*success\*\*/);
});

test('invalid multi-repo API filters fail before any repository is requested', async () => {
  let calls = 0;
  const auditImpl = async () => { calls++; return report('a/one', 1); };
  await assert.rejects(compareRepositories({
    repositories: ['a/one', 'a/two'], event: 'push?limit=100', auditImpl,
  }), /--event/);
  await assert.rejects(compareRepositories({
    repositories: ['a/one', 'a/two'], status: 'failed', auditImpl,
  }), /--status/);
  assert.equal(calls, 0);
});
