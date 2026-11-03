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


## Optional HTTP receiver (disabled by default)

The Node.js `createGitHubWebhookRequestHandler(...)` factory in
`scripts/github-webhook-http.mjs` provides a **handler only**. It does not start
a listener, create a Next.js route, activate a GitHub App, deploy a worker, or
connect to Firebase. A trusted server can inject an authenticated Firestore
Admin client and the transactional outbox adapter separately.

The handler accepts only `POST /github/webhook` with JSON content type.
It bounds raw bytes while receiving the request (1 MiB default), verifies
the GitHub HMAC signature, installation and repository IDs, and allows only
`workflow_run.completed`. The handler replies with 202 **after** an outbox
write, 200 for duplicates/ignored actions, 401 for invalid signatures, 403
for unauthorized installation/repository, 400/413 for malformed or oversized
requests, and 503 when persistence fails. No sensitive payload or exception
is returned in the response.

**Production release gates:** use a TLS-terminating server with connection,
header and request-timeout limits; run behind authenticated GitHub App webhook
configuration; avoid proxies that rewrite signed bodies; verify the Admin SDK
Firestore transaction behavior with the emulator; implement a separately
authorized and idempotent read-only outbox worker; define queue retention,
dead-letter recovery, and observability without logging secrets. Do not
interpret successful offline tests as end-to-end production validation.

Offline focused verification:

```bash
node --test tests/github-webhook-http.test.mjs
```


## Firestore emulator acceptance testing (GitHub Developer Issue #95)

`npm run test:firestore:emulator` includes a real **Firebase Admin SDK**
webhook outbox transaction suite in addition to existing tenant isolation
checks. It refuses to run unless both emulator hosts are localhost
(`127.0.0.1:8080` and `127.0.0.1:9099`) and
`FIREBASE_PROJECT_ID=demo-nexus-ops-isolation`. The existing isolated
GitHub Actions `firestore-isolation` job runs this suite with
`firebase-tools@14 emulators:exec`; it never uses a production project.

It checks 24 simultaneous signed deliveries across two Admin Firestore
clients (one queued, all others duplicates), persistence observed from a
new client, fail-closed installation/repository and event filtering,
HTTP 503 after a deliberately rolled-back real emulator transaction (no HTTP 202 and no record), and Firestore rules
denying direct browser reads/writes of the admin-only outbox collection.

**Boundary:** emulator evidence is not live deployment approval. Worker
claim/lease state transitions, bounded retries, poison/dead-letter policy,
retention, production secret provisioning and end-to-end operations
remain separate gates. No service is started by importing these modules.


## Optional transactional outbox worker state machine

`createWebhookOutboxWorker(adminFirestore)` is a server-only library factory,
not a daemon. It makes no GitHub API request and never starts a worker. A caller
may explicitly `claim(deliveryId, workerId)`, then `complete` or `fail`
the returned lease, using Firestore transactions to resolve multiple worker
claims. Each claim has a fresh opaque token and a bounded lease; stale owners
cannot acknowledge newer claims.

Defaults: 60-second lease, maximum five attempts, exponential retry starting
at five seconds and capped at 15 minutes. Exhaustion moves the record to
`dead`; errors are stored as coarse codes, never exception texts, tokens or
webhook payloads. The queue document remains the replay-deduplication anchor
until a separately reviewed retention policy is implemented. Workers must use
read-only GitHub API permissions and an idempotent processor; a lease alone
cannot guarantee exactly-once external effects. Clock synchronization and
lease expiry during slow processing require release review.

Offline unit coverage is imported by `npm run test:github-app`. The existing
localhost emulator CI command additionally runs a two-client, 20-way claim
race and terminal completion test. Neither test launches a background worker.

```bash
node --test tests/github-webhook-outbox-worker.test.mjs
```


## Opt-in read-only GitHub API consumer

`scripts/github-webhook-readonly-consumer.mjs` provides an explicit,
one-delivery-at-a-time read-only processor; importing it **does not start a
daemon**, poll a queue, initialize Firebase or call GitHub. The caller injects
the existing Firestore-backed `claim/complete/fail` worker and a trusted
`getToken()` callback that supplies a short-lived, repository-scoped GitHub
App installation token with `Actions: read` permission.

The processor obtains a lease before requesting a token. It makes only
`GET https://api.github.com/repos/OWNER/REPO/actions/runs/RUN_ID` with a
hardcoded API host, disabled redirects, and a bounded timeout. Responses must
match the claimed numeric run ID, repository ID and exact `owner/name`, and
must be in a completed state. It returns only the run ID and conclusion; it
never persists the raw GitHub API payload, token, headers, or exceptions.

