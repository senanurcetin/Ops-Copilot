# Synthetic webhook outage and release rollback runbook

**Status:** PROCEDURE DOCUMENTED — not a production rollback certification.
**Date:** 4 November 2026.
**Scope:** demo Auth/Firestore emulators, synthetic GUIDs and local Admin
SDK test clients in Ops-Copilot. No real factory data or live billing.

## 1. Safety invariants

- Only use Firebase demo project **demo-nexus-ops-isolation** with
  **127.0.0.1:8080** (Firestore) and **127.0.0.1:9099** (Auth).
- Do not use real service-account credentials, real GitHub webhook
  secrets or production environment variables in a test.
- Do not start a live webhook endpoint/worker, change Vercel domain
  protection or enable Firestore TTL or deletion.
- Never delete an existing production GUID to test replay. The current
  legacy writer may recreate the record even if a permanent anchor
  exists (see [Issue #95](https://github.com/senanurcetin/Ops-Copilot/issues/95)).
- Existing emulator test guards reject unexpected host/project IDs.
  Failing a guard means STOP, not bypass the guard.

## 2. Reproducible, already-defined CI exercise

The existing [CI workflow](../.github/workflows/ci.yml) runs Java 21,
Node 22 and the Firebase Auth and Firestore emulators. Its emulator
command is:

~~~bash
npx --yes firebase-tools@14 emulators:exec --only auth,firestore --project demo-nexus-ops-isolation "npm run test:firestore:emulator"
~~~

The CI job sets CI=1 and FIREBASE_PROJECT_ID=demo-nexus-ops-isolation.
Use that job's recorded GitHub Actions run/job and exact commit SHA
for the evidence record. **This document does not trigger a workflow.**

The suite contains
[Admin outage test](../tests/github-webhook-admin-outage.emulator.test.mjs)
with a localhost TCP proxy and isolated child process. Its synthetic
fault path:

1. Start a demo-only Admin client and queue a synthetic GUID work item.
2. Disconnect the proxy and intentionally block an attempted write.
3. Kill the synthetic child process; no uncertain write is falsely
   acknowledged as a success.
4. Restore only the local proxy connection, recreate an Admin client,
   replay the same GUID and verify deduplication.
5. Verify the original work identity and no second queue document.
6. Clean up synthetic emulator fixtures and close clients.

Other
[webhook emulator cases](../tests/github-webhook-outbox.emulator.test.mjs)
exercise concurrent delivery, transaction isolation, deadletter,
synthetic retention scenarios and case-variant GUID hazards. Those
tests are safety evidence, not a production migration or approval.

## 3. Recording observations

For any reviewed run, record:
- exact Git commit and run/job IDs and URLs;
- test names, totals, failures/skips and emulator project/host;
- initial, faulted and recovered states; whether write was
  acknowledged or uncertain, whether duplicate was suppressed;
- observed duration if actually measured (do not fabricate RTO/RPO);
- whether the test touches only synthetic fixtures;
- reviewer's interpretation and remaining failure scenarios.

**RTO/RPO:** no production recovery time or data-loss target has
been measured here. Outage test duration is not a service SLO.
Document estimates separately and label them as assumptions.

## 4. Deployment rollback decision tree — NOT EXECUTED

A rollback of a deployed hosted application is DIFFERENT from the
local emulator outage/recovery exercise above. Before any rollback:

1. The owner identifies an incident trigger: privilege leak, insecure
   authentication, unintended worker activation, duplicate processing,
   data integrity risk, abnormal billing or user-impacting outage.
2. Freeze further rollout, preserve evidence and incident timeline;
   do NOT automatically delete, compact, or rewrite production data.
3. Identify the exact last known-good commit/deployment, artifact
   checksum, environment and configuration/feature flags, and check
   backward compatibility against current persisted data.
4. Under separately approved operator access, evaluate a staging-only
   rollback, verify authentication and user isolation, and observe
   webhook delivery and storage invariants. The current repository
   does not provide an authorized production rollback automation.
5. If all evidence is acceptable, the owner may separately approve a
   host-specific production rollback procedure. This runbook provides
   no approval or credentials and performs no Vercel/Firebase action.
6. Confirm service health, monitor for regressions and preserve a
   blameless, reproducible incident record. Do not claim recovery
   until end-to-end verification supports it.

**Stop and escalate** when historical outbox writer inventory or
mixed-case GUID reconciliation is incomplete, rollback might change
database schemas, customer confidentiality is implicated, or the
vendor plan/billing risk is unknown.

## 5. Release gate

Use [release evidence template](RELEASE_EVIDENCE_TEMPLATE.md).
Successful unit tests and localhost emulators are necessary technical
evidence but do not replace production-level authorization, IAM review,
independent monitoring/cost verification, owner decision or a measured
staging rollback rehearsal. The default release status is **NO-GO**.
