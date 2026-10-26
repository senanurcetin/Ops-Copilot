#!/usr/bin/env node
/**
 * A real, opt-in, read-only API consumer using the installed npm archive.
 *
 * Run in a SEPARATE Node.js project after installing the local tarball:
 *   node consumer.mjs senanurcetin/Ops-Copilot senanurcetin/senanurcetin
 *
 * No publishing, workflow dispatch, or GitHub write request is performed.
 * Public repositories need no token; private ones need only Actions: read.
 */
import { auditRepository } from '@senanurcetin/github-actions-auditor';
import { compareRepositories } from '@senanurcetin/github-actions-auditor/compare';

const repositories = process.argv.slice(2);
if (
  repositories.length !== 2 ||
  repositories.some(value => !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) ||
  repositories[0].toLowerCase() === repositories[1].toLowerCase()
) {
  console.error('Usage: node consumer.mjs owner/repo-a owner/repo-b');
  process.exitCode = 2;
} else {
  try {
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    const audit = await auditRepository({
      repository: repositories[0],
      limit: 2,
      token,
    });
    if (
      audit.repository !== repositories[0] ||
      !Number.isSafeInteger(audit.inspected_runs) ||
      audit.inspected_runs < 0 ||
      !Number.isSafeInteger(audit.completed_jobs) ||
      !Number.isFinite(audit.elapsed_job_minutes) ||
      !Array.isArray(audit.workflows)
    ) {
      throw new Error('The installed package returned an invalid audit report.');
    }

    const comparison = await compareRepositories({
      repositories,
      limit: 1,
      token,
    });
    if (
      comparison.repositories_inspected !== 2 ||
      !Array.isArray(comparison.repositories) ||
      comparison.repositories.length !== 2 ||
      !repositories.every(name => comparison.repositories.some(item => item.repository === name))
    ) {
      throw new Error('The installed package returned an invalid comparison report.');
    }

    console.log(JSON.stringify({
      installed_package: '@senanurcetin/github-actions-auditor',
      audit: {
        repository: audit.repository,
        sampled_runs: audit.inspected_runs,
        completed_jobs: audit.completed_jobs,
        elapsed_job_minutes: audit.elapsed_job_minutes,
      },
      comparison: comparison.repositories.map(item => ({
        repository: item.repository,
        sampled_runs: item.inspected_runs,
        completed_jobs: item.completed_jobs,
        elapsed_job_minutes: item.elapsed_job_minutes,
      })),
      limitation: 'Sampled elapsed job-minutes are not GitHub billable minutes or account costs.',
    }, null, 2));
  } catch (error) {
    console.error('Read-only consumer example failed: ' + error.message);
    process.exitCode = 1;
  }
}
