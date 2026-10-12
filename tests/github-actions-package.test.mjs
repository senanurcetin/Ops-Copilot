import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
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
    assert.deepEqual(names, ['LICENSE', 'README.md', 'bin', 'package.json']);
    assert.deepEqual((await readdir(join(destination, 'bin'))).sort(), [
      'github-actions-audit.mjs', 'github-actions-compare.mjs',
    ]);
    const manifest = JSON.parse(await readFile(join(destination, 'package.json'), 'utf8'));
    assert.equal(manifest.name, '@senanurcetin/github-actions-auditor');
    assert.equal(manifest.version, '0.1.0');
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
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('package builder rejects overwriting checked-in source directories', async () => {
  await assert.rejects(buildPackage({ destination: repositoryRoot }), /Refusing to overwrite/);
  await assert.rejects(buildPackage({
    destination: join(repositoryRoot, 'scripts'),
  }), /Refusing to overwrite/);
});