A successful read is marked complete only after the lease holder commits
`complete`. A failed fetch/token lookup schedules retry/dead-letter through
the existing worker; stale claims cannot be acknowledged. This is **not**
an always-running worker, a webhook endpoint, a production deployment or
exactly-once execution guarantee.

Offline tests run under `npm run test:github-app`. Production activation
still requires an external, separately authorized bounded dispatcher,
fresh App token provision, queue retention and dead-letter recovery, monitoring,
and a reviewed security release.


## Explicit owner-approved dead-letter recovery

`createWebhookDeadLetterRecovery(adminFirestore, { authorizeRecovery })`
provides a **manual-only** single-record recovery function. It has no
listener, scheduler, REST endpoint, token loader or automatic retry trigger.
The mandatory `authorizeRecovery({deliveryId,operatorId,expectedDeadAtMs})`
callback MUST verify an authenticated operator and explicit owner approval
in a separately reviewed server-side admin workflow. Its test fixture
returning `true` is **not** an implementation of production authorization.

The transaction requires the exact dead-letter event version
(`expectedDeadAtMs`), verifies the record has no active lease, and
atomically resets its attempt count to queued **once per delivery GUID**.
Subsequent or concurrent recovery requests are no-ops; a later exhausted
record cannot be repeatedly rescued without further reviewed work.
The same document and GUID remain in place as the replay-deduplication
anchor. No exception bodies, raw payloads, keys or access tokens are stored.

**Retention policy boundary:** do NOT configure automatic TTL deletion,
hard-delete, or cleanup of `githubWebhookOutbox/{deliveryId}` yet: deletion
would permit an old signed webhook redelivery to be treated as new. Before a
future retention change, review the provider's redelivery horizon, incident
audit horizon, storage limits, and an independent tombstone/deduplication
strategy. No retention policy or cloud configuration was activated here.

Offline recovery tests run via `npm run test:github-app`; the existing
localhost emulator CI job adds a 12-way, two-client recovery race.


## Retention without deleting replay protection

The optional server-only `createWebhookOutboxCompactor(adminFirestore,
{authorizeCompaction})` module allows an explicitly approved operator to
**compact only terminal, completed records** after at least seven days
(configurable no lower than one day). It atomically rewrites the **same**
`githubWebhookOutbox/{deliveryId}` document to a minimal completed record
retaining its delivery GUID, installation/repository/workflow identity,
attempt count, completion timestamp and compaction audit metadata.
Transient lease, retry and error fields are omitted. Dead-letter,
in-progress, missing, newly completed, stale-version and actively leased
records are never compacted. Concurrent requests can compact at most once.

Critically, this is an **in-place deduplication tombstone**, not a deletion:
the original Firestore document and GUID remain indefinitely. The existing
`enqueueOnce` adapter still returns `false` for a redelivered GUID;
workers will not claim completed tombstones. Neither automatic TTL nor
hard deletion is configured. Compaction must be initiated manually by a
trusted caller that authenticates the operator and verifies owner approval.
`authorizeCompaction: async () => true` in tests is **not** production
authorization.

The isolated emulator CI suite verifies 12 concurrent compactions across
two real Admin Firestore clients, redelivery deduplication after
compaction, and worker refusal to reclaim a completed tombstone.

## Transport-disconnection simulation boundary

The emulator CI suite also runs a controlled **localhost TCP proxy
disconnection** test. The proxy forwards an HTTP probe to the Firestore
emulator, is deliberately severed, and then reconnected. A deliberately
guarded persistence callback reports the transport loss to the existing
HTTP handler, which must return HTTP 503 without queuing, followed by 202
on recovery and 200 on replay.

**Evidence boundary:** this is a transport-level outage injection in the
emulator test; the Firestore Admin SDK client in the fixture continues to
use the normal 127.0.0.1:8080 endpoint. It does NOT demonstrate that the
Admin SDK itself terminates all in-flight operations or automatically
reconnects correctly after a real Firestore outage. The full end-to-end
Admin SDK disconnect/recovery and production release remain unapproved
and should be tested in a separate controlled environment. Firestore
emulators do not fully reproduce production transaction semantics.

No listener, background worker, cloud service, TTL policy or live
endpoint is activated by either library.


## Admin SDK transport cut + restart evidence

The extra localhost-only test
`tests/github-webhook-admin-outage.emulator.test.mjs` starts a **temporary,
isolated TCP proxy** on an ephemeral loopback port, pointing to the existing
Firestore emulator on 127.0.0.1:8080. It spawns a **separate Node process
running the real Firebase Admin SDK**, with that child process's
`FIRESTORE_EMULATOR_HOST` set to the proxy. This verifies that:

