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


/** Require a real calendar day. The API interprets the date in UTC. */
export function validateSinceDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('--since must use YYYY-MM-DD (UTC).');
  }
  const date = new Date(value + 'T00:00:00.000Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('--since must be a valid calendar date.');
  }
  return value;
}

/** Check CLI branch values before encoding them into a GitHub API query. */
export function validateBranch(value) {
  if (typeof value !== 'string' || !value || value.length > 255 ||
      value.startsWith('-') || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error('--branch requires a nonempty branch name (max 255 characters).');
  }
  return value;
}

/** Escape untrusted workflow names before they appear in a Markdown table. */
function escapeMarkdown(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('|', '\\|')
    .replace(/\r?\n/g, ' ').replaceAll('\r', ' ');
}

export function renderMarkdownReport(report) {
  const rows = [
    '# GitHub Actions report: ' + escapeMarkdown(report.repository),
    '',
    '- Recent runs inspected: **' + report.inspected_runs + '**',
    '- Completed jobs: **' + report.completed_jobs + '**',
    '- Jobs without valid completed timestamps: **' + report.incomplete_jobs + '**',
    '- Elapsed job-minutes in this sample: **' + report.elapsed_job_minutes + '**',
    ...(report.since ? ['- Created since (UTC): **' + report.since + '**'] : []),
    ...(report.branch ? ['- Branch: **' + escapeMarkdown(report.branch) + '**'] : []),
    '',
    '> ' + report.metric_note,
    '',
    '| Workflow | Runs | Failures | Scheduled | Elapsed job-minutes |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...report.workflows.map(w => '| ' + escapeMarkdown(w.name) +
      (w.workflow_id ? ' (#' + w.workflow_id + ')' : '') + ' | ' + w.runs +
      ' | ' + w.failures + ' | ' + w.scheduled + ' | ' + w.elapsed_job_minutes + ' |'),
    '',
  ];
  if (report.sample_warning) rows.push('**Sampling limitation:** ' + escapeMarkdown(report.sample_warning), '');
  rows.push('## Suggested reviews', '');
  if (report.recommendations.length === 0) rows.push('No heuristic review flags within this sample.');
  else rows.push(...report.recommendations.map(message => '- ' + escapeMarkdown(message)));
  return rows.join('\n') + '\n';
}

