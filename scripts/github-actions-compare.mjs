#!/usr/bin/env node
/**
 * Compare sampled GitHub Actions job time across a small set of repositories.
 * All API calls are read-only; this tool does not trigger GitHub Actions.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditRepository, validateRepository, validateSinceDate, validateDateRange, validateEvent, validateStatus } from './github-actions-audit.mjs';

export const MAX_REPOSITORIES = 5;
export const COMPARISON_NOTE =
  'Observed elapsed job-minutes are sampled diagnostics, NOT GitHub billed minutes, cost, ' +
  'or account-wide usage. Repositories can have different run frequencies, job ' +
  'complexity and omitted older runs; this is not a normalized performance ranking.';

function validateRepositories(repositories) {
  if (!Array.isArray(repositories) || repositories.length < 2 ||
      repositories.length > MAX_REPOSITORIES) {
    throw new Error('Choose between 2 and 5 repositories in owner/name format.');
  }
  const unique = new Set();
  for (const repository of repositories) {
    validateRepository(repository);
    const key = repository.toLowerCase();
    if (unique.has(key)) throw new Error('Each repository must be unique.');
    unique.add(key);
  }
  return repositories;
}

export function parseComparisonArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const repositories = [];
  let limit = 10;
  let since;
  let until;
  let event;
  let status;
  let json = false;
  let markdown = false;
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
    else if (arg === '--event') event = validateEvent(args[++i]);
    else if (arg === '--status') status = validateStatus(args[++i]);
    else if (arg === '--limit') {
      if (!/^\d+$/.test(args[i + 1] || '')) throw new Error('--limit requires a positive integer.');
      limit = Number(args[++i]);
    } else if (arg.startsWith('-')) {
      throw new Error('Unknown option: ' + arg);
    } else {
      validateRepository(arg);
      repositories.push(arg);
    }
  }
  validateRepositories(repositories);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('--limit must be between 1 and 100.');
  }
  if (json && markdown) throw new Error('Choose either --json or --markdown, not both.');
  validateDateRange({ since, until });
  return { repositories, limit, ...(since ? { since } : {}), ...(until ? { until } : {}), ...(event ? { event } : {}), ...(status ? { status } : {}), json, markdown };
}

/**
 * Sequentially audit each repo to avoid needlessly bursting API rate limits.
 * On any failed API call, reject rather than presenting a misleading partial comparison.
 * auditImpl allows fully offline and reproducible tests.
 */
export async function compareRepositories({
  repositories, limit = 10, since, until, event, status, token, auditImpl = auditRepository,
}) {
  validateRepositories(repositories);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('--limit must be between 1 and 100.');
  }
  validateDateRange({ since, until });
  if (event !== undefined) validateEvent(event);
  if (status !== undefined) validateStatus(status);
  const records = [];
  for (const repository of repositories) {
    let report;
    try {
      report = await auditImpl({ repository, limit, since, ...(until ? { until } : {}), ...(event ? { event } : {}), ...(status ? { status } : {}), token });
    } catch (error) {
      throw new Error('Could not audit ' + repository + ': ' + error.message);
    }
    if (!report || report.repository !== repository || !Array.isArray(report.workflows) ||
        !Number.isFinite(report.elapsed_job_minutes) ||
        !Number.isSafeInteger(report.inspected_runs) || report.inspected_runs < 0 ||
        !Number.isSafeInteger(report.completed_jobs) || report.completed_jobs < 0 ||
        !Number.isSafeInteger(report.incomplete_jobs) || report.incomplete_jobs < 0 ||
        (report.total_matching_runs !== undefined &&
          (!Number.isSafeInteger(report.total_matching_runs) ||
           report.total_matching_runs < report.inspected_runs))) {
      throw new Error('Unexpected audit result for ' + repository + '.');
    }
    records.push({
      repository,
      inspected_runs: report.inspected_runs,
      ...(report.total_matching_runs !== undefined ? { total_matching_runs: report.total_matching_runs } : {}),
      failed_runs: report.workflows.reduce((sum, w) => sum + w.failures, 0),
      scheduled_runs: report.workflows.reduce((sum, w) => sum + w.scheduled, 0),
      completed_jobs: report.completed_jobs,
      incomplete_jobs: report.incomplete_jobs,
      elapsed_job_minutes: report.elapsed_job_minutes,
      sample_warning: report.sample_warning || null,
    });
  }
  // Sort for navigation only: these sample-based minutes are not a normalized
  // measure of efficiency, expense, quality, or account-level consumption.
  records.sort((a, b) =>
    b.elapsed_job_minutes - a.elapsed_job_minutes ||
    a.repository.localeCompare(b.repository));
  return {
    repositories_inspected: records.length,
    limit_per_repository: limit,
    ...(since ? { since } : {}),
    ...(until ? { until } : {}),
    ...(event ? { event } : {}),
    ...(status ? { status } : {}),
    comparison_note: COMPARISON_NOTE,
    repositories: records,
  };
}

