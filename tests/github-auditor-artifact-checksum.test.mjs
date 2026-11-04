import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createCandidateChecksum, verifyCandidateChecksum } from '../scripts/github-auditor-artifact-checksum.mjs';

const name = 'senanurcetin-github-actions-auditor-0.1.0.tgz';
const version = '0.1.0';
function sandbox(fn) {
  const directory = mkdtempSync(join(tmpdir(), 'ops-release-proof-'));
  try { return fn(directory); }
  finally { rmSync(directory, {recursive: true, force: true}); }
}
function fixture(directory) {
  writeFileSync(join(directory, name), Buffer.from('fake offline archive for checksum-only contract'));
  return {root: directory, directory, version};
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('new checksum records an actual archive digest, without release approval', () => sandbox(directory => {
  const opts = fixture(directory);
  const created = createCandidateChecksum(opts);
  assert.equal(created.sha256, sha(readFileSync(join(directory, name))));
  assert.equal(created.checksumManifestVerified, false);
  assert.equal(created.productionReleaseAuthorized, false);
  assert.equal(created.packagePublished, false);
  assert.equal(created.packageContentsIndependentlyReviewed, false);
  const verified = verifyCandidateChecksum(opts);
  assert.equal(verified.checksumManifestVerified, true);
  assert.equal(Object.isFrozen(verified), true);
  assert.equal(readFileSync(join(directory, 'SHA256SUMS'), 'utf8'), `${created.sha256}  ${name}\n`);
}));

test('altering artifact bytes fails a previously created checksum', () => sandbox(directory => {
  const opts = fixture(directory);
  createCandidateChecksum(opts);
  writeFileSync(join(directory, name), 'tampered archive');
  assert.throws(() => verifyCandidateChecksum(opts), /integrity check failed/);
}));

test('an existing checksum record cannot be silently replaced', () => sandbox(directory => {
  const opts = fixture(directory);
  createCandidateChecksum(opts);
  assert.throws(() => createCandidateChecksum(opts), /integrity check failed/);
  assert.equal(verifyCandidateChecksum(opts).checksumManifestVerified, true);
}));

test('missing or empty artifact and manifest fail closed', () => sandbox(directory => {
  const opts = {root: directory, directory, version};
  assert.throws(() => createCandidateChecksum(opts));
  writeFileSync(join(directory, name), '');
  assert.throws(() => createCandidateChecksum(opts));
  fixture(directory);
  assert.throws(() => verifyCandidateChecksum(opts));
}));

test('untrusted version and mismatched archive filename fail closed', () => sandbox(directory => {
  fixture(directory);
  for (const bad of ['../x', '1.0', 'v1.0.0', '1.0.0/secret', '1.0.0+build']) {
    assert.throws(() => createCandidateChecksum({root: directory, directory, version: bad}));
  }
  assert.throws(() => createCandidateChecksum({root: directory, directory, version: '0.1.1'}));
}));

test('duplicate, malformed or unrelated lines in checksum manifest are rejected', () => sandbox(directory => {
  const opts = fixture(directory);
  const result = createCandidateChecksum(opts);
  const line = `${result.sha256}  ${name}\n`;
  for (const entry of [line + line, line.trim(), line.replace('  ', ' '),
    line.replace(name, 'other.tgz'), `${'0'.repeat(64)}  ${name}\n`]) {
    writeFileSync(join(directory, 'SHA256SUMS'), entry);
    assert.throws(() => verifyCandidateChecksum(opts));
  }
}));

test('symbolic-link artifact and checksum record are refused', t => sandbox(directory => {
  const opts = fixture(directory);
  createCandidateChecksum(opts);
  const second = join(directory, 'second');
  writeFileSync(second, 'data');
  rmSync(join(directory, name));
  try { symlinkSync(second, join(directory, name)); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {t.skip();return;} throw error; }
  assert.throws(() => verifyCandidateChecksum(opts));
  rmSync(join(directory, name));
  fixture(directory);
  rmSync(join(directory, 'SHA256SUMS'));
  symlinkSync(second, join(directory, 'SHA256SUMS'));
  assert.throws(() => verifyCandidateChecksum(opts));
}));

test('a symlinked or junctioned dist parent cannot redirect SHA256SUMS outside the root', t => sandbox(base => {
  const root = join(base, 'repo');
  const outside = join(base, 'outside');
  mkdirSync(root);
  mkdirSync(join(outside, 'release-evidence'), {recursive: true});
  fixture(join(outside, 'release-evidence'));
  // Junctions need no elevated privilege on Windows; other platforms use a directory symlink.
  try { symlinkSync(outside, join(root, 'dist'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.skip(`cannot create directory link in this environment (${error.code})`);
      return;
    }
    throw error;
  }
  const opts = {root, directory: join(root, 'dist', 'release-evidence'), version};
  assert.throws(() => createCandidateChecksum(opts), /integrity check failed/);
  assert.throws(() => verifyCandidateChecksum(opts), /integrity check failed/);
  assert.equal(existsSync(join(outside, 'release-evidence', 'SHA256SUMS')), false);
}));

test('an evidence directory outside the root is refused', () => sandbox(base => {
  const root = join(base, 'repo');
  const elsewhere = join(base, 'elsewhere');
  mkdirSync(root);
  mkdirSync(elsewhere);
  fixture(elsewhere);
  for (const directory of [elsewhere, join(root, '..', 'elsewhere')]) {
    assert.throws(() => createCandidateChecksum({root, directory, version}), /integrity check failed/);
  }
  assert.equal(existsSync(join(elsewhere, 'SHA256SUMS')), false);
}));

test('a regular nested dist/release-evidence directory inside the root is accepted', () => sandbox(root => {
  const directory = join(root, 'dist', 'release-evidence');
  mkdirSync(directory, {recursive: true});
  fixture(directory);
  const opts = {root, directory, version};
  createCandidateChecksum(opts);
  assert.equal(verifyCandidateChecksum(opts).checksumManifestVerified, true);
}));

test('oversized archives are rejected before reading contents', () => sandbox(directory => {
  const opts = fixture(directory);
  writeFileSync(join(directory, name), Buffer.alloc(12 * 1024 * 1024 + 1));
  assert.throws(() => createCandidateChecksum(opts));
}));

test('command line arguments fail closed without printing attacker input', () => {
  const script = fileURLToPath(new URL('../scripts/github-auditor-artifact-checksum.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, 'verify', 'SECRET-ARG'], {encoding:'utf8'});
  assert.equal(result.status, 1);
  assert.equal(result.stderr.trim(), 'Candidate artifact integrity check failed.');
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.includes('SECRET-ARG'), false);
});
