#!/usr/bin/env node
/** Assemble a dependency-free npm package from maintained GitHub API CLIs. */
import { copyFile, mkdir, readFile, rm, writeFile, chmod, lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const outputDirectory = join(root, 'dist', 'github-actions-auditor');

export async function buildPackage({ destination = outputDirectory, repositoryRoot = root } = {}) {
  const output = resolve(destination);
  const sourceRoot = resolve(repositoryRoot);
  // This function removes and recreates its output. Never let a custom
  // destination erase a source tree, a home directory or an arbitrary path.
  const managedOutput = join(sourceRoot, 'dist', 'github-actions-auditor');
  const temporaryRoot = resolve(tmpdir());
  const tempRelative = relative(temporaryRoot, output);
  const insideTempSubfolder = tempRelative !== '' && tempRelative !== '..' &&
    !tempRelative.startsWith('..' + sep) && !isAbsolute(tempRelative) &&
    tempRelative.split(sep).length >= 2;
  const managed = output === managedOutput;
  if (!managed && !insideTempSubfolder) {
    throw new Error('Refusing to overwrite repository sources or arbitrary output paths.');
  }
  if (managed) {
    await mkdir(dirname(output), { recursive: true });
    // Reject a symlinked dist folder: its real path must remain inside this
    // checkout. A build must never write outside the intended staging area.
    if (await realpath(dirname(output)) !== join(await realpath(sourceRoot), 'dist')) {
      throw new Error('Refusing to build into a symlinked dist directory.');
    }
    const current = await lstat(output).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (current?.isSymbolicLink()) throw new Error('Refusing to replace a symlinked package directory.');
    await rm(output, { recursive: true, force: true });
  } else {
    const current = await lstat(output).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (current) throw new Error('Custom package destination must not already exist.');
  }
  const manifestPath = join(sourceRoot, 'tools', 'github-actions-auditor', 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.private || Object.keys(manifest.dependencies || {}).length ||
      !manifest.bin?.['github-actions-audit'] || !manifest.bin?.['github-actions-compare']) {
    throw new Error('Expected a dependency-free package with two CLI entrypoints.');
  }
  await mkdir(join(output, 'bin'), { recursive: true });
  await Promise.all([
    copyFile(manifestPath, join(output, 'package.json')),
    copyFile(join(sourceRoot, 'tools', 'github-actions-auditor', 'README.md'), join(output, 'README.md')),
    copyFile(join(sourceRoot, 'LICENSE'), join(output, 'LICENSE')),
    copyFile(join(sourceRoot, 'tools', 'github-actions-auditor', 'CHANGELOG.md'), join(output, 'CHANGELOG.md')),
  ]);
  for (const command of ['github-actions-audit', 'github-actions-compare']) {
    const file = join(output, manifest.bin[command]);
    const source = join(sourceRoot, 'scripts', command + '.mjs');
    const code = await readFile(source, 'utf8');
    if (!code.startsWith('#!/usr/bin/env node')) {
      throw new Error('CLI must start with a Node.js shebang: ' + command);
    }
    await writeFile(file, code, { mode: 0o755 });
    await chmod(file, 0o755);
  }
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const destination = await buildPackage();
    console.log('Standalone package assembled: ' + destination);
    console.log('Inspect with npm pack --dry-run ' + destination);
    console.log('No package is published automatically.');
  } catch (error) {
    console.error('Package build failed: ' + error.message);
    process.exitCode = 1;
  }
}
