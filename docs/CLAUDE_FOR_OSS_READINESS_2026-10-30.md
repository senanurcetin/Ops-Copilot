# Claude for Open Source — evidence-led readiness (2026-10-30)

This is a preparation and gap-assessment record, **not** an Anthropic application,
acceptance claim, or assertion of eligibility. Anthropic alone decides eligibility.

## Program and authoritative references

- Official application: https://claude.com/contact-sales/claude-for-oss
- Official terms: https://www.anthropic.com/claude-for-oss-terms
- Benefit described in the terms: six months of complimentary Claude Max 20x,
  **not API credits**. A paid plan may resume billing afterward.
- Verified against the terms dated/retrieved 2026-10-30.

## Baseline checks

| Requirement | Evidence at check | Assessment |
| --- | --- | --- |
| Individual applicant, age and supported region | Not verifiable from repository | OWNER MUST CONFIRM |
| GitHub account at least two years old | GitHub user `created_at` not verified | BLOCKER UNTIL VERIFIED |
| Public OSS contribution in past 90 days | Public repository pushed 2026-10-26 (GitHub metadata); verify author activity separately | NEEDS AUTHOR VERIFICATION |
| OSI-approved license | Root MIT `LICENSE` and GitHub SPDX MIT | OBSERVED |
| 500 dependent repos or 100 dependent packages | No independently verified figures | NOT DEMONSTRATED |
| 200,000 combined monthly registry downloads | Standalone package is a pre-release candidate, not declared published | NOT DEMONSTRATED |
| Listed committer of recognized foundation/language project | No supporting evidence in this repository | NOT DEMONSTRATED |
| 100 PRs merged into others' public repos within 12 months | No verified author-level count | NOT DEMONSTRATED |
| 20 external contributors with merged PRs in past 12 months | No verified contributor-level count | NOT DEMONSTRATED |
| OpenSSF criticality score >= 0.4 | No measured criticality score on record | NOT DEMONSTRATED |
| Discretionary ecosystem impact | Needs real independent consumers and downstream use cases | NOT DEMONSTRATED |

The main project is an industrial document-grounded AI assistant. The standalone
`tools/github-actions-auditor` developer utility can help external users audit
recent GitHub Actions workflow runs using read-only REST endpoints without
installing the application, but technical availability **does not establish adoption**.

## Existing engineering evidence

- Maintained sources: `scripts/github-actions-audit.mjs` and
  `scripts/github-actions-compare.mjs`.
- Standalone dependency-free npm-style package builder:
  `npm run auditor:package`, `npm run auditor:pack:dry-run`.
- Local tests: `tests/github-actions-audit.test.mjs`,
  `tests/github-actions-compare.test.mjs`,
  `tests/github-actions-package.test.mjs`,
  `tests/github-actions-csv.test.mjs` (new on this feature branch).
- Public documented API example: `docs/github-api-live-demo.md`.
- The sampled reports do not measure billed minutes, account-wide use or cost.
- Package has **not** been confirmed as published to npm or used by external teams.

## Highest-value next steps

1. Verify the GitHub account's exact creation timestamp via the public
   GitHub Users API (`GET https://api.github.com/users/senanurcetin`,
   `created_at`). If it is less than two years before the application date,
   **the formal general eligibility requirement is not satisfied**.
2. Verify original, recent public OSS contributions and merged upstream PRs,
   excluding self-owned repos from the 100-external-PR criterion.
3. Keep the CLI genuinely useful to independent consumers: repeatable package
   installation, a clear license, API contract, offline tests, public issues,
   security policy and credible versioned releases.
4. Encourage genuine users to report bugs and contribute useful fixes; obtain
   opt-in external usage evidence when it actually exists. Never purchase stars,
   manufacture external contributors, automate contribution inflation or imply
   deployments or package-registry adoption without evidence.
5. Measure real dependency-graph dependents, registry downloads and OpenSSF
   criticality score only from source records with dates; maintain a dated
   claim-to-link evidence table.
6. Apply to the Maintainer Track only with verified qualifying evidence, or
   use the discretionary Ecosystem Impact track only when demonstrable
   ecosystem significance exists. The discretionary path does not waive the
   general requirements.

## Application questions to answer truthfully

**Project reach and impact:** Identify the specific problem solved, who uses the
CLI independently, published release and usage evidence, external issue or PR
participation, and what existing tools do not cover. State unknown counts as
unknown; do not substitute repository creation or test volume for adoption.

**How Claude Max would be used:** Propose work on maintenance, contributor
reviews, safer GitHub API pagination and rate-limit behavior, repeatable tests
and documentation. This is a *planned use*, not evidence that Claude was used
to build existing code.

**Selection is not guaranteed.** Official terms permit discretionary review,
give no review timeline, and do not guarantee notification of rejection.
