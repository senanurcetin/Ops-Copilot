import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPackage } from '../scripts/build-github-auditor-package.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

// On Windows, npm is normally a .cmd/.ps1 shim; execFileSync cannot spawn it
// without a shell. Run npm's JavaScript entrypoint through the active Node
// executable instead, avoiding shell quoting and arbitrary command execution.
function execNpm(args, options = {}) {
  const cliCandidates = [
    process.env.npm_execpath,
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(dirname(dirname(process.execPath)), 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  const cli = cliCandidates.find(candidate => candidate && existsSync(candidate));
  if (!cli && process.platform === 'win32') {
    throw new Error('npm CLI JavaScript entrypoint is required to run this test on Windows.');
  }
  return execFileSync(cli ? process.execPath : 'npm',
    cli ? [cli, ...args] : args,
    { encoding: 'utf8', timeout: 30000, ...options });
}

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
    const packed = JSON.parse(execNpm([
      'pack', '--dry-run', '--json', destination,
    ], { cwd: temporary }));
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


test('actual npm archive installs without a registry in an independent consumer', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'ops-auditor-consumer-'));
  const destination = join(temporary, 'package');
  const consumer = join(temporary, 'consumer');
  try {
    await buildPackage({ destination });
    const packed = JSON.parse(execNpm(
      ['pack', destination, '--json', '--ignore-scripts', '--pack-destination', temporary],
      { cwd: temporary },
    ));
    assert.equal(packed.length, 1);
    assert.equal(packed[0].filename, 'senanurcetin-github-actions-auditor-0.1.0.tgz');
    assert.deepEqual(packed[0].files.map(item => item.path).sort(), [
      'CHANGELOG.md', 'LICENSE', 'README.md',
      'bin/github-actions-audit.mjs', 'bin/github-actions-compare.mjs', 'package.json',
    ]);
    await mkdir(consumer);
    await writeFile(join(consumer, 'package.json'),
      JSON.stringify({ name: 'offline-consumer', version: '0.0.0', private: true }));
    // A tarball path + --offline + --ignore-scripts guarantees that this
    // consumer exercise does not publish or fetch registry dependencies.
    execNpm([
      'install', join(temporary, packed[0].filename),
      '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false',
    ], { cwd: consumer, timeout: 90000 });
    const installed = join(consumer, 'node_modules', '@senanurcetin', 'github-actions-auditor');
    const manifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
    assert.equal(manifest.name, '@senanurcetin/github-actions-auditor');
    assert.equal(manifest.version, '0.1.0');
    assert.equal(Object.keys(manifest.dependencies || {}).length, 0);
    for (const command of ['github-actions-audit', 'github-actions-compare']) {
      const help = execFileSync(process.execPath,
        [join(installed, 'bin', command + '.mjs'), '--help'],
        { encoding: 'utf8', timeout: 15000, cwd: consumer });
      assert.match(help, /Usage:/);
    }
    // Also verify the public ESM exports from an actually installed npm
    // archive, without any network call: invalid args short-circuit before
    // auditRepository or compareRepositories are called.
    const exampleSource = join(repositoryRoot, 'examples',
      'github-actions-auditor-consumer', 'consumer.mjs');
    const example = join(consumer, 'consumer.mjs');
    await writeFile(example, await readFile(exampleSource, 'utf8'));
    const duplicate = spawnSync(process.execPath, [
      example, 'senanurcetin/Ops-Copilot', 'senanurcetin/Ops-Copilot',
    ], { cwd: consumer, encoding: 'utf8', timeout: 15000 });
    assert.equal(duplicate.status, 2);
    assert.match(duplicate.stderr, /Usage: node consumer[.]mjs/);
    assert.equal(duplicate.stdout, '');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
