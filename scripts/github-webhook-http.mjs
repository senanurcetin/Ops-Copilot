import { DEFAULT_WEBHOOK_MAX_BYTES } from './github-webhook-verify.mjs';
import { enqueueAuthorizedGitHubDelivery } from './github-webhook-gate.mjs';

class InvalidRequest extends Error {
  constructor(status) {
    super('Invalid webhook HTTP request.');
    this.status = status;
  }
}

/** Read HTTP request bytes without buffering past the configured limit. */
export async function readBoundedWebhookBody(req, maxBytes = DEFAULT_WEBHOOK_MAX_BYTES) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error('Invalid webhook request size configuration.');
  }
  const value = req?.headers?.['content-length'];
  if (value !== undefined) {
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
      throw new InvalidRequest(400);
    }
    // Use BigInt to avoid unsafe integer rounding on oversized Content-Length.
    if (BigInt(value) > BigInt(maxBytes)) throw new InvalidRequest(413);
  }
  if (!req || typeof req.on !== 'function') throw new InvalidRequest(400);

  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    let settled = false;
    function cleanup() {
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('aborted', onAborted);
      req.off('error', onError);
      req.off('close', onClose);
    }
    function finish(error) {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(Buffer.concat(chunks, total));
    }
    function onData(chunk) {
      if (!Buffer.isBuffer(chunk) && !(chunk instanceof Uint8Array)) {
        finish(new InvalidRequest(400));
        req.pause?.();
        return;
      }
      if (chunk.byteLength > maxBytes - total) {
        finish(new InvalidRequest(413));
        req.pause?.();
        return;
      }
      total += chunk.byteLength;
      chunks.push(chunk);
    }
    function onEnd() {
      if (value !== undefined && BigInt(value) !== BigInt(total)) {
        return finish(new InvalidRequest(400));
      }
      finish();
    }
    function onAborted() { finish(new InvalidRequest(400)); }
    function onError() { finish(new InvalidRequest(400)); }
    function onClose() { if (!req.readableEnded) finish(new InvalidRequest(400)); }
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('aborted', onAborted);
    req.on('error', onError);
    req.on('close', onClose);
  });
}

/**
 * Optional Node.js HTTP request handler for a trusted, private webhook route.
 * Importing this function never starts a listener or enables a deployment.
 * Responses never expose GitHub payloads, internal errors, credentials or IDs.
 */
export function createGitHubWebhookRequestHandler({
  secret, expectedInstallationId, expectedRepositoryId, expectedRepository,
  enqueueOnce, maxBytes = DEFAULT_WEBHOOK_MAX_BYTES,
  pathname = '/github/webhook',
}) {
  if (typeof secret !== 'string' || secret.length === 0 ||
      !Number.isSafeInteger(expectedInstallationId) || expectedInstallationId <= 0 ||
      !Number.isSafeInteger(expectedRepositoryId) || expectedRepositoryId <= 0 ||
      typeof expectedRepository !== 'string' ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(expectedRepository) ||
      typeof enqueueOnce !== 'function' ||
      !Number.isSafeInteger(maxBytes) || maxBytes < 1 ||
      pathname !== '/github/webhook') {
    throw new Error('Invalid GitHub webhook HTTP handler configuration.');
  }

  return async function handleGitHubWebhook(req, res) {
    const respond = (code, status, extraHeaders = {}) => {
      res.writeHead(code, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...extraHeaders,
      });
      res.end(JSON.stringify({status}));
    };

    try {
      // Restrict use to this exact endpoint with no query string or URL tricks.
      if (req.url !== pathname) return respond(404, 'not_found');
      if (req.method !== 'POST') return respond(405, 'method_not_allowed', {Allow: 'POST'});
      if (typeof req.headers?.['content-type'] !== 'string' ||
          !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'])) {
        return respond(415, 'unsupported_media_type');
      }

      const rawBody = await readBoundedWebhookBody(req, maxBytes);
      const result = await enqueueAuthorizedGitHubDelivery({
        rawBody, headers: req.headers, secret,
        expectedInstallationId, expectedRepositoryId, expectedRepository,
        enqueueOnce, maxBytes,
      });
      if (result.status === 'enqueued') return respond(202, 'accepted');
      return respond(200, result.status); // duplicate or ignored
    } catch (error) {
      if (error instanceof InvalidRequest) {
        return respond(error.status, error.status === 413 ? 'payload_too_large' : 'invalid_request',
          error.status === 413 ? {'Connection': 'close'} : {});
      }
      const message = error instanceof Error ? error.message : '';
      if (message.includes('signature validation')) return respond(401, 'unauthorized');
      if (message.includes('not authorized')) return respond(403, 'forbidden');
      if (message.includes('persistence')) return respond(503, 'temporarily_unavailable');
      if (message.includes('webhook JSON') || message.includes('event metadata') ||
          message.includes('workflow-run scope')) return respond(400, 'invalid_request');
      return respond(503, 'temporarily_unavailable');
    }
  };
}