// A zero-minute job is valid. Missing or invalid timestamps are *not*.
function completedJobMinutes(job) {
  if (typeof job?.started_at !== 'string' || typeof job?.completed_at !== 'string') return null;
  const start = Date.parse(job.started_at);
  const end = Date.parse(job.completed_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return (end - start) / 60000;
}

export function jobDurationMinutes(job) {
  return completedJobMinutes(job) ?? 0;
}

export function summarizeRuns(repository, runs, jobsByRun) {
  const workflows = new Map();
  let totalJobMinutes = 0;
  let completedJobs = 0;
  let incompleteJobs = 0;
  for (const run of runs) {
    // The display name is not a stable identifier: two workflow files can
    // share it, and a workflow can be renamed while keeping its ID.
    const workflowId = Number.isSafeInteger(run.workflow_id) && run.workflow_id > 0
      ? run.workflow_id : null;
    const name = run.name || (workflowId ? 'workflow #' + workflowId : 'workflow #unknown');
    const groupKey = workflowId ? 'id:' + workflowId : 'name:' + name;
    if (!workflows.has(groupKey)) {
      workflows.set(groupKey, {
        name, workflow_id: workflowId, runs: 0, failures: 0, cancelled: 0, scheduled: 0,
        job_count: 0, elapsed_job_minutes: 0,
      });
    }
    const item = workflows.get(groupKey);
    item.runs++;
    if (run.conclusion === 'failure') item.failures++;
    if (run.conclusion === 'cancelled') item.cancelled++;
    if (run.event === 'schedule') item.scheduled++;
    for (const job of jobsByRun.get(run.id) || []) {
      const duration = completedJobMinutes(job);
      if (duration === null) {
        incompleteJobs++;
        continue;
      }
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
    const label = w.name + (w.workflow_id ? ' (#' + w.workflow_id + ')' : '');
    if (w.scheduled >= 5) {
      recommendations.push(`${label}: ${w.scheduled} scheduled runs in the sample; review cron frequency and move simple uptime pings outside Actions.`);
    }
    if (w.failures >= 2) {
      recommendations.push(`${label}: ${w.failures} failed runs; investigate repeated failures before rerunning expensive jobs.`);
    }
    if (w.elapsed_job_minutes >= 30) {
      recommendations.push(`${label}: ${w.elapsed_job_minutes} elapsed job-minutes in the sample; consider path filters, caching and cancelling superseded runs.`);
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
    const limited = response.status === 429 ||
      (response.status === 403 && response.headers?.get?.('x-ratelimit-remaining') === '0');
    const reason = limited
      ? 'API rate limit reached. Retry after the GitHub rate-limit window resets or use a scoped read-only token.'
      : response.status === 401 || response.status === 403 || response.status === 404
        ? 'Check repository access and token permissions (Actions: read).'
        : 'GitHub API request failed.';
    throw new Error(`GitHub API HTTP ${response.status}. ${reason}`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error('GitHub API returned invalid JSON.');
  }
}

export async function auditRepository({ repository, token, limit = 30, since, branch, fetchImpl = fetch }) {
  const [owner, repo] = validateRepository(repository);
  if (since !== undefined) validateSinceDate(since);
  if (branch !== undefined) validateBranch(branch);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('--limit must be an integer from 1 to 100.');
  }
  const prefix = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const dateFilter = since ? '&created=' + encodeURIComponent('>=' + since) : '';
  const branchFilter = branch ? '&branch=' + encodeURIComponent(branch) : '';
  const runsResult = await getJson(`${prefix}/actions/runs?per_page=${limit}&page=1${dateFilter}${branchFilter}`, token, fetchImpl);
  if (!runsResult || !Array.isArray(runsResult.workflow_runs)) {
    throw new Error('Unexpected GitHub API response: workflow_runs must be an array.');
  }
  const runs = runsResult.workflow_runs.slice(0, limit);
  const jobsByRun = new Map();
  let truncated = false;
  // Sequential reads deliberately respect unauthenticated and low-rate-limit accounts.
  for (const run of runs) {
    if (!Number.isSafeInteger(run?.id) || run.id < 1) {
      throw new Error('Unexpected GitHub API response: invalid workflow run id.');
    }
    const firstPage = await getJson(`${prefix}/actions/runs/${run.id}/jobs?per_page=100&page=1`, token, fetchImpl);
    if (!firstPage || !Array.isArray(firstPage.jobs) ||
        !Number.isSafeInteger(firstPage.total_count) || firstPage.total_count < firstPage.jobs.length) {
      throw new Error('Unexpected GitHub API response: invalid job collection.');
    }
    const jobs = [...firstPage.jobs];
    const total = firstPage.total_count;
    const additionalPages = Math.min(Math.ceil(total / 100), 5);
    for (let page = 2; page <= additionalPages; page++) {
      const payload = await getJson(`${prefix}/actions/runs/${run.id}/jobs?per_page=100&page=${page}`, token, fetchImpl);
      if (!payload || !Array.isArray(payload.jobs)) {
        throw new Error('Unexpected GitHub API response: invalid job page.');
      }
      jobs.push(...payload.jobs);
    }
    if (total > jobs.length) truncated = true;
    jobsByRun.set(run.id, jobs);
  }
  return {
    ...summarizeRuns(repository, runs, jobsByRun),
    ...(since ? { since } : {}),
    ...(branch ? { branch } : {}),
    sample_warning: [
      ...(truncated ? ['Some runs contain more than 500 jobs; sampled job durations are incomplete.'] : []),
      ...(runs.length === limit ? ['The sample may exclude older runs; this is not an account-wide monthly report.'] : []),
    ].join(' ') || null,
  };
}

function usage() {
  return [
    'Usage: node scripts/github-actions-audit.mjs owner/repo [--limit 30] [--since YYYY-MM-DD] [--branch REF] [--json | --markdown]',
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
  let markdown = false;
  let since;
  let branch;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') json = true;
    else if (arg === '--markdown') markdown = true;
    else if (arg === '--since') since = validateSinceDate(args[++i]);
    else if (arg === '--branch') branch = validateBranch(args[++i]);
    else if (arg === '--limit') {
      if (!/^\d+$/.test(args[i + 1] || '')) throw new Error('--limit requires a positive integer.');
      limit = Number(args[++i]);
    } else if (arg.startsWith('-') || repository) throw new Error(`Unknown or repeated argument: ${arg}`);
    else repository = arg;
  }
  if (!repository) throw new Error('Missing owner/repo.');
  validateRepository(repository);
  if (limit < 1 || limit > 100) throw new Error('--limit must be between 1 and 100.');
  if (json && markdown) throw new Error('Choose either --json or --markdown, not both.');
  return { repository, limit, json, ...(since ? { since } : {}), ...(branch ? { branch } : {}), ...(markdown ? { markdown } : {}) };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) return console.log(usage());
    const data = await auditRepository({
      repository: options.repository,
      limit: options.limit,
      since: options.since,
      branch: options.branch,
      token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN,
    });
    if (options.json) return console.log(JSON.stringify(data, null, 2));
    if (options.markdown) return process.stdout.write(renderMarkdownReport(data));
    console.log(`# GitHub Actions audit: ${data.repository}`);
    console.log(`Runs sampled: ${data.inspected_runs} | Completed jobs: ${data.completed_jobs} | Jobs with incomplete/invalid timings: ${data.incomplete_jobs} | Elapsed job-minutes: ${data.elapsed_job_minutes}`);
    console.log(`NOTE: ${data.metric_note}`);
    if (data.since) console.log(`Created since (UTC): ${data.since}`);
    if (data.branch) console.log(`Branch: ${data.branch}`);
    for (const w of data.workflows) {
      const workflowLabel = w.name + (w.workflow_id ? ' (#' + w.workflow_id + ')' : '');
      console.log(`- ${workflowLabel}: ${w.runs} runs, ${w.failures} failures, ${w.elapsed_job_minutes} elapsed job-minutes`);
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
