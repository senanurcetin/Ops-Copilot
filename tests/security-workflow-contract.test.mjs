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

test('dependency check action reference is pinned to reviewed immutable Git SHA', () => {
  assert.match(content, /uses: dependency-check\/Dependency-Check_Action@1e54355a8b4c8abaa8cc7d0b70aa655a3bb15a6c/);
  assert.doesNotMatch(content, /dependency-check\/Dependency-Check_Action@(main|master|v\d+)/);
});

test('workflow preserves JSON scan artifact and cannot silently deploy', () => {
  assert.match(content, /name: Run OWASP Dependency-Check/);
  assert.match(content, /format:\s*"JSON"/);
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
