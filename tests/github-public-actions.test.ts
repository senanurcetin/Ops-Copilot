import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePublicRepository, summarizePublicActions } from '../src/lib/github-public-actions';

function run(id: number, conclusion: string | null, status = 'completed') {
  return {
    id, name: 'CI', event: 'push', status, conclusion,
    created_at: '2026-10-12T10:00:00Z',
    html_url: 'https://github.com/owner/project/actions/runs/' + id,
  };
}

test('public demo accepts valid repositories and rejects invalid paths', () => {
  assert.deepEqual(parsePublicRepository('owner/project'), ['owner', 'project']);
  for (const value of ['', '../project', 'owner/../project', 'owner/..', 'owner/', 'owner/project?token=a',
    'http://example.com', 'a/b/c', 'a//b', null, 1]) {
    assert.throws(() => parsePublicRepository(value));
  }
});

test('public demo displays only the first ten validated workflow records', () => {
  const records = [run(1, 'success'), run(2, 'failure'), run(3, null, 'in_progress')];
  const data = summarizePublicActions('owner/project', {
    workflow_runs: records, total_count: 321,
  });
  assert.equal(data.inspected_runs, 3);
  assert.equal(data.total_matching_runs, 321);
  assert.deepEqual([data.successful_runs, data.failed_runs, data.pending_runs], [1, 1, 1]);
  assert.equal(data.runs[2].status, 'in_progress');
  assert.match(data.scope_note, /not billed minutes/);
  const capped = summarizePublicActions('owner/project', {
    workflow_runs: Array.from({ length: 30 }, (_, i) => run(i + 1, 'success')),
    total_count: 30,
  });
  assert.equal(capped.inspected_runs, 10);
  assert.equal(capped.successful_runs, 10);
});

test('public demo rejects malformed API data and unsafe returned links', () => {
  for (const payload of [null, {}, { workflow_runs: [], total_count: -1 },
    { workflow_runs: 'wrong', total_count: 1 },
    { workflow_runs: [{ ...run(1, 'success'), html_url: 'https://evil.example/path' }], total_count: 1 },
    { workflow_runs: [{ ...run(1, 'success'), id: '1' }], total_count: 1 },
    { workflow_runs: [{ ...run(1, 'success'), conclusion: undefined }], total_count: 1 }]) {
    assert.throws(() => summarizePublicActions('owner/project', payload));
  }
});

test('public demo keeps user-provided API fields out of untrusted output URLs', () => {
  const safe = summarizePublicActions('owner/project', {
    workflow_runs: [{ ...run(5, 'success'), name: '<script>bad</script>', event: 'schedule' }],
    total_count: 1,
  });
  assert.equal(safe.runs[0].name, '<script>bad</script>');
  assert.equal(safe.runs[0].html_url, 'https://github.com/owner/project/actions/runs/5');
  assert.equal('token' in safe, false);
});

test('canonical GitHub URL casing does not reject a public repository', () => {
  const payload = { total_count: 1, workflow_runs: [{
    id: 42, name: 'CI', event: 'push', status: 'completed',
    conclusion: 'success', created_at: '2026-10-16T10:00:00Z',
    html_url: 'https://github.com/senanurcetin/Ops-Copilot/actions/runs/42',
  }] };
  const summary = summarizePublicActions('SenanurCetin/OPS-COPILOT', payload);
  assert.equal(summary.inspected_runs, 1);
  assert.equal(summary.successful_runs, 1);
  // A link returned to the browser keeps GitHub's canonical spelling.
  assert.equal(summary.runs[0].html_url, payload.workflow_runs[0].html_url);
  assert.throws(() => summarizePublicActions('another-owner/OPS-COPILOT', payload));
  assert.throws(() => summarizePublicActions('SenanurCetin/OPS-COPILOT', {
    total_count: 1, workflow_runs: [{ ...payload.workflow_runs[0], html_url:
      'https://github.com/senanurcetin/Ops-Copilot/actions/runs/43' }],
  }));
});
