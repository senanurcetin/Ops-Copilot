#!/usr/bin/env node
/**
 * Explicit, offline-only local retention report.
 *
 * Reads a user-supplied JSON snapshot, never connects to Firebase or GitHub,
 * and prints only the aggregated result from the pure inventory analyzer.
 * Source records, file paths, delivery GUIDs and sensitive values are never
 * written to stdout/stderr, including in error conditions.
 */
import { lstat, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeWebhookRetentionSnapshot } from './github-webhook-retention-inventory.mjs';

const MAX_FILE_BYTES = 6 * 1024 * 1024;
const usage = [
  'Usage: node scripts/github-webhook-retention-report.mjs --file LOCAL_SNAPSHOT.json',
  '       [--daily NONNEGATIVE_INTEGER] [--review-bytes POSITIVE_INTEGER]',
  '       [--max-records INTEGER_1_TO_100000]',
  '       node scripts/github-webhook-retention-report.mjs --help',
  'Input must be an explicitly supplied local JSON array of outbox records.',
  'Output is aggregate JSON only. No network access, deletion, or TTL change.',
].join('\n');

function parseOptions(args) {
  if (args.length === 1 && args[0] === '--help') return { help: true };
  if (args.length < 2 || args.length % 2 !== 0) {
    throw new Error('Invalid local retention report arguments.');
  }
  const options = {};
  const flags = new Set(['--file', '--daily', '--review-bytes', '--max-records']);
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const raw = args[i + 1];
    if (!flags.has(flag) || Object.hasOwn(options, flag) ||
        typeof raw !== 'string' || raw.length === 0 ||
        raw.startsWith('--')) {
      throw new Error('Invalid local retention report arguments.');
    }
    options[flag] = raw;
  }
  if (!Object.hasOwn(options, '--file') ||
      options['--file'].includes('\0') ||
      /^[a-z]+:\/\//i.test(options['--file'])) {
    throw new Error('An explicit local JSON file is required.');
  }
  function integer(flag, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    if (!Object.hasOwn(options, flag)) return undefined;
    const raw = options[flag];
    if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
      throw new Error('Invalid numeric retention report argument.');
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      throw new Error('Invalid numeric retention report argument.');
    }
    return value;
  }
  return {
    path: options['--file'],
    expectedDailyDeliveries: integer('--daily', { max: 1000000 }),
    reviewBudgetJsonBytes: integer('--review-bytes', { min: 1 }),
    maxRecords: integer('--max-records', { min: 1, max: 100000 }),
  };
}

async function reportFromLocalFile({ path, ...options }) {
  // O_NOFOLLOW rejects symlink inputs on supported host systems. Require a
  // regular local file and bound its size both before and after reading.
  const absolutePath = resolve(path);
  const fileInfo = await lstat(absolutePath);
  if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) {
    throw new Error('Invalid local retention input type.');
  }
  const handle = await open(
    absolutePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  let content;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_FILE_BYTES) {
      throw new Error('Invalid local retention input size.');
    }
    content = await handle.readFile({ encoding: 'utf8' });
  } finally {
    await handle.close();
  }
  if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) {
    throw new Error('Invalid local retention input size.');
  }
  const records = JSON.parse(content);
  return analyzeWebhookRetentionSnapshot(records, {
    ...Object.fromEntries(
      Object.entries(options).filter(([, value]) => value !== undefined),
    ),
  });
}

async function main() {
  try {
    const parsed = parseOptions(process.argv.slice(2));
    if (parsed.help) {
      process.stdout.write(usage + '\n');
      return;
    }
    const result = await reportFromLocalFile(parsed);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch {
    // Raw parser, OS, and SDK errors may include local file paths or data.
    process.stderr.write(
      'Retention report failed. Check the local JSON file and arguments.\n',
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
