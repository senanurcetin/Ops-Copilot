import { createSign } from 'node:crypto';
import { validateRepository, auditRepository } from './github-actions-audit.mjs';

/**
 * Generate an RS256 JWT signed with a GitHub App private key.
 * The key must remain on a trusted server or local machine, never in the browser.
 */
export function signGitHubAppJWT({ appId, privateKey, nowSeconds = Math.floor(Date.now() / 1000) }) {
  if (!/^[1-9][0-9]*$/.test(String(appId ?? '')) ||
      !Number.isSafeInteger(Number(appId))) {
    throw new Error('A valid numeric GitHub App ID is required.');
  }
  if (typeof privateKey !== 'string' || !privateKey.includes('PRIVATE KEY')) {
    throw new Error('A GitHub App PEM private key is required.');
  }
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds <= 0) {
    throw new Error('Invalid current timestamp.');
  }
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iat: nowSeconds - 60,
    exp: nowSeconds + 540,
    iss: String(appId),
  })).toString('base64url');
  const message = header + '.' + payload;
  const signer = createSign('RSA-SHA256');
  signer.update(message);
  signer.end();
  return message + '.' + signer.sign(privateKey).toString('base64url');
}

/** Obtain a short-lived token restricted to a single installed repo. */
export async function requestInstallationToken({
  jwt, installationId, repository, fetchImpl = fetch,
}) {
  if (typeof jwt !== 'string' || jwt.split('.').length !== 3) {
    throw new Error('A signed GitHub App JWT is required.');
  }
  if (!/^[1-9][0-9]*$/.test(String(installationId ?? '')) ||
      !Number.isSafeInteger(Number(installationId))) {
    throw new Error('A valid GitHub App installation ID is required.');
  }
  const [, repoName] = validateRepository(repository);
  let response;
  try {
    response = await fetchImpl(
      'https://api.github.com/app/installations/' + installationId + '/access_tokens',
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer ' + jwt,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'ops-copilot-app-auditor',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ repositories: [repoName], permissions: { actions: 'read' } }),
        signal: AbortSignal.timeout(15000),
      },
    );
  } catch {
    throw new Error('GitHub App installation token request could not be completed.');
  }
  if (!response.ok) {
    // Never serialize the API response: it might contain sensitive authentication data.
    throw new Error('GitHub App installation token request failed (HTTP ' + response.status + ').');
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error('GitHub App returned an invalid token response.'); }
  if (typeof data?.token !== 'string' || data.token.length < 8) {
    throw new Error('GitHub App returned an invalid token response.');
  }
  return data.token;
}

/** An explicit opt-in path for private repository audits using app installation auth. */
export async function auditWithGitHubApp({
  repository, appId, installationId, privateKey,
  limit = 10, since, until, branch, event, status,
  fetchImpl = fetch, auditImpl = auditRepository,
}) {
  validateRepository(repository);
  const jwt = signGitHubAppJWT({ appId, privateKey });
  const token = await requestInstallationToken({
    jwt, installationId, repository, fetchImpl,
  });
  return auditImpl({
    repository, token, limit, since, until, branch, event, status, fetchImpl,
  });
}
