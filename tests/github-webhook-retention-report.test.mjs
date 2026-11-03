import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

const program = fileURLToPath(
  new URL('../scripts/github-webhook-retention-report.mjs', import.meta.url),
);
function run(args) {
  return spawnSync(process.execPath, [program, ...args], {
    encoding: 'utf8', timeout: 12000, maxBuffer: 128 * 1024,
    env: {...process.env, FIRESTORE_EMULATOR_HOST: ''},
  });
}
function fixture() {
  const guid = randomUUID();
  return {
    guid,
    record: {
      deliveryId: guid, state: 'completed', event: 'workflow_run',
      action: 'completed', installationId: 11, repositoryId: 42,
      repository: 'example/private-repo', workflowRunId: 765,
      enqueuedAtMs: 1000, completedAtMs: 2000, attempts: 1,
      retentionClass: 'dedup_anchor_v1', token: 'private-test-token-value',
    },
  };
}
function withTemporaryFile(callback) {
  const dir = mkdtempSync(join(tmpdir(), 'webhook-retention-'));
  try { return callback(dir); }
  finally { rmSync(dir, {recursive: true, force: true}); }
}

test('CLI reads only explicit local JSON and emits redacted aggregate report', () => {
  withTemporaryFile(dir => {
    const {guid, record} = fixture();
    const filename = join(dir, 'authorized-snapshot.json');
    writeFileSync(filename, JSON.stringify([record]));
    const result = run([
      '--file', filename, '--daily', '25', '--review-bytes', '1',
      '--max-records', '2',
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    const report = JSON.parse(result.stdout);
    assert.equal(report.recordCount, 1);
    assert.equal(report.compactedCount, 1);
    assert.equal(report.thresholdExceeded, true);
    assert.equal(report.expectedDailyDeliveries, 25);
    assert.equal(report.safePolicy.enableFirestoreTtl, false);
    assert.equal(report.safePolicy.deleteDocuments, false);
    assert.equal(report.predictedNewJsonBytesPerDay,
      25 * report.averageAnchorJsonBytes);
    assert.equal(result.stdout.includes(guid), false);
    assert.equal(result.stdout.includes('private-test-token-value'), false);
    assert.equal(result.stdout.includes(filename), false);
  });
});

test('CLI requires explicit file and rejects unknown, duplicate and invalid options', () => {
  for (const args of [
    [], ['--daily', '1'], ['--file'], ['--file', 'x', '--unknown', '1'],
    ['--file', 'x', '--file', 'y'], ['--file', 'x', '--daily', '-1'],
    ['--file', 'x', '--daily', '1.5'], ['--file', 'x', '--daily', '1000001'],
    ['--file', 'x', '--review-bytes', '0'],
    ['--file', 'x', '--max-records', '100001'],
    ['--file', 'https://example.com/snapshot.json'],
  ]) {
    const result = run(args);
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.includes('Retention report failed.'), true);
    assert.equal(result.stderr.includes('https://example.com'), false);
  }
});

test('CLI errors never echo malformed JSON, local file paths or sensitive content', () => {
  withTemporaryFile(dir => {
    const filename = join(dir, 'secret-material.json');
    const privateValue = 'sensitive-payload-should-not-be-printed';
    writeFileSync(filename, '{"privateKey":"' + privateValue + '",');
    const result = run(['--file', filename]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.includes(privateValue), false);
    assert.equal(result.stderr.includes(filename), false);
    assert.equal(result.stderr.includes('secret-material'), false);
  });
});

test('CLI bounds local file size, refuses non-regular or symlink files', () => {
  withTemporaryFile(dir => {
    const filename = join(dir, 'large.json');
    writeFileSync(filename, 'A'.repeat(6 * 1024 * 1024 + 1));
    const tooLarge = run(['--file', filename]);
    assert.equal(tooLarge.status, 1);
    assert.equal(tooLarge.stdout, '');
    const symlink = join(dir, 'shortcut.json');
    symlinkSync(filename, symlink);
    const linked = run(['--file', symlink]);
    assert.equal(linked.status, 1);
    assert.equal(linked.stdout, '');
    const folder = run(['--file', dir]);
    assert.equal(folder.status, 1);
    assert.equal(folder.stdout, '');
  });
});

test('CLI rejects duplicate delivery GUIDs without showing them', () => {
  withTemporaryFile(dir => {
    const {guid, record} = fixture();
    const filename = join(dir, 'duplicates.json');
    writeFileSync(filename, JSON.stringify([record, {...record}]));
    const result = run(['--file', filename]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.includes(guid), false);
  });
});

test('CLI help documents the no-network, no-deletion boundary', () => {
  const result = run(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--file LOCAL_SNAPSHOT/);
  assert.match(result.stdout, /No network access, deletion, or TTL change/);
  assert.equal(result.stderr, '');
});
