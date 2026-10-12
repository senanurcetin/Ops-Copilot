import { parsePublicRepository } from './github-public-actions';

export type PullAttention = 'draft' | 'conflict' | 'blocked' | 'behind' | 'unstable' | 'clear' | 'unknown';

export type PublicPullRequest = {
  number: number;
  title: string;
  author: string;
  updated_at: string;
  html_url: string;
  attention: PullAttention;
  explanation: string;
};

export type PublicPullSummary = {
  repository: string;
  inspected_prs: number;
  more_open_prs: boolean;
  conflicts: number;
  needs_attention: number;
  unknown: number;
  pull_requests: PublicPullRequest[];
  scope_note: string;
};

const MAX_PRS = 5;

type GithubPullListItem = {
  number: number;
  title: string;
  draft: boolean;
  html_url: string;
  updated_at: string;
  user?: { login?: string } | null;
};

type GithubPullDetails = {
  number?: number;
  html_url?: string;
  draft?: boolean;
  mergeable?: boolean | null;
  mergeable_state?: string;
};

export function classifyPullRequest(draft: boolean, detail: unknown): {
  attention: PullAttention; explanation: string;
} {
  if (draft) {
    return { attention: 'draft', explanation: 'Draft: the author has not marked this PR ready for review.' };
  }
  if (!detail || typeof detail !== 'object') {
    return { attention: 'unknown', explanation: 'GitHub merge details are unavailable; no blocker can be confirmed.' };
  }
  const item = detail as GithubPullDetails;
  if (item.mergeable_state === 'dirty' || item.mergeable === false) {
    return { attention: 'conflict', explanation: 'GitHub reports merge conflicts with the base branch.' };
  }
  if (item.mergeable_state === 'blocked') {
    return { attention: 'blocked', explanation: 'GitHub reports merge restrictions; required reviews or checks may be outstanding.' };
  }
  if (item.mergeable_state === 'behind') {
    return { attention: 'behind', explanation: 'GitHub reports that the branch is behind the base branch.' };
  }
  if (item.mergeable_state === 'unstable') {
    return { attention: 'unstable', explanation: 'GitHub reports an unstable merge state; inspect checks on the PR.' };
  }
  if (item.mergeable === true && item.mergeable_state === 'clean') {
    return { attention: 'clear', explanation: 'GitHub currently reports a clean merge state; approval is not guaranteed.' };
  }
  return { attention: 'unknown', explanation: 'GitHub has not confirmed the current merge state.' };
}

/** Summarize at most five *recently listed* open PRs without claiming a complete review. */
export function summarizePublicPullRequests(
  repository: string,
  listPayload: unknown,
  detailPayloads: Array<unknown | null>,
): PublicPullSummary {
  parsePublicRepository(repository);
  if (!Array.isArray(listPayload) || listPayload.length > MAX_PRS + 1) {
    throw new Error('Unexpected GitHub pull request list.');
  }
  const selected = listPayload.slice(0, MAX_PRS) as unknown[];
  if (detailPayloads.length !== selected.length) {
    throw new Error('Missing PR detail slots.');
  }
  const pull_requests = selected.map((entry, i) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid GitHub pull request.');
    const pr = entry as Partial<GithubPullListItem>;
    if (!Number.isSafeInteger(pr.number) || (pr.number ?? 0) < 1 ||
        typeof pr.title !== 'string' || typeof pr.draft !== 'boolean' ||
        typeof pr.updated_at !== 'string' || !Number.isFinite(Date.parse(pr.updated_at)) ||
        typeof pr.html_url !== 'string') {
      throw new Error('Invalid GitHub pull request.');
    }
    const number = pr.number as number;
    const html_url = `https://github.com/${repository}/pull/${number}`;
    if (pr.html_url !== html_url) throw new Error('Unexpected GitHub pull request URL.');
    const raw = detailPayloads[i];
    // Do not allow details from a different PR to influence this PR's status.
    const detail = raw && typeof raw === 'object' &&
      (raw as GithubPullDetails).number === number &&
      (raw as GithubPullDetails).html_url === html_url ? raw : null;
    const { attention, explanation } = classifyPullRequest(pr.draft as boolean, detail);
    return {
      number,
      title: (pr.title as string).slice(0, 300),
      author: typeof pr.user?.login === 'string' ? pr.user.login.slice(0, 100) : 'Unknown author',
      updated_at: pr.updated_at as string,
      html_url,
      attention,
      explanation,
    };
  });
  const needs_attention = pull_requests.filter(p =>
    ['conflict', 'blocked', 'behind', 'unstable'].includes(p.attention)).length;
  return {
    repository,
    inspected_prs: pull_requests.length,
    more_open_prs: listPayload.length > MAX_PRS,
    conflicts: pull_requests.filter(p => p.attention === 'conflict').length,
    needs_attention,
    unknown: pull_requests.filter(p => p.attention === 'unknown').length,
    pull_requests,
    scope_note: 'Public repository only. Up to five recently listed open PRs; not an exhaustive audit. Merge information can be pending, stale, or unavailable, and does not replace required checks or human review.',
  };
}