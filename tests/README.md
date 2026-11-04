# Testing Guide

**Snapshot:** 3 November 2026. Commands describe current repository scripts, not production service startup or production permission.

## Application test layers

From a clean repository checkout:

~~~bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
~~~

The root package.json test script uses Node's test runner with tsx. It covers document ranking, server-side authentication and boundaries, public GitHub Actions audits, reports and packaging, GitHub App authentication, signed webhook validation, synthetic queue transactions, replay, recovery, retention and offline migration risk analysis, as well as UX and evidence utilities.

**Revision-specific evidence:** [PR #107](https://github.com/senanurcetin/Ops-Copilot/pull/107) had **312/312** passing application tests. Test totals may change on future commits.

## Real localhost Firebase Auth and Firestore emulators

The [CI workflow](../.github/workflows/ci.yml) runs this separate stage with the **demo-nexus-ops-isolation** project and exact localhost emulator addresses. No production Firestore project is authorized.

~~~bash
npm run test:firestore:emulator
~~~

Running this command directly requires already running and correctly isolated demo emulators (the CI job uses Firebase emulators:exec). [PR #107](https://github.com/senanurcetin/Ops-Copilot/pull/107) reported **20/20** real emulator tests. These validate local Firestore transaction behavior, not live IAM, pricing or real retention.

## Browser end-to-end tests

~~~bash
npm run e2e
npm run e2e:headed
npm run e2e:debug
~~~

[Playwright workflow](../.github/workflows/e2e-tests.yml) currently runs via **manual workflow_dispatch** only. It is not an independently verified, mandatory authenticated-product release gate. Do not infer production readiness from successful unit tests.

## Other scoped checks

~~~bash
npm run test:github-actions-audit
npm run test:github-app
npm run auditor:pack:dry-run
~~~

The packaging dry run does not publish anything to npm. The GitHub REST auditor is read-only. Some webhook tools operate on explicitly provided local snapshots and do not make a live Firestore census.

## Release evidence requirements

For each candidate, record the exact commit SHA, GitHub Actions run and job IDs, CircleCI and deployment statuses, test counts and their data/environment boundaries, security limitations and the owner-approved release decision. A failed historical run must remain visible. Never include secrets, customer documents, plant data or production credentials in tests or artifacts.

See the [engineering readiness audit](../docs/ENGINEERING_READINESS_AUDIT_2026-11-03.md) for remaining release blockers.
