import { createHmac, timingSafeEqual } from 'node:crypto';

export const DEFAULT_WEBHOOK_MAX_BYTES = 1024 * 1024;

/**
 * Verify the GitHub X-Hub-Signature-256 header against the original request
 * bytes. Never JSON.stringify a parsed body before calling this function.
 *
 * Invalid untrusted inputs fail closed (false); invalid server configuration
 * throws a generic error without exposing secrets.
 */
export function verifyGitHubWebhookSignature({
  rawBody, signature, secret, maxBytes = DEFAULT_WEBHOOK_MAX_BYTES,
}) {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('GitHub webhook secret is not configured.');
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error('Invalid webhook body size limit.');
  }
  if (!(rawBody instanceof Uint8Array) || rawBody.byteLength === 0 ||
      rawBody.byteLength > maxBytes) {
    return false;
  }
  if (typeof signature !== 'string' || !/^sha256=[0-9a-f]{64}$/.test(signature)) {
    return false;
  }

  const received = Buffer.from(signature.slice(7), 'hex');
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return timingSafeEqual(received, expected);
}

function headerValue(headers, name) {
  if (headers && typeof headers.get === 'function') return headers.get(name);
  if (!headers || typeof headers !== 'object') return undefined;
  // Node IncomingHttpHeaders normalizes keys to lower-case. Handle plain
  // object callers defensively without echoing any incoming header values.
  const matched = Object.keys(headers).find(key => key.toLowerCase() === name);
  return matched ? headers[matched] : undefined;
}

/**
 * Authenticate and parse a GitHub delivery. Does not enqueue, persist,
 * deduplicate, or execute anything; the caller owns delivery-id replay defense.
 */
export function parseVerifiedGitHubWebhook({
  rawBody, headers, secret, maxBytes = DEFAULT_WEBHOOK_MAX_BYTES,
}) {
  const valid = verifyGitHubWebhookSignature({
    rawBody,
    signature: headerValue(headers, 'x-hub-signature-256'),
    secret,
    maxBytes,
  });
  if (!valid) throw new Error('GitHub webhook signature validation failed.');

  const event = headerValue(headers, 'x-github-event');
  const deliveryId = headerValue(headers, 'x-github-delivery');
  if (typeof event !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(event) ||
      typeof deliveryId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deliveryId)) {
    throw new Error('Invalid GitHub webhook event metadata.');
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(rawBody).toString('utf8'));
  } catch {
    throw new Error('Invalid GitHub webhook JSON payload.');
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid GitHub webhook JSON payload.');
  }
  return { event, deliveryId, payload };
}
