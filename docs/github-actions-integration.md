# GitHub Actions API integration

**Status:** in development; a working, read-only REST API client included in this repository.

This is a standalone developer-facing operational diagnostic tool accompanying Ops-Copilot. It does **not** inspect industrial telemetry, execute GitHub Actions, alter settings, or automatically reduce your GitHub bill.

## Why

CI pipelines can silently consume minutes through repetitive schedules, failed reruns, or expensive jobs. This utility retrieves existing workflow history and job timings from GitHub's REST API so engineers can prioritize optimizations using evidence.

## API integration

The tool uses the official GitHub REST API:

- `GET /repos/{owner}/{repo}/actions/runs` — recent workflow runs.
- `GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs` — jobs associated with each run, including pagination for large workflows.

The client supports public repositories without authentication, private repositories with an optional fine-grained access token, 15-second HTTP timeouts and explicit HTTP error handling. The scope is **read-only**: no write endpoints are called.

## Run locally (without Actions minutes)

Requirements: Node.js 20+; no npm install, cloud deployment or API key is required for public repositories.

```bash
node scripts/github-actions-audit.mjs senanurcetin/Ops-Copilot --limit 20
node scripts/github-actions-audit.mjs senanurcetin/ot-sentinel --limit 10 --json
node --test tests/github-actions-audit.test.mjs
```

For a private repository, export a token in your local environment (never commit or paste it into tickets):

```bash
export GH_TOKEN="your_fine_grained_token"
node scripts/github-actions-audit.mjs OWNER/PRIVATE_REPO --limit 20
```

**Minimum token access:** select only the repositories being audited and grant `Actions: read`. Keep the token out of the command arguments so it does not show up in shell history. For private repos, the token owner also needs access.

The script is platform-agnostic except for the shell-specific `export` example; on PowerShell use `$env:GH_TOKEN = "..." ` instead.

## Report semantics and limits

- `elapsed_job_minutes` is the sum of `completed_at - started_at` for sampled jobs, rounded to one decimal.
- **It is not GitHub's billed minutes**, nor an account-level billing statement. Job time excludes incomplete jobs. Runner multipliers, OS-specific rates, storage, cached artifact usage, and additional account activity are not modeled.
- A maximum of 100 recent runs can be inspected; at most 500 jobs per run are sampled. The report flags truncated results.
- Recommendations are *heuristics*, not proven savings. A high number of scheduled executions, recurring failures, or significant sample runtime prompts human review.
- No automated modification of cron schedules, branch rules, repository permissions or workflows is performed.
- A public repository using standard GitHub-hosted runners does not consume the private-repository included-minutes allowance; a private repository typically does.
- Unauthenticated requests have stricter API rate limits. Use a read-only token if GitHub responds with rate-limit errors.

## Integration and developer support

Integration repository: https://github.com/senanurcetin/Ops-Copilot

Project support: **senanur.cetin.work@gmail.com**

Issues: https://github.com/senanurcetin/Ops-Copilot/issues

This repository provides a GitHub API integration in development for the GitHub Developer Program's technical eligibility criterion. **GitHub alone decides program acceptance**, and membership does not grant additional GitHub Actions minutes.

Reference: https://docs.github.com/en/integrations/concepts/github-developer-program
