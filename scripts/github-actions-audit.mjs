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

/** Validate either boundary and reject reversed inclusive UTC date ranges. */
export function validateDateRange({ since, until }) {
  if (since !== undefined) validateSinceDate(since);
  if (until !== undefined) {
    try { validateSinceDate(until); }
    catch { throw new Error('--until must be a valid YYYY-MM-DD calendar date (UTC).'); }
  }
  if (since && until && since > until) {
    throw new Error('--since must not be later than --until.');
  }
  return { ...(since ? { since } : {}), ...(until ? { until } : {}) };
}

/** Build GitHub REST date search syntax; both boundary dates are inclusive. */
export function createdDateFilter({ since, until }) {
  validateDateRange({ since, until });
  if (since && until) return since + '..' + until;
  if (since) return '>=' + since;
  if (until) return '<=' + until;
  return null;
}

/** Check CLI branch values before encoding them into a GitHub API query. */
export function validateBranch(value) {
  if (typeof value !== 'string' || !value || value.length > 255 ||
      value.startsWith('-') || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error('--branch requires a nonempty branch name (max 255 characters).');
  }
  return value;
}

/** GitHub exposes an event filter without a fixed enum. Reject malformed names. */
export function validateEvent(value) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(value)) {
    throw new Error('--event requires a GitHub Actions event name (e.g. push, pull_request, schedule).');
  }
  return value;
}

const ACTIONS_STATUSES = new Set([
  'completed', 'action_required', 'cancelled', 'failure', 'neutral',
  'skipped', 'stale', 'success', 'timed_out', 'in_progress',
  'queued', 'requested', 'waiting', 'pending',
]);

export function validateStatus(value) {
  if (typeof value !== 'string' || !ACTIONS_STATUSES.has(value)) {
    throw new Error('--status must be a supported GitHub Actions status or conclusion.');
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
    ...(report.total_matching_runs !== undefined ?
      ['- Runs matching the GitHub API query: **' + report.total_matching_runs + '**'] : []),
    '- Completed jobs: **' + report.completed_jobs + '**',
    '- Jobs without valid completed timestamps: **' + report.incomplete_jobs + '**',
    '- Elapsed job-minutes in this sample: **' + report.elapsed_job_minutes + '**',
    ...(report.since ? ['- Created since (UTC): **' + report.since + '**'] : []),
    ...(report.until ? ['- Created until (UTC): **' + report.until + '**'] : []),
    ...(report.branch ? ['- Branch: **' + escapeMarkdown(report.branch) + '**'] : []),
    ...(report.event ? ['- Trigger event: **' + escapeMarkdown(report.event) + '**'] : []),
    ...(report.status ? ['- Run status/conclusion: **' + escapeMarkdown(report.status) + '**'] : []),
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

/** Bounded, process-local cache for anonymous GitHub REST GET data only. */
export function createPublicGithubCache({ ttlMs = 30000, maxEntries = 100, now = Date.now } = {}) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || !Number.isSafeInteger(maxEntries) ||
      maxEntries < 1 || maxEntries > 1000 || typeof now !== 'function') {
    throw new Error('Invalid public GitHub response cache configuration.');
  }
  const entries = new Map();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }
      return structuredClone(entry.value);
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, { value: structuredClone(value), expiresAt: now() + ttlMs });
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    },
    size() { return entries.size; },
  };
}

const defaultPublicCache = createPublicGithubCache();

/** Parse both HTTP Retry-After formats: delta-seconds or an HTTP-date.
 * An absent header is unknown; a malformed header is untrusted and must
 * never be treated as permission to retry immediately.
 * Returns milliseconds, null if absent, or Infinity for invalid values.
 */
export function parseRetryAfter(value, nowMs = Date.now()) {
  if (value == null) return null;
  if (typeof value !== 'string' || !value.trim()) return Infinity;
  const raw = value.trim();
  if (/^\d+$/.test(raw)) {
    const seconds = Number(raw);
    return Number.isSafeInteger(seconds) && seconds <= Number.MAX_SAFE_INTEGER / 1000
      ? seconds * 1000 : Infinity;
  }
  // An HTTP-date should be RFC-style, not e.g. a signed or ambiguous number.
  if (!/^[A-Za-z]+,\s/.test(raw)) return Infinity;
  const expires = Date.parse(raw);
  if (!Number.isFinite(expires) || !Number.isFinite(nowMs)) return Infinity;
  return Math.max(0, expires - nowMs);
}

