import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EVIDENCE_DIR = fileURLToPath(new URL('../dist/release-evidence/', import.meta.url));
const PACKAGE_FILE = new URL('../tools/github-actions-auditor/package.json', import.meta.url);
const MANIFEST = 'SHA256SUMS';
const MAX_ARCHIVE_BYTES = 12 * 1024 * 1024;
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z][0-9A-Za-z.-]{0,60})?$/;
const CHECKSUM_PATTERN = /^[a-f0-9]{64}$/;

function fail() {
  // Do not print filesystem paths, file contents, tokens or caller input.
  throw new Error('Candidate artifact integrity check failed.');
}

function packageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(PACKAGE_FILE, 'utf8'));
    if (pkg.name !== '@senanurcetin/github-actions-auditor' ||
        !VERSION_PATTERN.test(pkg.version)) fail();
    return pkg.version;
  } catch { fail(); }
}

function regularFileBytes(path, maxBytes) {
  let fd;
  try {
    const before = lstatSync(path);
    if (!before.isFile() || before.isSymbolicLink() ||
        before.size < 1 || before.size > maxBytes) fail();
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const after = fstatSync(fd);
    if (!after.isFile() || after.size !== before.size ||
        after.ino !== before.ino || after.dev !== before.dev) fail();
    return readFileSync(fd);
  } catch { fail(); }
  finally { if (fd !== undefined) closeSync(fd); }
}

function candidate({ directory = EVIDENCE_DIR, version = packageVersion() } = {}) {
  if (typeof directory !== 'string' || !VERSION_PATTERN.test(version)) fail();
  try {
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail();
  } catch { fail(); }
  const name = `senanurcetin-github-actions-auditor-${version}.tgz`;
  const bytes = regularFileBytes(join(directory, name), MAX_ARCHIVE_BYTES);
  return {
    directory, name, version, sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function evidence(result, checksumManifestVerified) {
  return Object.freeze({
    candidate: result.name,
    version: result.version,
    sizeBytes: result.sizeBytes,
    sha256: result.sha256,
    checksumManifestVerified,
    packageContentsIndependentlyReviewed: false,
    provenanceIndependentlyVerified: false,
    packagePublished: false,
    productionReleaseAuthorized: false,
  });
}

/** Create a checksum record without overwriting any previous release evidence. */
export function createCandidateChecksum(options = {}) {
  const found = candidate(options);
  const path = join(found.directory, MANIFEST);
  const line = `${found.sha256}  ${found.name}\n`;
  let fd;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL |
      (constants.O_NOFOLLOW || 0), 0o600);
    writeFileSync(fd, line, 'utf8');
  } catch { fail(); }
  finally { if (fd !== undefined) closeSync(fd); }
  return evidence(found, false);
}

/** Reject missing, altered, duplicated or unapproved artifact checksum entries. */
export function verifyCandidateChecksum(options = {}) {
  const found = candidate(options);
  const data = regularFileBytes(join(found.directory, MANIFEST), 512).toString('utf8');
  const expected = `${found.sha256}  ${found.name}\n`;
  if (!CHECKSUM_PATTERN.test(data.slice(0, 64)) || data !== expected) fail();
  return evidence(found, true);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const mode = process.argv[2];
    if (process.argv.length !== 3 || !['create', 'verify'].includes(mode)) fail();
    const result = mode === 'create' ? createCandidateChecksum() : verifyCandidateChecksum();
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch {
    process.stderr.write('Candidate artifact integrity check failed.\n');
    process.exitCode = 1;
  }
}
