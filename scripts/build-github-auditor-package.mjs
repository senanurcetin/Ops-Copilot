#!/usr/bin/env node
/** Assemble a dependency-free npm package from maintained GitHub API CLIs. */
import { copyFile, mkdir, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const outputDirectory = join(root, 'dist', 'github-actions-auditor');

export async function buildPackage({ destination = outputDirectory, repositoryRoot = root } = {}) {
  const output = resolve(destination);
  const sourceRoot = resolve(repositoryRoot);
  if (output === sourceRoot || output === resolve(sourceRoot, 'scripts') ||
      output === resolve(sourceRoot, 'tools', 'github-actions-auditor')) {
    throw new Error('Refusing to overwrite repository sources.');
  }
  const manifestPath = join(sourceRoot, 'tools', 'github-actions-auditor', 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.private || Object.keys(manifest.dependencies || {}).length ||
      !manifest.bin?.['github-actions-audit'] || !manifest.bin?.['github-actions-compare']) {
    throw new Error('Expected a dependency-free package with two CLI entrypoints.');
  }
  await rm(output, { recursive: true, force: true });
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
