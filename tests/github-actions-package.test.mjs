import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, symlink, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPackage } from '../scripts/build-github-auditor-package.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('standalone package includes only two working CLI bins, documentation and license', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'ops-actions-package-'));
  const destination = join(temporary, 'cli');
  try {
    assert.equal(await buildPackage({ destination }), destination);
    const names = (await readdir(destination)).sort();
    assert.deepEqual(names, ['CHANGELOG.md', 'LICENSE', 'README.md', 'bin', 'package.json']);
    assert.deepEqual((await readdir(join(destination, 'bin'))).sort(), [
      'github-actions-audit.mjs', 'github-actions-compare.mjs',
    ]);
    const manifest = JSON.parse(await readFile(join(destination, 'package.json'), 'utf8'));
    assert.equal(manifest.name, '@senanurcetin/github-actions-auditor');
    assert.equal(manifest.version, '0.1.0');
    assert.match(await readFile(join(destination, 'CHANGELOG.md'), 'utf8'), /\[0\.1\.0\]/);
    assert.equal(manifest.license, 'MIT');
    assert.equal(Object.keys(manifest.dependencies || {}).length, 0);
    assert.equal(manifest.bin['github-actions-audit'], './bin/github-actions-audit.mjs');
    assert.equal(manifest.bin['github-actions-compare'], './bin/github-actions-compare.mjs');
    for (const command of ['github-actions-audit', 'github-actions-compare']) {
      const bundled = await readFile(join(destination, 'bin', command + '.mjs'), 'utf8');
      const original = await readFile(join(repositoryRoot, 'scripts', command + '.mjs'), 'utf8');
      assert.equal(bundled, original, 'Packaged source must exactly match maintained source');
      const usage = execFileSync(process.execPath, [
        join(destination, 'bin', command + '.mjs'), '--help',
      ], { encoding: 'utf8', timeout: 15000 });
      assert.match(usage, /Usage:/);
      assert.match(usage, /owner\/repo/i);
    }
    assert.match(await readFile(join(destination, 'LICENSE'), 'utf8'), /MIT License/);
    // npm's own packlist is more authoritative than checking staged files:
    // it must not include secrets, Next.js sources or hidden project files.
    const packed = JSON.parse(execFileSync('npm', [
      'pack', '--dry-run', '--json', destination,
    ], { encoding: 'utf8', timeout: 30000, cwd: temporary }));
    assert.equal(packed.length, 1);
    const actualFiles = packed[0].files.map(entry => entry.path).sort();
    assert.deepEqual(actualFiles, [
      'CHANGELOG.md', 'LICENSE', 'README.md',
      'bin/github-actions-audit.mjs', 'bin/github-actions-compare.mjs',
      'package.json',
    ]);
    assert.ok(packed[0].size > 0);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('package builder rejects overwriting checked-in source directories', async () => {
  await assert.rejects(buildPackage({ destination: repositoryRoot }), /Refusing to overwrite/);
  await assert.rejects(buildPackage({
    destination: join(repositoryRoot, 'scripts'),
  }), /Refusing to overwrite/);
  for (const destination of [
    join(repositoryRoot, 'src'),
    join(repositoryRoot, 'tools'),
    resolve(repositoryRoot, '..'),
    join(homedir(), 'Documents'),
    tmpdir(),
  ]) {
    await assert.rejects(buildPackage({ destination }), /Refusing to overwrite/);
  }
});

test('a custom temporary destination is never silently erased on a second build', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'ops-actions-package-'));
  const destination = join(temporary, 'cli');
  try {
    await buildPackage({ destination });
    await assert.rejects(buildPackage({ destination }), /must not already exist/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('custom staging rejects a symlinked temporary parent before creating files', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'ops-auditor-symlink-'));
  const outside = await mkdtemp(join(tmpdir(), 'ops-auditor-outside-'));
  const link = join(temporary, 'redirect');
  try {
    try {
      await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
        t.skip('Symlink creation is restricted by this runtime.');
        return;
      }
      throw error;
    }
    await assert.rejects(
      buildPackage({ destination: join(link, 'new-package') }),
      /symlinked custom package destination ancestor/,
    );
    await assert.rejects(
      stat(join(outside, 'new-package')),
      { code: 'ENOENT' },
      'A rejected staging destination must not write through the link.',
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('custom staging also rejects non-directory ancestors in temp', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'ops-auditor-invalid-parent-'));
  try {
    const file = join(temporary, 'not-a-directory');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, 'not a directory');
    await assert.rejects(
      buildPackage({ destination: join(file, 'new-package') }),
      /ancestor is not a directory/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
