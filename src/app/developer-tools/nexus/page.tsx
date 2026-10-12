'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  Activity, AlertCircle, ArrowRight, ArrowUpRight, CheckCircle2,
  GitBranch, GitPullRequest, RefreshCw, ShieldCheck, TriangleAlert,
} from 'lucide-react';
import type { PublicActionsSummary } from '@/lib/github-public-actions';
import type { PublicPullSummary, PullAttention } from '@/lib/nexus-public-prs';

const DEFAULT_REPOSITORY = 'senanurcetin/Ops-Copilot';

type ApiFailure = { error: string };
type Panel<T> = { data: T | null; error: string | null };
const empty = <T,>(): Panel<T> => ({ data: null, error: null });

const attentionMeta: Record<PullAttention, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-600/30 text-slate-300' },
  conflict: { label: 'Merge conflict', className: 'bg-rose-400/15 text-rose-300' },
  blocked: { label: 'Merge restricted', className: 'bg-amber-400/15 text-amber-300' },
  behind: { label: 'Behind base', className: 'bg-amber-400/15 text-amber-300' },
  unstable: { label: 'Unstable', className: 'bg-amber-400/15 text-amber-300' },
  clear: { label: 'Clean (reported)', className: 'bg-emerald-400/15 text-emerald-300' },
  unknown: { label: 'Not verified', className: 'bg-slate-600/30 text-slate-300' },
};

async function readPanel<T>(url: string, signal: AbortSignal): Promise<Panel<T>> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal });
    const payload: unknown = await res.json();
    const isError = payload !== null && typeof payload === 'object' && 'error' in payload;
    if (!res.ok || isError || !payload) {
      throw new Error(isError && typeof (payload as ApiFailure).error === 'string'
        ? (payload as ApiFailure).error : 'GitHub data unavailable.');
    }
    return { data: payload as T, error: null };
  } catch (error) {
    if (signal.aborted) return empty<T>();
    return { data: null, error: error instanceof Error ? error.message : 'Request failed.' };
  }
}

