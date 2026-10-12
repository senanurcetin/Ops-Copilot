import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPullRequest, summarizePublicPullRequests } from '../src/lib/nexus-public-prs.ts';

const repo = 'owner/project';
function pr(number, overrides = {}) {
  return {
    number, title: 'Fix test ' + number, draft: false,
    html_url: `https://github.com/${repo}/pull/${number}`,
    updated_at: '2026-10-12T12:00:00Z', user: { login: 'contributor' },
    ...overrides,
  };
}
function detail(number, overrides = {}) {
  return {
    number, html_url: `https://github.com/${repo}/pull/${number}`,
    mergeable: true, mergeable_state: 'clean', ...overrides,
  };
}

test('categorizes confirmed merge conflicts and separate protection blockers', () => {
  const result = summarizePublicPullRequests(repo,
    [pr(1), pr(2), pr(3), pr(4), pr(5), pr(6)],
    [detail(1, { mergeable: false, mergeable_state: 'dirty' }),
      detail(2, { mergeable_state: 'blocked' }),
      detail(3, { mergeable_state: 'behind' }),
      detail(4, { mergeable_state: 'unstable' }),
      detail(5)],
  );
  assert.equal(result.more_open_prs, true);
  assert.equal(result.inspected_prs, 5);
  assert.equal(result.conflicts, 1);
  assert.equal(result.needs_attention, 4);
  assert.deepEqual(result.pull_requests.map(p => p.attention),
    ['conflict', 'blocked', 'behind', 'unstable', 'clear']);
  assert.match(result.scope_note, /not an exhaustive audit/);
});

test('draft state wins; missing, mismatched and pending details remain unknown', () => {
  const result = summarizePublicPullRequests(repo, [pr(3, { draft: true }), pr(4), pr(5), pr(6)],
    [null, null, detail(3, { mergeable: false }), detail(6, { mergeable: null, mergeable_state: 'unknown' })]);
  assert.deepEqual(result.pull_requests.map(p => p.attention), ['draft', 'unknown', 'unknown', 'unknown']);
  assert.equal(result.unknown, 3);
  assert.equal(result.conflicts, 0);
});

test('rejects unsafe repo names, forged PR links, corrupt list shapes and mismatched slots', () => {
  const good = [pr(1)];
  for (const name of ['http://evil.test/x', '../project', 'owner/project?x=1']) {
    assert.throws(() => summarizePublicPullRequests(name, good, [null]));
  }
  for (const bad of [null, {}, 'not a list', Array.from({ length: 7 }, (_, i) => pr(i+1))]) {
    assert.throws(() => summarizePublicPullRequests(repo, bad, []));
  }
  assert.throws(() => summarizePublicPullRequests(repo, good, []));
  assert.throws(() => summarizePublicPullRequests(repo,
    [pr(1, { html_url: 'https://evil.example/phishing' })], [null]));
  assert.throws(() => summarizePublicPullRequests(repo,
    [pr(1, { number: 1.5 })], [null]));
});

test('handles zero PRs and does not invent merge status when not computed', () => {
  const empty = summarizePublicPullRequests(repo, [], []);
  assert.equal(empty.inspected_prs, 0);
  assert.equal(empty.more_open_prs, false);
  assert.deepEqual(classifyPullRequest(false, { mergeable: null, mergeable_state: 'unknown' }).attention, 'unknown');
  assert.equal(classifyPullRequest(false, null).attention, 'unknown');
});