# Verifiable GitHub API integration demo

**Project:** Ops-Copilot — read-only GitHub Actions auditor  
**Public integration source:** [`scripts/github-actions-audit.mjs`](../scripts/github-actions-audit.mjs)  
**Unit tests:** [`tests/github-actions-audit.test.mjs`](../tests/github-actions-audit.test.mjs)  
**Developer support:** [senanur.cetin.work@gmail.com](mailto:senanur.cetin.work@gmail.com)

## What it solves

Developers maintaining several repositories need a low-friction way to inspect GitHub Actions run frequency, repeated failures, and approximate job execution time, especially when they are investigating their CI budgets. This tool is a standalone, read-only Node.js CLI provided in the Ops-Copilot repository. It does **not** execute workflows or change repository settings.

## Live GitHub REST API integration

The CLI requests:

1. `GET /repos/{owner}/{repo}/actions/runs` to fetch workflow history (optionally filtered by `created`).
2. `GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs` to retrieve started and completed timestamps for each job.

The endpoints are GitHub-hosted public REST resources. Public repositories can be inspected without a token; private repositories require an access token with **Actions: read** scoped to the requested repositories. The script does not request or require write permission.

## Reproduce it locally

Requires Node.js 20+, without a global CLI installation or a GitHub Actions runner. From the repository root:

```bash
node scripts/github-actions-audit.mjs --help
node scripts/github-actions-audit.mjs senanurcetin/Ops-Copilot --limit 5
node scripts/github-actions-audit.mjs senanurcetin/Ops-Copilot --since 2026-10-01 --limit 5 --markdown
node scripts/github-actions-audit.mjs senanurcetin/Ops-Copilot --limit 5 --json
node --test tests/github-actions-audit.test.mjs
```

**Note:** These are live queries. The five latest workflow runs will change over time; the snapshot below is dated and should not be mistaken for permanent current-state data.

## Verified public API snapshot — 12 October 2026

The following five run records and one completed job per run were independently read from GitHub's public REST API. All five runs concluded **success**. UTC timestamps and links are retained so this evidence can be checked independently.

| Workflow run | Trigger | Started (UTC) | Completed (UTC) | Elapsed job-minutes |
| --- | --- | --- | --- | ---: |
| [38267584170](https://github.com/senanurcetin/Ops-Copilot/actions/runs/38267584170) | push | 15:04:48 | 15:06:03 | 1.3 |
| [38267576644](https://github.com/senanurcetin/Ops-Copilot/actions/runs/38267576644) | pull_request | 15:04:45 | 15:06:24 | 1.7 |
| [38267141586](https://github.com/senanurcetin/Ops-Copilot/actions/runs/38267141586) | push | 15:01:11 | 15:02:56 | 1.8 |
| [38266851189](https://github.com/senanurcetin/Ops-Copilot/actions/runs/38266851189) | pull_request | 14:58:55 | 15:00:44 | 1.8 |
| [38265715712](https://github.com/senanurcetin/Ops-Copilot/actions/runs/38265715712) | pull_request | 14:49:29 | 14:50:55 | 1.4 |

**Actual total (before rounding each row):** 474 elapsed seconds, or **7.9 job-minutes** across these five completed jobs.

GitHub API evidence endpoints (replace the run ID for each row):

- [Public workflow runs](https://api.github.com/repos/senanurcetin/Ops-Copilot/actions/runs?per_page=5)
- [Job timestamps for run 38267584170](https://api.github.com/repos/senanurcetin/Ops-Copilot/actions/runs/38267584170/jobs)

**Accounting caveat:** This is a *time-based diagnostic*, not a screenshot of GitHub billing, a billable minutes calculation, an account-wide usage total, or evidence of free-tier benefit entitlement. The CLI deliberately distinguishes measured job elapsed time from billed minutes.

## Data, privacy and security boundary

- The CLI only issues GitHub API `GET` requests and does not trigger or rerun workflows.
- Authentication is optional for public repositories. A private-repository token is read from `GH_TOKEN` or `GITHUB_TOKEN` environment variables; it is not saved to disk by this tool.
- The CLI prints metadata about workflow executions: workflow name, run counts, result status and timings. Generated reports may expose repository and workflow names; avoid sharing private report files publicly.
- Requests use a 15-second timeout and the CLI fails explicitly when GitHub returns an error. Unauthenticated access is subject to API rate limits.
- The report is based on a capped set of recent runs and is not a complete analysis of a billing cycle.

## Product status and limitations

This is **a functioning GitHub API integration in active development**, shipped as a documented CLI inside a broader industrial AI repository. It is **not** presented as a published GitHub Marketplace App, registered OAuth application, hosted SaaS product, or a certified GitHub partner integration. No GitHub Developer Program acceptance is claimed.

See [integration guide](github-actions-integration.md) for options and scope, and [Developer Program application materials](github-developer-program-application.md) for the official eligibility reference.
