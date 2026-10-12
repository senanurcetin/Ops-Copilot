import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { signGitHubAppJWT, requestInstallationToken, auditWithGitHubApp } from '../scripts/github-app-auth.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

test('RS256 GitHub App JWT has proper issuer and bounded UTC expiry', () => {
  const jwt = signGitHubAppJWT({ appId: 123, privateKey, nowSeconds: 1800000000 });
  const [header, payload, signature] = jwt.split('.');
  assert.equal(JSON.parse(Buffer.from(header, 'base64url')).alg, 'RS256');
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url')), {
    iat: 1799999940, exp: 1800000540, iss: '123',
  });
  const verifier = createVerify('RSA-SHA256');
  verifier.update(header + '.' + payload);
  verifier.end();
  assert.equal(verifier.verify(publicKey, Buffer.from(signature, 'base64url')), true);
});

test('JWT configuration fails without valid app ID, key and timestamp', () => {
  for (const appId of [0, 'not-an-app', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => signGitHubAppJWT({ appId, privateKey }));
  }
  assert.throws(() => signGitHubAppJWT({ appId: 123, privateKey: 'no-key' }));
  assert.throws(() => signGitHubAppJWT({ appId: 123, privateKey, nowSeconds: -1 }));
});

test('token exchange is restricted to a single repository and Actions read permission', async () => {
  const requests = [];
  const result = await requestInstallationToken({
    jwt: 'signed.header.signature',
    installationId: 456,
    repository: 'example/private-repo',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ token: 'installation-token-secret', expires_at: '2026-10-12T20:00:00Z' }) };
    },
  });
  assert.equal(result, 'installation-token-secret');
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /installations\/456\/access_tokens$/);
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer signed.header.signature');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    repositories: ['private-repo'], permissions: { actions: 'read' },
  });
});

test('authentication API errors are sanitized without exposing secrets', async () => {
  const secret = 'do-not-print-this-secret';
  await assert.rejects(requestInstallationToken({
    jwt: 'signed.header.signature',
    installationId: 456,
    repository: 'example/private-repo',
    fetchImpl: async () => ({
      ok: false, status: 403,
      json: async () => ({ token: secret, message: secret }),
    }),
  }), error => /HTTP 403/.test(error.message) && !error.message.includes(secret));
  await assert.rejects(requestInstallationToken({
    jwt: 'signed.header.signature',
    installationId: 456,
    repository: 'example/private-repo',
    fetchImpl: async () => { throw new Error(secret); },
  }), error => !error.message.includes(secret));
  await assert.rejects(requestInstallationToken({
    jwt: 'signed.header.signature', installationId: 456,
    repository: 'example/private-repo',
    fetchImpl: async () => ({ ok: true, json: async () => ({ token: 'short' }) }),
  }), /invalid token response/);
});

test('authenticated audit keeps ephemeral installation token only in memory', async () => {
  const auditCalls = [];
  const sample = { repository: 'org/private', inspected_runs: 1, elapsed_job_minutes: 3 };
  const response = await auditWithGitHubApp({
    repository: 'org/private', appId: 123, installationId: 456, privateKey,
    limit: 5, event: 'push',
    fetchImpl: async (url, options) => {
      assert.equal(options.method, 'POST');
      return { ok: true, json: async () => ({ token: 'opaque-installation-token' }) };
    },
    auditImpl: async options => {
      auditCalls.push(options);
      return sample;
    },
  });
  assert.equal(response, sample);
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].token, 'opaque-installation-token');
  assert.equal(auditCalls[0].event, 'push');
  assert.equal(auditCalls[0].limit, 5);
  assert.equal(Object.keys(response).includes('token'), false);
});