function escapeMarkdown(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('|', '\\|')
    .replace(/\r?\n/g, ' ').replaceAll('\r', ' ');
}

export function renderComparisonMarkdown(report) {
  const lines = [
    '# GitHub Actions repository comparison',
    '',
    '- Repositories inspected: **' + report.repositories_inspected + '**',
    '- Maximum recent runs per repository: **' + report.limit_per_repository + '**',
    ...(report.since ? ['- Created since (UTC): **' + report.since + '**'] : []),
    ...(report.until ? ['- Created until (UTC): **' + report.until + '**'] : []),
    ...(report.event ? ['- Trigger event: **' + escapeMarkdown(report.event) + '**'] : []),
    ...(report.status ? ['- Run status/conclusion: **' + escapeMarkdown(report.status) + '**'] : []),
    '',
    '> ' + report.comparison_note,
    '',
    '| Repository | Runs | Failures | Scheduled | Completed jobs | Incomplete jobs | Elapsed job-minutes | API matches |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...report.repositories.map(r => '| ' + escapeMarkdown(r.repository) +
      ' | ' + r.inspected_runs + ' | ' + r.failed_runs + ' | ' + r.scheduled_runs +
      ' | ' + r.completed_jobs + ' | ' + r.incomplete_jobs +
      ' | ' + r.elapsed_job_minutes + ' | ' +
      (r.total_matching_runs === undefined ? 'unknown' : r.total_matching_runs) + ' |'),
    '',
  ];
  const warnings = report.repositories.filter(r => r.sample_warning);
  if (warnings.length) {
    lines.push('## Sampling limitations', '');
    for (const record of warnings) {
      lines.push('- **' + escapeMarkdown(record.repository) + ':** ' +
        escapeMarkdown(record.sample_warning));
    }
    lines.push('');
  }
  return lines.join('\n') + '\n';
}

function usage() {
  return [
    'Usage: node scripts/github-actions-compare.mjs owner/repo1 owner/repo2 [owner/repo3 ...] [--limit 10] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--event EVENT] [--status STATUS] [--json | --markdown]',
    'Compare 2–5 repositories. All GitHub API requests are GET; no Actions run is started.',
    'Use GH_TOKEN or GITHUB_TOKEN with Actions: read for private repositories.',
    'This is NOT a GitHub billing or cost report.',
  ].join('\n');
}

async function main() {
  try {
    const options = parseComparisonArgs(process.argv.slice(2));
    if (options.help) return console.log(usage());
    const report = await compareRepositories({
      repositories: options.repositories,
      limit: options.limit,
      since: options.since,
      until: options.until,
      event: options.event,
      status: options.status,
      token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN,
    });
    if (options.json) return console.log(JSON.stringify(report, null, 2));
    if (options.markdown) return process.stdout.write(renderComparisonMarkdown(report));
    console.log('GitHub Actions comparison | up to ' + report.limit_per_repository +
      ' runs per repo' + (report.since ? ' | since ' + report.since : '') +
      (report.until ? ' | until ' + report.until : '') +
      (report.event ? ' | event ' + report.event : '') +
      (report.status ? ' | status ' + report.status : ''));
    console.log(report.comparison_note);
    for (const record of report.repositories) {
      console.log('- ' + record.repository + ': ' + record.inspected_runs + ' runs' +
        (record.total_matching_runs === undefined ? ' (total unknown)' : ' of ' + record.total_matching_runs + ' API matches') +
        '; ' + record.failed_runs + ' failures; ' + record.elapsed_job_minutes +
        ' elapsed job-minutes' + (record.sample_warning ? ' [sample limited]' : ''));
    }
  } catch (error) {
    console.error('Comparison failed: ' + error.message);
    console.error(usage());
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
