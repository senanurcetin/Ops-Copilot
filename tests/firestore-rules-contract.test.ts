import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Firebase emulator configuration is local-only and uses committed rules', () => {
  const config = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));
  assert.equal(config.firestore.rules, 'firestore.rules');
  assert.equal(config.emulators.auth.host, '127.0.0.1');
  assert.equal(config.emulators.auth.port, 9099);
  assert.equal(config.emulators.firestore.host, '127.0.0.1');
  assert.equal(config.emulators.firestore.port, 8080);
  assert.equal(config.emulators.ui.enabled, false);
  assert.equal(config.hosting, undefined);
});

test('browser rules scope profiles and messages by authenticated UID and leave admin subcollections denied', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const exact = /request\.auth\s*!=\s*null\s*&&\s*request\.auth\.uid\s*==\s*userId/;
  assert.equal((rules.match(new RegExp(exact.source, 'g')) ?? []).length, 2);
  assert.match(rules, /match\s+\/users\/\{userId\}\s*\{/);
  assert.match(rules, /match\s+\/users\/\{userId\}\/messages\/\{messageId\}/);
  assert.doesNotMatch(rules, /match\s+\/users\/\{userId\}\/(?:knowledgeDocuments|checklistLogs)/);
  assert.doesNotMatch(rules, /allow\s+(?:read|write|create|update|delete)\s*:\s*if\s+true/);
});

test('live emulator integration remains explicitly opt-in; do not run in routine CI', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts['test:firestore:emulator'], /firestore-isolation\.emulator\.test\.ts/);
  assert.doesNotMatch(pkg.scripts['test:ci'], /firestore-isolation\.emulator\.test\.ts/);
});
