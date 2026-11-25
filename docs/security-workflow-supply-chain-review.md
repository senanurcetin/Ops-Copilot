# Security workflow supply-chain review — 4 November 2026

## Scope

Repository: **senanurcetin/Ops-Copilot**.
Reviewed workflow: [security-checks.yml](../.github/workflows/security-checks.yml).

This workflow is manual/scheduled, not a required PR CI gate. The analysis
is based on public upstream action contents and repository settings; the
scanner has **not** been executed on a production environment.

## Third-party action provenance

- Upstream: [dependency-check/Dependency-Check_Action](https://github.com/dependency-check/Dependency-Check_Action)
- Pinned commit: [1e54355a8b4c8abaa8cc7d0b70aa655a3bb15a6c](https://github.com/dependency-check/Dependency-Check_Action/commit/1e54355a8b4c8abaa8cc7d0b70aa655a3bb15a6c)
- Upstream main resolved to this commit during review. GitHub commit API
  reported cryptographic verification **verified=true**, **reason=valid**,
  commit date **2025-12-10**.
- Reviewed action.yml, Dockerfile, entrypoint.sh, and readme.md at that SHA.
- This Docker action's Dockerfile uses
  **FROM owasp/dependency-check-action:latest** and **USER root**.
- The entrypoint invokes OWASP dependency-check. The action configuration
  includes a no-update flag; upstream documentation states the Docker image
  is rebuilt periodically with a vulnerability database. **We did not
  independently verify the version or freshness of that database.**

## Implemented source-level hardening

1. Pin the action reference previously set to the mutable main branch
   to the reviewed 40-hex Git commit.
2. Grant the default workflow GitHub token only **contents: read**.
3. Prevent checkout from persisting credentials in either job.
4. Preserve existing scheduled/manual triggers and JSON report artifact.
5. Add offline tests for the source-level security invariants.

## Remaining risks (not resolved)

**Pinning the action commit does not pin the runtime Docker image**:
the upstream Dockerfile still requests a moving latest tag. Further
supply-chain work is necessary before treating the full scanner runtime
as reproducible. Running the image as root is also a review concern.
A report can be stale even when the scan succeeds, particularly if its
vulnerability database age is unknown.

- [ ] Replace or sandbox the scanner with a reviewed digest-pinned image
  or a reproducible, explicitly versioned equivalent.
- [ ] Prove vulnerability database version/freshness and report coverage.
- [ ] Verify a manual or scheduled security workflow execution and an
  actual nonempty, parseable JSON artifact; normal PR build does not
  execute this scan.
- [ ] Review repository token permissions, artifact access, and action
  upgrade provenance at each future change.
- [ ] Review first-party actions tag pinning separately, without touching
  Dependabot branches or other active PRs.

## Evidence boundaries

A successful regular GitHub Actions build, emulator test, CircleCI
node-quality or Vercel status is **not** proof that this particular
manually/scheduled dependency scanner has run. No production deployment,
billing, live Firebase reads, record deletion, TTL, secret export, webhook
or worker activation is approved by this hardening.

See the [Senior Engineering Readiness Audit](ENGINEERING_READINESS_AUDIT_2026-11-03.md)
and [open-core commercialization ADR](adr/0001-open-core-commercial-boundary.md).


## 4 November 2026 — report evidence integrity gate (source change)

The weekly/manual OWASP security job now calls
\`node scripts/verify-dependencycheck-report.mjs\` with \`if: always()\`,
**before** uploading the report artifact. A missing, malformed, oversized,
stale or wrong-project report fails the security job, while the artifact
upload remains \`if: always()\` to preserve diagnostic evidence.

The read-only validator requires OWASP JSON report schema 1.x,
engineVersion, project name \`Ops-Copilot\`, a recent report timestamp,
a nonempty npm manifest scan result and an NVD CVE Checked timestamp
declared within 72 hours. It refuses structured scanner exceptions,
checks that the NVD timestamp is not inconsistent with scan time,
returns aggregate vulnerability counts only and never prints raw
dependency paths or advisory payloads.

The validation **does not prove** that the image's vulnerability
database is actually fresh: the reported NVD timestamp is upstream
self-reported metadata, and the Docker base image still uses \`:latest\`.
Nor does this PR assert a real scheduled/manual security run or
a digest-pinned image. A zero-vulnerability report does not grant
production approval or prove exhaustive dependency coverage.

Follow-up remains necessary: digest-pin or replace scanner runtime,
verify actual execution/artifact metadata, review indicated CVEs and
independently assess database freshness in an owner-approved test.
