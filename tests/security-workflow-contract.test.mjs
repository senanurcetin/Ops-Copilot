import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const content = readFileSync(new URL('../.github/workflows/security-checks.yml', import.meta.url), 'utf8');

test('scheduled security workflow has read-only token and no persisted checkout credentials', () => {
  assert.match(content, /permissions:\s*\n\s*contents: read/);
  assert.equal((content.match(/persist-credentials:\s*false/g) || []).length, 2);
  assert.match(content, /workflow_dispatch:/);
  assert.match(content, /schedule:/);
  assert.doesNotMatch(content, /^(  )?(push|pull_request):/m);
});

test('dependency check scanner image is pinned by digest, non-root, and data-only image never runs', () => {
  assert.match(content, /DC_IMAGE: owasp\/dependency-check:[\w.]+@sha256:[0-9a-f]{64}/);
  assert.doesNotMatch(content, /Dependency-Check_Action@/);
  assert.doesNotMatch(content, /dependency-check[\w/-]*:latest/);
  // Only the pinned scanner image is executed.
  const runs = content.match(/docker run[\s\S]*?"\$\w+"/g) || [];
  assert.equal(runs.length, 1);
  assert.match(runs[0], /"\$DC_IMAGE"/);
  // The data image is only created to copy its data folder.
  assert.match(content, /docker create "\$DC_DATA_IMAGE"/);
  assert.match(content, /--noupdate/);
  // The image's default user is non-root; the job must not override it.
  assert.doesNotMatch(content, /--user\s+(root|0)/);
  // The scanned source is mounted read-only.
  assert.match(content, /:\/src:ro"/);
});

test('workflow preserves JSON scan artifact and cannot silently deploy', () => {
  assert.match(content, /name: Run OWASP Dependency-Check/);
  assert.match(content, /--format "JSON"/);
  assert.match(content, /name: dependency-check-report/);
  assert.match(content, /if:\s*always\(\)/);
  assert.doesNotMatch(content, /firebase deploy|vercel --prod|npm publish/i);
});


test('security scanner must fail closed when its JSON evidence is missing or stale', () => {
  assert.match(content, /name: Verify OWASP report integrity and declared NVD freshness/);
  assert.match(content, /run: node scripts\/verify-dependencycheck-report\.mjs/);
  const verify = content.indexOf('name: Verify OWASP report integrity');
  const upload = content.indexOf('name: Upload results');
  assert.ok(verify > 0 && upload > verify);
  assert.match(content.slice(verify,upload), /if: always\(\)/);
});
