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

test('dependency check runs from a digest-pinned image as a non-root user', () => {
  assert.match(content, /DC_IMAGE: owasp\/dependency-check@sha256:[0-9a-f]{64}\n/);
  assert.doesNotMatch(content, /:latest\b/);
  assert.doesNotMatch(content, /Dependency-Check_Action/);
  assert.match(content, /docker run --rm --user "\$\(id -u\):\$\(id -g\)"/);
  assert.match(content, /-v "\$GITHUB_WORKSPACE:\/src:ro"/);
});

test('dependency check refreshes NVD data with a key instead of trusting a stale image', () => {
  assert.match(content, /NVD_API_KEY: \$\{\{ secrets\.NVD_API_KEY \}\}/);
  assert.match(content, /name: Require the NVD API key/);
  assert.match(content, /uses: actions\/cache@v4/);
  assert.match(content, /\/usr\/share\/dependency-check\/data/);
  assert.doesNotMatch(content, /--noupdate|autoUpdate=false/i);
});

test('workflow preserves JSON scan artifact and cannot silently deploy', () => {
  assert.match(content, /name: Run OWASP Dependency-Check/);
  assert.match(content, /--format JSON --out \/report/);
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
