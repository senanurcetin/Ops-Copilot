# Ops-Copilot release evidence record — TEMPLATE

**Status: NO-GO / NOT APPROVED until independently reviewed.**
Copy this template into a separately reviewed release-specific record.
Filling boxes is NOT authorization to deploy, publish or enable billing.
Do not commit customer data, secrets, private URLs or access tokens.

## A. Candidate identity

| Field | Required evidence |
| --- | --- |
| Release scope | UNVERIFIED — explicitly name web app, GitHub REST auditor, or offline webhook module |
| Proposed version and changelog | UNVERIFIED — link to proposed diff and compatibility notes |
| Source repository and exact 40-char commit SHA | UNVERIFIED |
| Candidate artifact checksum, builder and artifact origin | UNVERIFIED |
| Author, independent reviewer and risk owner | UNVERIFIED |
| Candidate environment (demo, staging, production) | UNVERIFIED |
| Prior known-good revision / recovery artifact | UNVERIFIED |

**Separation:** a Vercel preview build or successful GitHub Actions job
does not mean a customer production deployment was approved or rolled back.

## B. Exact-commit test and security evidence

For EVERY check, record commit SHA, run/job ID, UTC timestamp, result,
tested scope and public-safe evidence URL. Do not reuse stale results.

| Gate | Head SHA + run/job + result | Limitations |
| --- | --- | --- |
| GitHub Actions lint, typecheck, tests, build | UNVERIFIED | CI uses placeholder Firebase/Gemini values; not real customer traffic |
| GitHub Actions localhost Auth/Firestore emulator | UNVERIFIED | Must be demo-nexus-ops-isolation; not proof of live IAM or billing |
| CircleCI node-quality | UNVERIFIED | Independent CI; exact SHA needed |
| Vercel deployment status | UNVERIFIED | Distinguish preview, production and domain access controls |
| Browser E2E including auth/user boundaries | UNVERIFIED | Manual workflow today; not yet a mandatory release gate |
| Scheduled/manual security vulnerability scan | UNVERIFIED | PR build does not execute security-checks.yml; Docker runtime image is not digest pinned |
| Dependency and software-license review | UNVERIFIED | Include commercial redistribution requirements |
| Secret scanning, credentials and access review | UNVERIFIED | Never paste secrets |
| Independent technical review | UNVERIFIED | Name reviewer and unresolved comments |

**Any failed or unverified mandatory gate remains a blocker**; do not
substitute a historical successful run or lower a threshold to pass.

## C. Webhook and data-specific risks

- [ ] Owner has separately reviewed Issue #95 historical GUID coverage,
  case-variant collisions, race-free retirement of legacy writers and
  owner-approved retention decisions.
- [ ] No paid Firestore TTL/deletion or production outbox migration is
  assumed from offline test results.
- [ ] Authenticated operator authorization, Firebase IAM, data isolation,
  data minimization and leak-prevention claims are confirmed against
  the actual intended environment, not just CI.
- [ ] Production/custom-domain access protection is independently tested;
  Vercel project SSO protection currently excludes custom domains.
- [ ] No factory safety-control or compliance guarantee is inferred
  from retrieval or manufacturing-model test results.

## D. Operations and recovery

| Required item | Evidence or status |
| --- | --- |
| Synthetic outage/reconnect drill | UNVERIFIED — see local recovery runbook |
| Recorded initial and recovered state | UNVERIFIED |
| Actual RTO and RPO measurements / applicable uncertainty | UNVERIFIED |
| Monitoring and on-call/response owner | UNVERIFIED |
| Rollback trigger, action owner and prior working artifact | UNVERIFIED |
| Cost/quotas and alert thresholds from authoritative provider | UNVERIFIED |
| Staging promotion and production approval boundary | UNVERIFIED |

A local emulator replay test may support **code-level resilience** but
is not measured production RTO/RPO or proof that a Vercel deployment
rollback has been exercised.

## E. Public core and commercialization boundary

- [ ] Public MIT source and proprietary/customer-specific boundaries
  reviewed under [ADR-0001](adr/0001-open-core-commercial-boundary.md).
- [ ] No customer confidential data, factory secrets or credentials
  are included in repository, examples or logs.
- [ ] If a customer pays or commercial usage is intended, the actual
  hosting plan permits commerce (Vercel Hobby does not). Obtain owner
  approval before upgrading, moving host or committing fees.
- [ ] Third-party license, trademark, data privacy, SLA and support
  obligations evaluated.

## F. Final disposition — default NO-GO

**Go/no-go:** NO-GO (default; do not replace without explicit owner decision).

**Blocking conditions:** all unverified or failed required gates above.

**Reviewer's independent findings:** NOT PROVIDED.

**Owner decision (identity, date, scope, conditions):** NOT PROVIDED.

**Approved rollout / rollback window:** NOT AUTHORIZED.

**Post-release verification and maintenance owner:** NOT ASSIGNED.

This is a record template. It never starts a service, triggers CI,
creates a GitHub release or npm package, or approves production.
