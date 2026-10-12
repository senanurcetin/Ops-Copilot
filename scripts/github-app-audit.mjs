#!/usr/bin/env node
/** Explicit local/private audit path using GitHub App installation permissions. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, renderMarkdownReport } from './github-actions-audit.mjs';
import { auditWithGitHubApp } from './github-app-auth.mjs';

const usage = [
  'Usage: node scripts/github-app-audit.mjs OWNER/REPO [--limit 10] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--event EVENT] [--status STATUS] [--json | --markdown]',
  'Requires GH_APP_ID, GH_APP_INSTALLATION_ID and GH_APP_PRIVATE_KEY_PATH environment variables.',
  'Never paste the private key or installation token into a command argument.',
].join('\n');

async function main() {
  try {
    if (process.argv.slice(2).includes('--help')) return console.log(usage);
    const args = parseArgs(process.argv.slice(2));
    const keyPath = process.env.GH_APP_PRIVATE_KEY_PATH;
    if (!keyPath || !process.env.GH_APP_ID || !process.env.GH_APP_INSTALLATION_ID) {
      throw new Error('Missing GitHub App configuration environment variables.');
    }
    const privateKey = await readFile(resolve(keyPath), 'utf8');
    const { json, markdown, ...filters } = args;
    const data = await auditWithGitHubApp({
      ...filters,
      appId: process.env.GH_APP_ID,
      installationId: process.env.GH_APP_INSTALLATION_ID,
      privateKey,
    });
    if (json) console.log(JSON.stringify(data, null, 2));
    else if (markdown) process.stdout.write(renderMarkdownReport(data));
    else {
      console.log('Repository: ' + data.repository);
      console.log('Runs: ' + data.inspected_runs);
      console.log('Elapsed job-minutes (not billable): ' + data.elapsed_job_minutes);
      if (data.sample_warning) console.log('Sampling limitation: ' + data.sample_warning);
    }
  } catch {
    // Never print raw errors: key material or token values must not be exposed.
    console.error('App audit failed. Check app registration, installation, permissions and local configuration.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