// Only idempotent GitHub GETs are retried. Never retry a long rate-limit reset
// immediately, or leak the API response body (which may contain sensitive data).
async function getJson(path, token, fetchImpl, cache = null) {
  const cached = !token && cache ? cache.get(path) : undefined;
  if (cached !== undefined) return cached;
  for (let attempt = 0; attempt <= 2; attempt++) {
    let response;
    try {
      response = await fetchImpl(`${API}${path}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'ops-copilot-actions-auditor',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new Error('GitHub API request failed or timed out.');
    }
    if (response.ok) {
      let data;
      try { data = await response.json(); }
      catch { throw new Error('GitHub API returned invalid JSON.'); }
      if (!token && cache) cache.set(path, data);
      return data;
    }
    const remaining = response.headers?.get?.('x-ratelimit-remaining');
    const retryAfterRaw = response.headers?.get?.('retry-after');
    const retryAfterMs = parseRetryAfter(retryAfterRaw);
    const limited = response.status === 429 ||
      (response.status === 403 && (remaining === '0' || retryAfterRaw != null));
    const transient = [502, 503, 504].includes(response.status);
    // Respect a short Retry-After, otherwise use a conservative bounded backoff.
    // A long Retry-After means fail with guidance rather than hammering GitHub.
    const canRetry = attempt < 2 && (response.status === 429 ||
      (response.status === 403 && retryAfterMs !== null) || transient) &&
      (retryAfterMs === null || retryAfterMs <= 3000);
    if (canRetry) {
      await new Promise(resolve => setTimeout(resolve,
        retryAfterMs !== null ? retryAfterMs : 250 * 2 ** attempt));
      continue;
    }
    const reason = limited
      ? 'API rate limit reached. Retry after the GitHub rate-limit window resets or use a scoped read-only token.'
      : response.status === 401 || response.status === 403 || response.status === 404
        ? 'Check repository access and token permissions (Actions: read).'
        : 'GitHub API request failed.';
    throw new Error(`GitHub API HTTP ${response.status}. ${reason}`);
  }
  throw new Error('GitHub API request could not be completed.');
}

export async function auditRepository({ repository, token, limit = 30, since, until, branch, event, status, fetchImpl = fetch, publicCache }) {
  const [owner, repo] = validateRepository(repository);
  validateDateRange({ since, until });
  if (branch !== undefined) validateBranch(branch);
  if (event !== undefined) validateEvent(event);
  if (status !== undefined) validateStatus(status);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('--limit must be an integer from 1 to 100.');
  }
  const prefix = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const cache = token ? null : (publicCache ?? (fetchImpl === fetch ? defaultPublicCache : null));
  const dateValue = createdDateFilter({ since, until });
  const dateFilter = dateValue ? '&created=' + encodeURIComponent(dateValue) : '';
  const branchFilter = branch ? '&branch=' + encodeURIComponent(branch) : '';
  const eventFilter = event ? '&event=' + encodeURIComponent(event) : '';
  const statusFilter = status ? '&status=' + encodeURIComponent(status) : '';
  const runsResult = await getJson(`${prefix}/actions/runs?per_page=${limit}&page=1${dateFilter}${branchFilter}${eventFilter}${statusFilter}`, token, fetchImpl, cache);
  if (!runsResult || !Array.isArray(runsResult.workflow_runs)) {
    throw new Error('Unexpected GitHub API response: workflow_runs must be an array.');
  }
  // GitHub provides total_count for matching workflow runs. Some synthetic
  // and legacy fixtures omit it, so retain a cautious unknown-coverage mode.
  const totalMatches = runsResult.total_count;
  if (totalMatches !== undefined &&
      (!Number.isSafeInteger(totalMatches) || totalMatches < 0 ||
        totalMatches < runsResult.workflow_runs.length)) {
    throw new Error('Unexpected GitHub API response: invalid workflow run total_count.');
  }
  const runs = runsResult.workflow_runs.slice(0, limit);
  const jobsByRun = new Map();
  let truncated = false;
  // Sequential reads deliberately respect unauthenticated and low-rate-limit accounts.
  for (const run of runs) {
    if (!Number.isSafeInteger(run?.id) || run.id < 1) {
      throw new Error('Unexpected GitHub API response: invalid workflow run id.');
    }
    const firstPage = await getJson(`${prefix}/actions/runs/${run.id}/jobs?per_page=100&page=1`, token, fetchImpl, cache);
    if (!firstPage || !Array.isArray(firstPage.jobs) ||
        !Number.isSafeInteger(firstPage.total_count) || firstPage.total_count < firstPage.jobs.length) {
      throw new Error('Unexpected GitHub API response: invalid job collection.');
    }
    const jobs = [...firstPage.jobs];
    const total = firstPage.total_count;
    const additionalPages = Math.min(Math.ceil(total / 100), 5);
    for (let page = 2; page <= additionalPages; page++) {
      const payload = await getJson(`${prefix}/actions/runs/${run.id}/jobs?per_page=100&page=${page}`, token, fetchImpl, cache);
      if (!payload || !Array.isArray(payload.jobs)) {
        throw new Error('Unexpected GitHub API response: invalid job page.');
      }
      jobs.push(...payload.jobs);
    }
    // A short page, changing pagination or a duplicated job can silently
    // understate/overstate elapsed time. Fail closed instead of reporting
    // a partial result as a complete sample.
    const expectedCount = Math.min(total, 500);
    if (jobs.length !== expectedCount) {
      throw new Error('Unexpected GitHub API response: inconsistent job count for run ' + run.id + '.');
    }
    const knownIds = jobs.filter(job => Number.isSafeInteger(job?.id) && job.id > 0)
      .map(job => job.id);
    if (new Set(knownIds).size !== knownIds.length) {
      throw new Error('Unexpected GitHub API response: duplicate job IDs for run ' + run.id + '.');
    }
    if (total > 500) truncated = true;
    jobsByRun.set(run.id, jobs);
  }
  return {
    ...summarizeRuns(repository, runs, jobsByRun),
    ...(totalMatches !== undefined ? { total_matching_runs: totalMatches } : {}),
    ...(since ? { since } : {}),
    ...(until ? { until } : {}),
    ...(branch ? { branch } : {}),
    ...(event ? { event } : {}),
    ...(status ? { status } : {}),
    sample_warning: [
      ...(truncated ? ['Some runs contain more than 500 jobs; sampled job durations are incomplete.'] : []),
      ...(totalMatches !== undefined && totalMatches > runs.length
        ? ['Only ' + runs.length + ' of ' + totalMatches +
            ' matching workflow runs were sampled; the results are not an account-wide monthly report.']
        : totalMatches === undefined && runs.length === limit
          ? ['The sample may exclude older runs; the API match count was unavailable. This is not an account-wide monthly report.']
          : []),
    ].join(' ') || null,
  };
}

function usage() {
  return [
    'Usage: node scripts/github-actions-audit.mjs owner/repo [--limit 30] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--branch REF] [--event EVENT] [--status STATUS] [--json | --markdown]',
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
  let until;
  let branch;
  let event;
  let status;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') json = true;
    else if (arg === '--markdown') markdown = true;
    else if (arg === '--since') since = validateSinceDate(args[++i]);
    else if (arg === '--until') {
      if (!args[i + 1] || args[i + 1].startsWith('-')) {
        throw new Error('--until requires a valid YYYY-MM-DD (UTC).');
      }
      until = validateDateRange({ until: args[++i] }).until;
    }
    else if (arg === '--branch') branch = validateBranch(args[++i]);
    else if (arg === '--event') event = validateEvent(args[++i]);
    else if (arg === '--status') status = validateStatus(args[++i]);
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
  validateDateRange({ since, until });
  return { repository, limit, json, ...(since ? { since } : {}), ...(until ? { until } : {}), ...(branch ? { branch } : {}), ...(event ? { event } : {}), ...(status ? { status } : {}), ...(markdown ? { markdown } : {}) };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) return console.log(usage());
    const data = await auditRepository({
      repository: options.repository,
      limit: options.limit,
      since: options.since,
      until: options.until,
      branch: options.branch,
      event: options.event,
      status: options.status,
      token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN,
    });
    if (options.json) return console.log(JSON.stringify(data, null, 2));
    if (options.markdown) return process.stdout.write(renderMarkdownReport(data));
    console.log(`# GitHub Actions audit: ${data.repository}`);
    console.log(`Runs sampled: ${data.inspected_runs} | Completed jobs: ${data.completed_jobs} | Jobs with incomplete/invalid timings: ${data.incomplete_jobs} | Elapsed job-minutes: ${data.elapsed_job_minutes}`);
    if (data.total_matching_runs !== undefined) console.log(`Runs matching GitHub API query: ${data.total_matching_runs}`);
    console.log(`NOTE: ${data.metric_note}`);
    if (data.since) console.log(`Created since (UTC): ${data.since}`);
    if (data.until) console.log(`Created until (UTC): ${data.until}`);
    if (data.branch) console.log(`Branch: ${data.branch}`);
    if (data.event) console.log(`Trigger event: ${data.event}`);
    if (data.status) console.log(`Run status/conclusion: ${data.status}`);
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
