# GitHub App webhook verification (offline building block)

The read-only GitHub Actions auditor authenticates to GitHub separately. This module adds **inbound** webhook signature validation; it does **not** expose an HTTP endpoint, install an App, execute a workflow, or make GitHub API calls.

`X-Hub-Signature-256` is the only accepted signature algorithm. Always pass the **original raw request bytes** as a `Buffer` or `Uint8Array`. Do not parse and re-serialize JSON before verification. The default maximum body size is 1 MiB; enforce a byte limit while receiving HTTP chunks as well, before buffering an entire request.

```js
import { parseVerifiedGitHubWebhook } from './scripts/github-webhook-verify.mjs';

// Example inside a trusted server-side handler after safely collecting raw bytes:
const { event, deliveryId, payload } = parseVerifiedGitHubWebhook({
  rawBody,                      // Uint8Array from HTTP request body
  headers: req.headers,         // IncomingHttpHeaders or WHATWG Headers
  secret: process.env.GITHUB_WEBHOOK_SECRET,
});
// Before processing: persist deliveryId in an atomic deduplication store.
// Then allow-list event + action and check installation/repository authorization.
```

This verification authenticates the HMAC but **does not prevent replay** of a valid request. A production receiver must (1) atomically deduplicate `X-GitHub-Delivery`, (2) authorize the installation and repository, (3) allow-list event/action combinations, (4) process asynchronously with bounded retries, and (5) avoid logging payloads, tokens, or secrets. Events can arrive out of order. Do not enable a webhook endpoint until these defenses and a full integration test are implemented. No new GitHub App permission is required for this offline verification layer.

Run offline tests without tokens, a GitHub App installation, network access or additional packages:

```bash
node --test tests/github-webhook-verify.test.mjs
```

References:
- https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
- https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app


## Signed workflow-event gate: authorization and deduplication

`enqueueAuthorizedGitHubDelivery` adds a **narrow, fail-closed acceptance gate** for a GitHub App's `workflow_run.completed` event. It verifies the HMAC first, compares immutable numeric installation and repository IDs with configured allowlisted values, checks the repository's `owner/name`, and validates the workflow-run ID. Every other event/action is ignored; authorization failures are rejected before any storage calls.

A caller must provide `enqueueOnce(work)` implemented by a durable transactional outbox store. It must return **true only when the delivery GUID and the queued work item are committed together**, false only for an existing GUID, and throw on failure or uncertain commits. A process-local Set, simple cache, or check-then-insert is insufficient for production replay protection. GitHub redeliveries reuse the original delivery GUID.

`enqueueAuthorizedGitHubDelivery` does not create an HTTP endpoint or operate a live database. A production receiver additionally needs strict incoming byte limits, delivery recovery, retries, and a worker with read-only GitHub API access. Do not enable a public endpoint until those are implemented and tested. Return HTTP 2XX only after successful durable enqueue or recognized duplicate, within GitHub's 10-second response window.

Offline regression command:

```bash
node --test tests/github-webhook-verify.test.mjs tests/github-webhook-gate.test.mjs
```

Additional reference: https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks


## Optional Firestore outbox adapter (not active by default)

The server-only `createFirestoreWebhookOutbox(adminFirestore)` factory in `scripts/github-webhook-firestore-outbox.mjs` creates an `enqueueOnce` callback for the signed delivery gate. It uses an atomic Firestore transaction: read the document at `githubWebhookOutbox/{deliveryId}`, then create one queued record if the GUID does not exist. A duplicate returns false. The same document is the **outbox work item**, so there is no separate non-atomic queue write. No Firebase SDK import, app initialization, network request, service startup or cloud resource is introduced by importing this module.

The caller must inject an already-authorized **Admin SDK** Firestore client, keep that client server-side, and implement a separate idempotent outbox worker. Test with the Firestore emulator before any live deployment. Offline fakes test the adapter contract but do not substitute for actual emulator/production concurrency tests. No webhook HTTP receiver, database connection, worker or production installation was activated.

```bash
node --test tests/github-webhook-firestore-outbox.test.mjs
```
