import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  DEFAULT_WEBHOOK_MAX_BYTES,
  verifyGitHubWebhookSignature,
  parseVerifiedGitHubWebhook,
} from '../scripts/github-webhook-verify.mjs';

const secret = "It's a Secret to Everybody";
const officialPayload = Buffer.from('Hello, World!', 'utf8');
const officialSignature = 'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17';
const deliveryId = '711c17df-3579-4c49-a3f1-4becc101abcd';
const signatureFor = body => 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
const headersFor = (body, overrides = {}) => ({
  'X-Hub-Signature-256': signatureFor(body),
  'X-GitHub-Event': 'workflow_run',
  'X-GitHub-Delivery': deliveryId,
  ...overrides,
});

test('matches GitHub official HMAC-SHA256 validation fixture', () => {
  assert.equal(verifyGitHubWebhookSignature({rawBody: officialPayload, signature: officialSignature, secret}), true);
});

test('rejects modified bytes and a different secret', () => {
  assert.equal(verifyGitHubWebhookSignature({rawBody: Buffer.from('Hello, world!'), signature: officialSignature, secret}), false);
  assert.equal(verifyGitHubWebhookSignature({rawBody: officialPayload, signature: officialSignature, secret: 'wrong-secret'}), false);
});

test('rejects absent, truncated, malformed, legacy SHA-1 and uppercase signatures', () => {
  for (const signature of [undefined, '', 'sha1=' + 'a'.repeat(40), 'sha256=ab',
    officialSignature.toUpperCase(), officialSignature + 'suffix', ['sha256=abc']]) {
    assert.equal(verifyGitHubWebhookSignature({rawBody: officialPayload, signature, secret}), false);
  }
});

test('requires exact raw byte array and enforces a configurable size cap', () => {
  for (const rawBody of [undefined, 'Hello, World!', {}, Buffer.alloc(0), Buffer.alloc(3)]) {
    assert.equal(verifyGitHubWebhookSignature({rawBody, signature: officialSignature, secret}), false);
  }
  assert.equal(verifyGitHubWebhookSignature({rawBody: officialPayload, signature: officialSignature, secret, maxBytes: 12}), false);
  assert.equal(verifyGitHubWebhookSignature({rawBody: officialPayload, signature: officialSignature, secret, maxBytes: 13}), true);
  assert.equal(DEFAULT_WEBHOOK_MAX_BYTES, 1048576);
});

test('rejects missing configuration without exposing secret values', () => {
  assert.throws(() => verifyGitHubWebhookSignature({rawBody: officialPayload, signature: officialSignature, secret: ''}), /not configured/);
  assert.throws(() => verifyGitHubWebhookSignature({rawBody: officialPayload, signature: officialSignature, secret, maxBytes: 0}), /size limit/);
});

test('verifies UTF-8 bytes without serializing or normalizing Unicode', () => {
  const rawBody = Buffer.from('{"message":"Türkçe öİğ 🎯"}', 'utf8');
  const signature = signatureFor(rawBody);
  assert.equal(verifyGitHubWebhookSignature({rawBody, signature, secret}), true);
  assert.equal(verifyGitHubWebhookSignature({rawBody: Buffer.from('{"message":"Turkce"}'), signature, secret}), false);
});

test('parses only authenticated GitHub delivery and keeps caller metadata', () => {
  const rawBody = Buffer.from('{"action":"completed","workflow_run":{"id":123}}');
  const result = parseVerifiedGitHubWebhook({rawBody, headers: headersFor(rawBody), secret});
  assert.deepEqual(result, {event: 'workflow_run', deliveryId, payload: {action: 'completed', workflow_run: {id: 123}}});
  // WHATWG Headers supported as well as plain IncomingHttpHeaders.
  assert.deepEqual(parseVerifiedGitHubWebhook({rawBody, headers: new Headers(headersFor(rawBody)), secret}), result);
});

test('rejects invalid event names and delivery identifiers', () => {
  const rawBody = Buffer.from('{"action":"completed"}');
  for (const overrides of [
    {'X-GitHub-Event': 'workflow_run; delete'},
    {'X-GitHub-Event': ''},
    {'X-GitHub-Delivery': 'not-a-uuid'},
    {'X-GitHub-Delivery': undefined},
  ]) {
    assert.throws(() => parseVerifiedGitHubWebhook({rawBody, headers: headersFor(rawBody, overrides), secret}), /metadata/);
  }
});

test('rejects invalid JSON even when signature is correct', () => {
  for (const rawBody of [Buffer.from('{oops'), Buffer.from('[]'), Buffer.from('null')]) {
    assert.throws(() => parseVerifiedGitHubWebhook({rawBody, headers: headersFor(rawBody), secret}), /JSON payload/);
  }
});

test('rejects tampered JSON before attempting to parse it', () => {
  const rawBody = Buffer.from('{bad json');
  const headers = headersFor(Buffer.from('{}'));
  assert.throws(() => parseVerifiedGitHubWebhook({rawBody, headers, secret}), /signature validation/);
});