function Card({ label, value, detail, tone = 'default' }: {
  label: string; value: string | number; detail: string; tone?: 'default' | 'warning';
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <div className={'mt-2 text-3xl font-semibold tabular-nums ' +
        (tone === 'warning' ? 'text-amber-300' : 'text-white')}>{value}</div>
      <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

export default function NexusDeveloperPreview() {
  const [repository, setRepository] = useState(DEFAULT_REPOSITORY);
  const [selectedRepo, setSelectedRepo] = useState(DEFAULT_REPOSITORY);
  const [actions, setActions] = useState<Panel<PublicActionsSummary>>(empty);
  const [pulls, setPulls] = useState<Panel<PublicPullSummary>>(empty);
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(async (repo: string) => {
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    const trimmed = repo.trim();
    setSelectedRepo(trimmed);
    setLoading(true);
    setActions(empty());
    setPulls(empty());
    const params = new URLSearchParams({ repository: trimmed }).toString();
    const [actionsResponse, pullsResponse] = await Promise.all([
      readPanel<PublicActionsSummary>(`/api/public-actions?${params}`, next.signal),
      readPanel<PublicPullSummary>(`/api/public-prs?${params}`, next.signal),
    ]);
    if (controller.current !== next || next.signal.aborted) return;
    setActions(actionsResponse);
    setPulls(pullsResponse);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(DEFAULT_REPOSITORY);
    return () => controller.current?.abort();
  }, [load]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(repository);
  }

  const validRuns = actions.data?.inspected_runs ?? 0;
  const successRatio = validRuns ? Math.round((actions.data!.successful_runs / validRuns) * 100) : null;
  const runs = actions.data?.runs ?? [];
  const prList = pulls.data?.pull_requests ?? [];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:py-14">
        <header className="mb-12 flex flex-wrap items-center justify-between gap-4">
          <Link href="/developer-tools/github-actions"
            className="flex items-center gap-2 text-sm font-semibold tracking-wide text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400/15 text-cyan-300">
              <Activity className="h-5 w-5" />
            </span>
            NEXUS <span className="font-normal text-slate-400">/ Developer Intelligence</span>
          </Link>
          <a href="https://github.com/senanurcetin/Ops-Copilot" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-300">
            Open-source code <ArrowUpRight className="h-4 w-4" />
          </a>
        </header>

        <div className="mb-10 grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:items-end">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-cyan-300">
              <ShieldCheck className="h-4 w-4" /> Public API · Read-only preview
            </div>
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Your CI and pull requests. <span className="text-cyan-300">One view.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-400">
              Explore real GitHub Actions history and GitHub-reported merge states.
              Find candidates that need investigation without triggering workflows or modifying code.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 text-sm leading-6 text-slate-400">
            <div className="mb-2 flex items-center gap-2 font-semibold text-slate-200">
              <GitBranch className="h-4 w-4 text-cyan-300" /> Limited public preview
            </div>
            Results are samples: up to 10 workflow runs and 5 open PRs. Merge states can be pending.
            No token, AI diagnosis, account-wide billing data or deployment claim.
          </div>
        </div>

        <section aria-label="Repository search" className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
          <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm font-medium text-slate-300">
              Public GitHub repository
              <input value={repository} onChange={event => setRepository(event.target.value)}
                maxLength={200} required autoComplete="off" placeholder="owner/repository"
                className="mt-2 block w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-slate-100 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/15" />
            </label>
            <button type="submit" disabled={loading}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50">
              <RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} />
              {loading ? 'Analyzing…' : 'Analyze repository'}
            </button>
          </form>
          <p className="mt-3 text-xs text-slate-500" aria-live="polite">
            {loading ? 'Reading public GitHub REST API records…' : `Selected: ${selectedRepo}`}
          </p>
        </section>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Sample statistics">
          <Card label="Workflow runs inspected" value={actions.data?.inspected_runs ?? (loading ? '…' : '—')}
            detail="Up to ten most recent runs" />
          <Card label="Successful in sample" value={successRatio === null ? '—' : `${successRatio}%`}
            detail={validRuns ? `${actions.data!.successful_runs} of ${validRuns} inspected runs` : 'No verified workflow sample'} />
          <Card label="Open PRs inspected" value={pulls.data?.inspected_prs ?? (loading ? '…' : '—')}
            detail={pulls.data?.more_open_prs ? 'More open PRs exist beyond this sample' : 'Up to five open PRs'} />
          <Card label="PRs needing inspection" value={pulls.data?.needs_attention ?? (loading ? '…' : '—')}
            detail={pulls.data ? `${pulls.data.conflicts} confirmed conflict(s); ${pulls.data.unknown} unknown status(es)` : 'Only GitHub-reported states'}
            tone={Boolean(pulls.data?.needs_attention) ? 'warning' : 'default'} />
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section aria-labelledby="workflow-title" className="min-w-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/75">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 p-5">
              <div>
                <h2 id="workflow-title" className="flex items-center gap-2 text-lg font-semibold">
                  <Activity className="h-5 w-5 text-cyan-300" /> GitHub Actions
                </h2>
                <p className="mt-1 text-xs text-slate-500">Recent runs · GitHub REST API</p>
              </div>
              <a href={`https://github.com/${selectedRepo}/actions`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-cyan-300 hover:text-white">
                History <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>
            {actions.error && <p className="m-5 flex gap-2 rounded-xl bg-rose-950/30 p-4 text-sm text-rose-300" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0" />{actions.error}</p>}
            <ul className="divide-y divide-slate-800/80">
              {runs.map(run => (
                <li key={run.id} className="flex items-center justify-between gap-3 p-5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-200">{run.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{run.event} · {run.created_at.slice(0, 10)} · #{run.id}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={'text-xs ' + (run.conclusion === 'success' ? 'text-emerald-300' :
                      run.conclusion === 'failure' ? 'text-rose-300' : 'text-amber-300')}>
                      {run.conclusion ?? run.status}
                    </span>
                    <a href={run.html_url} target="_blank" rel="noopener noreferrer"
                      aria-label={`View GitHub Actions run ${run.id}`} className="text-slate-400 hover:text-cyan-300">
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
            {actions.data && runs.length === 0 && <p className="p-5 text-sm text-slate-400">No workflow runs in this sample.</p>}
            {!actions.data && !actions.error && <p className="p-5 text-sm text-slate-500">{loading ? 'Loading workflow history…' : 'No workflow data loaded.'}</p>}
            {actions.data && <p className="border-t border-slate-800 p-5 text-xs leading-5 text-slate-500">
              {actions.data.scope_note} GitHub reports {actions.data.total_matching_runs} matching workflow runs.
            </p>}
          </section>

          <section aria-labelledby="pulls-title" className="min-w-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/75">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 p-5">
              <div>
                <h2 id="pulls-title" className="flex items-center gap-2 text-lg font-semibold">
                  <GitPullRequest className="h-5 w-5 text-cyan-300" /> PR Intelligence
                </h2>
                <p className="mt-1 text-xs text-slate-500">Recent open pull requests · GitHub-reported merge states</p>
              </div>
              <a href={`https://github.com/${selectedRepo}/pulls`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-cyan-300 hover:text-white">
                Open PRs <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>
            {pulls.error && <p className="m-5 flex gap-2 rounded-xl bg-rose-950/30 p-4 text-sm text-rose-300" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0" />{pulls.error}</p>}
            <ul className="divide-y divide-slate-800/80">
              {prList.map(pr => (
                <li key={pr.number} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <a href={pr.html_url} target="_blank" rel="noopener noreferrer"
                      className="max-w-full min-w-0 flex-1 text-sm font-medium text-slate-200 hover:text-cyan-300">
                      #{pr.number} · {pr.title} <ArrowUpRight className="inline h-3.5 w-3.5" />
                    </a>
                    <span className={'shrink-0 rounded-full px-2.5 py-1 text-xs ' + attentionMeta[pr.attention].className}>
                      {attentionMeta[pr.attention].label}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-400">{pr.explanation}</p>
                  <p className="mt-2 text-xs text-slate-500">{pr.author} · Updated {pr.updated_at.slice(0, 10)}</p>
                </li>
              ))}
            </ul>
            {pulls.data && prList.length === 0 && <p className="p-5 text-sm text-slate-400">No open PRs found.</p>}
            {!pulls.data && !pulls.error && <p className="p-5 text-sm text-slate-500">{loading ? 'Loading pull requests…' : 'No PR data loaded.'}</p>}
            {pulls.data && <p className="border-t border-slate-800 p-5 text-xs leading-5 text-slate-500">
              {pulls.data.scope_note}
            </p>}
          </section>
        </div>

        <section className="mt-7 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6" aria-labelledby="next-title">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 id="next-title" className="flex items-center gap-2 text-base font-semibold">
                {pulls.data?.conflicts ? <TriangleAlert className="h-5 w-5 text-amber-300" /> :
                  <CheckCircle2 className="h-5 w-5 text-cyan-300" />}
                What to investigate next
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                {pulls.data?.conflicts ? `Investigate ${pulls.data.conflicts} GitHub-reported merge conflict(s) in the sampled PRs.` :
                  pulls.data?.needs_attention ? `Review ${pulls.data.needs_attention} PR(s) with a reported restriction, outdated branch, or unstable merge state.` :
                    'Open individual GitHub checks and review threads before deciding whether a change can merge.'}
                {' '}This preview does not modify branches, diagnose logs, or submit pull requests.
              </p>
            </div>
            <a href="https://github.com/senanurcetin/Ops-Copilot/blob/main/docs/github-actions-integration.md"
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-cyan-300 hover:text-white">
              CLI documentation <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>

        <footer className="mt-9 border-t border-slate-800 pt-6 text-xs leading-6 text-slate-500">
          MVP development preview inside Ops-Copilot. Public repositories only; anonymous GET requests; sample sizes and unknown states are explicit.
          Not a production reliability rating, a security audit, or a GitHub billing statement.
        </footer>
      </div>
    </main>
  );
}