1. The real Admin client commits a synthetic outbox delivery through the proxy.
2. While the proxy is disconnected and its connections are destroyed, a new
   child using the Admin SDK receives no successful acknowledgment.
3. That isolated child is forcibly terminated to model process loss mid-flight.
4. After reconnecting the proxy, a fresh Admin SDK process can safely redeliver
   the same GUID and always observes the second redelivery as a duplicate.
   The emulator contains a single durable document at the original GUID.

The test refuses to run outside exact local demo emulator settings. It never
stops the shared emulator, changes production environment variables, uses a
real GitHub token, or enables a listener beyond the temporary test proxy.

**Interpretation:** a lost acknowledgment is not proof that Firestore did not
commit; it might have committed before the transport was cut. The correct
invariant is that reconnecting and redelivering cannot create a second
delivery document or duplicate queued work. This test exercises a real Admin
SDK client/transport/process restart but **not** in-process live-channel
reconnection or a real production Firestore outage. SDK/production behavior
must still be reviewed before activation. The previous guarded 503 test
continues to cover fail-closed HTTP behavior.


## Bounded read-only retention inventory (owner decision input)

`scripts/github-webhook-retention-inventory.mjs` exports the pure
`analyzeWebhookRetentionSnapshot(records, options)` function. It makes
**no Firestore read or write, API call, network request or service start**.
A caller with separate authorization may provide a size-bounded collection
of already-retrieved records. The function rejects duplicate delivery GUIDs,
unsupported states, corrupt terminal timestamps, unrecognized retention
classes, oversized input and invalid forecasting assumptions.

The result includes a state histogram (queued / processing / completed / dead),
compacted GUID-anchor count, completed records eligible for manual compaction,
a count of records containing recognized top-level sensitive field names,
sampled JSON UTF-8 byte totals and an optional **illustrative** 365-day growth
scenario when a compacted record sample and assumed daily delivery volume
are supplied. It never returns raw delivery IDs, tokens, payloads or
record contents. The age threshold defaults to seven days.

**Scope and cost caveats:** serialized JSON UTF-8 bytes are a measurement
of provided JSON snapshots only. They are **not** Firestore document storage
billed bytes, index size, document-name overhead, write/read operations,
monetary pricing or a guarantee that a partial sample represents the full
collection. The 365-day estimate assumes a constant daily event rate and
the same mean compacted-document size, and excludes old nonterminal records
and changes in Firestore overhead. No budget number or plan entitlement is
implied. `reviewBudgetJsonBytes` is an optional caller-defined
**review trigger**, never permission to delete or enable TTL.

The existing emulator CI suite tests the report against actual synthetic
documents read from the local demo Firestore emulator. Those emulator
documents are cleaned up after the test. This helper is not wired to a
production data source and does not perform data collection automatically.


## Explicit local retention report (no cloud connection)

The optional CLI `npm run report:github-webhook-retention -- --file
LOCAL_SNAPSHOT.json --daily 100 --review-bytes 1000000` reads only the
local JSON array explicitly supplied with `--file`. It does **not**
initialize Firebase, authenticate to GitHub, enumerate production records,
access billing APIs, start a service, or modify a document.

It delegates to the existing pure `analyzeWebhookRetentionSnapshot`
function, emits **aggregate JSON only**, and never displays the local file
path, delivery GUIDs or source payload values. Files are bounded to
6 MiB, optional sample record counts default to at most 10,000, and
symlink/nonregular inputs are rejected on supported platforms. Errors
are intentionally generic. A local input file may itself contain sensitive
material: restrict its file permissions and do not commit it to Git.

`--daily` is a user-supplied nonnegative integer assumption, **not**
an observed event rate. `--review-bytes` is a locally chosen aggregate
JSON-byte alert threshold, **not** a cloud spend cap or deletion order.
Outputs remain sample-only; no billed Firestore document/index sizes or
current prices are measured. A missing or malformed input fails closed.

### Firestore TTL billing and replay boundaries

The official [Firebase Firestore pricing documentation](https://firebase.google.com/docs/firestore/pricing)
states that **TTL deletions are not included in free usage and require
billing to be enabled**. Google Cloud's
[Firestore TTL documentation](https://docs.cloud.google.com/firestore/native/docs/ttl)
states that expired records are deleted asynchronously and that TTL
deletion is not transactional. Therefore enabling TTL on the GUID
collection would both violate the current no-paid-services boundary and
risk converting a valid redelivery into a new queued work item.

**Current safe default:** do not enable TTL, do not delete any known
delivery GUID and do not start a live listener or worker. Any change
requires separate owner authorization, production quota evidence and a
verified durable deduplication migration.
