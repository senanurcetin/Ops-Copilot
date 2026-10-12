#!/usr/bin/env node
/**
 * Read-only GitHub Actions usage inspector.
 * Integrates with the GitHub REST API; never triggers a workflow or modifies a repository.
 * The durations reported are estimates, NOT GitHub billing totals.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.github.com';

export function validateRepository(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error('Repository must be in owner/name format (for example, senanurcetin/Ops-Copilot).');
  }
  const [owner, name] = value.split('/');
  if (owner === '.' || owner === '..' || name === '.' || name === '..') {
    throw new Error('Invalid repository owner or name.');
  }
  return [owner, name];
}

export function jobDurationMinutes(job) {
  if (!job?.started_at || !job?.completed_at) return 0;
  const start = Date.parse(job.started_at);
  const end = Date.parse(job.completed_at);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start
    ? (end - start) / 60000
    : 0;
}

export function summarizeRuns(repository, runs, jobsByRun) {
  const workflows = new Map();
  let totalJobMinutes = 0;
  let completedJobs = 0;
  let incompleteJobs = 0;
  for (const run of runs) {
    const name = run.name || `workflow #${run.workflow_id || 'unknown'}`;
    if (!workflows.has(name)) {
      workflows.set(name, {
        name, runs: 0, failures: 0, cancelled: 0, scheduled: 0,
        job_count: 0, elapsed_job_minutes: 0,
      });
    }
    const item = workflows.get(name);
    item.runs++;
    if (run.conclusion === 'failure') item.failures++;
    if (run.conclusion === 'cancelled') item.cancelled++;
    if (run.event === 'schedule') item.scheduled++;
    for (const job of jobsByRun.get(run.id) || []) {
      if (!job.started_at || !job.completed_at) {
        incompleteJobs++;
        continue;
      }
      const duration = jobDurationMinutes(job);
      item.elapsed_job_minutes += duration;
      totalJobMinutes += duration;
      item.job_count++;
      completedJobs++;
    }
  }
  const round = value => Math.round(value * 10) / 10;
  const data = [...workflows.values()].map(w => ({
    ...w, elapsed_job_minutes: round(w.elapsed_job_minutes),
  })).sort((a, b) => b.elapsed_job_minutes - a.elapsed_job_minutes || b.runs - a.runs);
  const recommendations = [];
  for (const w of data) {
    if (w.scheduled >= 5) {
      recommendations.push(`${w.name}: ${w.scheduled} scheduled runs in the sample; review cron frequency and move simple uptime pings outside Actions.`);
    }
    if (w.failures >= 2) {
      recommendations.push(`${w.name}: ${w.failures} failed runs; investigate repeated failures before rerunning expensive jobs.`);
    }
    if (w.elapsed_job_minutes >= 30) {
      recommendations.push(`${w.name}: ${w.elapsed_job_minutes} elapsed job-minutes in the sample; consider path filters, caching and cancelling superseded runs.`);
    }
  }
  return {
    repository,
    inspected_runs: runs.length,
    completed_jobs: completedJobs,
    incomplete_jobs: incompleteJobs,
    elapsed_job_minutes: round(totalJobMinutes),
    metric_note: 'Summed elapsed job time, not GitHub billable minutes, billed cost, or monthly account usage.',
    workflows: data,
    recommendations,
  };
}

async function getJson(path, token, fetchImpl) {
  const response = await fetchImpl(`${API}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ops-copilot-actions-auditor',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const reason = response.status === 401 || response.status === 403 || response.status === 404
      ? 'Check access permissions, token scope (Actions: read), and API rate limits.'
      : 'GitHub API request failed.';
    throw new Error(`GitHub API HTTP ${response.status}. ${reason}`);
  }
  return response.json();
}

export async function auditRepository({ repository, token, limit = 30, fetchImpl = fetch }) {
  const [owner, repo] = validateRepository(repository);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('--limit must be an integer from 1 to 100.');
  }
  const prefix = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const runsResult = await getJson(`${prefix}/actions/runs?per_page=${limit}&page=1`, token, fetchImpl);
  const runs = Array.isArray(runsResult.workflow_runs) ? runsResult.workflow_runs.slice(0, limit) : [];
  const jobsByRun = new Map();
  let truncated = false;
  // Sequential reads deliberately respect unauthenticated and low-rate-limit accounts.
  for (const run of runs) {
    if (!Number.isSafeInteger(run.id)) continue;
    const firstPage = await getJson(`${prefix}/actions/runs/${run.id}/jobs?per_page=100&page=1`, token, fetchImpl);
    const jobs = Array.isArray(firstPage.jobs) ? [...firstPage.jobs] : [];
    const total = Number(firstPage.total_count) || jobs.length;
    const additionalPages = Math.min(Math.ceil(total / 100), 5);
    for (let page = 2; page <= additionalPages; page++) {
      const payload = await getJson(`${prefix}/actions/runs/${run.id}/jobs?per_page=100&page=${page}`, token, fetchImpl);
      jobs.push(...(Array.isArray(payload.jobs) ? payload.jobs : []));
    }
    if (total > jobs.length) truncated = true;
    jobsByRun.set(run.id, jobs);
  }
  return {
    ...summarizeRuns(repository, runs, jobsByRun),
    sample_warning: truncated
      ? 'Some runs contain more than 500 jobs; sampled job durations are incomplete.'
      : runs.length === limit
        ? 'The sample may exclude older runs; this is not an account-wide monthly report.'
        : null,
  };
}

function usage() {
  return [
    'Usage: node scripts/github-actions-audit.mjs owner/repo [--limit 30] [--json]',
    'Optional: GH_TOKEN or GITHUB_TOKEN for private repositories and higher API limits.',
    'Required permissions for fine-grained tokens: Actions (read-only).',
    'No GitHub Actions runner is required to execute this tool locally.',
  ].join('\n');
}

export function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  let repository;
  let limit = 30;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') json = true;
    else if (arg === '--limit') {
      if (!/^\d+$/.test(args[i + 1] || '')) throw new Error('--limit requires a positive integer.');
      limit = Number(args[++i]);
    } else if (arg.startsWith('-') || repository) throw new Error(`Unknown or repeated argument: ${arg}`);
    else repository = arg;
  }
  if (!repository) throw new Error('Missing owner/repo.');
  validateRepository(repository);
  if (limit < 1 || limit > 100) throw new Error('--limit must be between 1 and 100.');
  return { repository, limit, json };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) return console.log(usage());
    const data = await auditRepository({
      repository: options.repository,
      limit: options.limit,
      token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN,
    });
    if (options.json) return console.log(JSON.stringify(data, null, 2));
    console.log(`# GitHub Actions audit: ${data.repository}`);
    console.log(`Runs sampled: ${data.inspected_runs} | Completed jobs: ${data.completed_jobs} | Elapsed job-minutes: ${data.elapsed_job_minutes}`);
    console.log(`NOTE: ${data.metric_note}`);
    for (const w of data.workflows) {
      console.log(`- ${w.name}: ${w.runs} runs, ${w.failures} failures, ${w.elapsed_job_minutes} elapsed job-minutes`);
    }
    if (data.sample_warning) console.log(`Warning: ${data.sample_warning}`);
    if (data.recommendations.length) {
      console.log('Recommendations:');
      for (const message of data.recommendations) console.log(`- ${message}`);
    }
  } catch (error) {
    console.error(`Audit failed: ${error.message}`);
    console.error(usage());
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
