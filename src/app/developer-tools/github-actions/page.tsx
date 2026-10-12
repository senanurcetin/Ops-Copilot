'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowUpRight, GitBranch, RefreshCw, ShieldCheck, Activity } from 'lucide-react';
import type { PublicActionsSummary } from '@/lib/github-public-actions';

const initialRepository = 'senanurcetin/Ops-Copilot';

function statLabel(value: string | null, status: string) {
  if (status !== 'completed') return 'In progress';
  return value === 'success' ? 'Success' : value === 'failure' ? 'Failure' : value || 'Completed';
}

export default function GitHubActionsDeveloperDemo() {
  const [repository, setRepository] = useState(initialRepository);
  const [report, setReport] = useState<PublicActionsSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (value: string) => {
    setBusy(true);
    setError('');
    setReport(null);
    try {
      const response = await fetch('/api/public-actions?repository=' + encodeURIComponent(value.trim()), {
        cache: 'no-store',
      });
      const result: PublicActionsSummary | { error: string } = await response.json();
      if (!response.ok || !('runs' in result)) {
        throw new Error('error' in result ? result.error : 'Could not load repository.');
      }
      setReport(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to reach GitHub.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(initialRepository); }, [load]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(repository);
  }

  const successRatio = report && report.inspected_runs
    ? Math.round(report.successful_runs / report.inspected_runs * 100) : 0;
  const failureRatio = report && report.inspected_runs
    ? Math.round(report.failed_runs / report.inspected_runs * 100) : 0;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <header className="mb-12 flex flex-wrap items-center justify-between gap-4">
          <Link href="/login" className="text-sm font-semibold tracking-wide text-slate-300 hover:text-white">
            Ops-Copilot <span className="text-indigo-400">/ Developer Tools</span>
          </Link>
          <a href="https://github.com/senanurcetin/Ops-Copilot" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:border-indigo-400">
            View source <ArrowUpRight className="h-4 w-4" />
          </a>
        </header>

        <section className="mb-10 max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-400/10 px-3 py-1 text-xs font-semibold tracking-wider text-indigo-300">
            <ShieldCheck className="h-4 w-4" /> PUBLIC, READ-ONLY GITHUB REST API
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            GitHub Actions <span className="text-indigo-400">Explorer</span>
          </h1>
          <p className="mt-5 text-base leading-7 text-slate-400">
            Explore recent workflow activity from a public GitHub repository.
            See the actual API data, not a static screenshot or an estimated billing total.
            No login, token or GitHub Actions run is required.
          </p>
        </section>

        <section aria-label="Repository selector" className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 sm:p-7">
          <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm font-medium text-slate-300">
              Repository (owner/name)
              <input value={repository} onChange={e => setRepository(e.target.value)}
                aria-label="GitHub repository" required maxLength={200}
                placeholder="owner/repository"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-white outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20" />
            </label>
            <button type="submit" disabled={busy}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-6 py-3 font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60">
              <RefreshCw className={'h-4 w-4 ' + (busy ? 'animate-spin' : '')} />
              {busy ? 'Loading' : 'Analyze repository'}
            </button>
          </form>
          <p className="mt-3 text-xs text-slate-500">Public repositories only. Requests are cached on the server for up to 2 minutes. No token is sent by this page.</p>
          {error && <div role="alert" className="mt-5 rounded-xl border border-rose-500/40 bg-rose-950/40 p-4 text-sm text-rose-200">{error}</div>}
        </section>

        {report && (
          <>
            <section aria-label="Workflow summary" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { title: 'Runs inspected', value: report.inspected_runs },
                { title: 'Successful', value: report.successful_runs },
                { title: 'Failed', value: report.failed_runs },
                { title: 'Other / pending', value: report.pending_runs },
              ].map(item => (
                <div key={item.title} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                  <p className="text-sm text-slate-400">{item.title}</p>
                  <p className="mt-2 text-3xl font-semibold tabular-nums text-white">{item.value}</p>
                </div>
              ))}
            </section>

            <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                    <Activity className="h-5 w-5 text-indigo-300" /> Recent run distribution
                  </h2>
                  <p className="mt-2 text-sm text-slate-400">Within {report.inspected_runs} sampled runs. GitHub reports {report.total_matching_runs} matching runs overall.</p>
                </div>
                <a href={'https://github.com/' + report.repository + '/actions'} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-indigo-300 hover:text-white">
                  GitHub history <ArrowUpRight className="h-4 w-4" />
                </a>
              </div>
              <div className="mt-6 flex h-3 w-full overflow-hidden rounded-full bg-slate-700" role="img"
                aria-label={'Success ' + successRatio + ' percent; failure ' + failureRatio + ' percent'}>
                <div className="bg-indigo-400" style={{ width: successRatio + '%' }} />
                <div className="bg-rose-400" style={{ width: failureRatio + '%' }} />
              </div>
              <div className="mt-3 flex flex-wrap gap-6 text-xs text-slate-300">
                <span><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-indigo-400" />Success {successRatio}%</span>
                <span><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-rose-400" />Failure {failureRatio}%</span>
                <span>Other runs are excluded from these two percentages</span>
              </div>
            </section>

            <section className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
              <div className="border-b border-slate-800 p-6">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                  <GitBranch className="h-5 w-5 text-indigo-300" /> Recent workflow runs
                </h2>
                <p className="mt-2 text-sm text-slate-400">{report.scope_note}</p>
              </div>
              <ul className="divide-y divide-slate-800">
                {report.runs.map(run => (
                  <li key={run.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-100">{run.name}</div>
                      <div className="mt-1 text-xs text-slate-400">{run.event} · {run.created_at.slice(0, 10)} UTC · #{run.id}</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={'rounded-full px-3 py-1 text-xs font-medium ' +
                        (run.conclusion === 'success' ? 'bg-indigo-400/15 text-indigo-200' :
                          run.conclusion === 'failure' ? 'bg-rose-400/15 text-rose-200' :
                            'bg-slate-700 text-slate-200')}>
                        {statLabel(run.conclusion, run.status)}
                      </span>
                      <a href={run.html_url} target="_blank" rel="noopener noreferrer" aria-label={'Inspect run ' + run.id}
                        className="text-slate-300 hover:text-indigo-300"><ArrowUpRight className="h-5 w-5" /></a>
                    </div>
                  </li>
                ))}
                {report.runs.length === 0 &&
                  <li className="p-6 text-sm text-slate-400">No workflow runs found for this public repository.</li>}
              </ul>
            </section>
          </>
        )}

        <footer className="mt-10 border-t border-slate-800 pt-6 text-sm leading-6 text-slate-400">
          Developer tooling demo · No GitHub permissions requested.
          Advanced date, event, status and multi-repository comparisons are available in the
          {' '}<a className="font-medium text-indigo-300 hover:text-white"
            href="https://github.com/senanurcetin/Ops-Copilot/blob/main/docs/github-actions-integration.md"
            target="_blank" rel="noopener noreferrer">open-source CLI integration</a>.
          This page is not a billing or performance benchmark.
        </footer>
      </div>
    </main>
  );
}
