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
node scripts/github-actions-audit.mjs senanurcetin/Ops-Copilot --since 2026-10-01 --until 2026-10-12 --branch main --limit 50 --markdown > actions-review.md
node --test tests/github-actions-audit.test.mjs tests/github-actions-compare.test.mjs

# Compare 2–5 repositories (one read-only query sequence per repository)
node scripts/github-actions-compare.mjs senanurcetin/Ops-Copilot senanurcetin/ot-sentinel --since 2026-10-01 --limit 10 --markdown
```

For a private repository, export a token in your local environment (never commit or paste it into tickets):

```bash
export GH_TOKEN="your_fine_grained_token"
node scripts/github-actions-audit.mjs OWNER/PRIVATE_REPO --limit 20
```

**Minimum token access:** select only the repositories being audited and grant `Actions: read`. Keep the token out of the command arguments so it does not show up in shell history. For private repos, the token owner also needs access.

The script is platform-agnostic except for the shell-specific `export` example; on PowerShell use `$env:GH_TOKEN = "..." ` instead.

## Comparing repositories (without triggering Actions)

[**Dated real-world API comparison with linked source runs and job timestamps**](github-actions-repository-comparison-example.md).

The independent comparison CLI uses the same read-only GitHub REST API client as the single-repository auditor:

```bash
node scripts/github-actions-compare.mjs owner/one owner/two --limit 10 --json
node scripts/github-actions-compare.mjs owner/one owner/two --since 2026-10-01 --markdown > comparison.md
npm run audit:github-actions-compare -- owner/one owner/two --limit 5
```

- Accepts **2–5 distinct repositories**, validates each `owner/name` input, and uses **up to 10 recent runs per repository by default** (maximum 100). Calls are sequential to avoid unnecessary API bursts.
- Reports sampled run counts, failed/scheduled runs, completed/incomplete jobs, elapsed job-minutes, and per-repository sampling warnings.
- If any repository cannot be read, the command **fails without emitting a partial JSON/Markdown result**. Private repositories need an appropriately scoped Actions-read token.
- Same `--since YYYY-MM-DD` UTC lower bound applies to each repository. `--branch` is deliberately not available on the cross-repository command, because different repos may use different default branches; compare their unfiltered runs instead or use the single-repo auditor with explicit branches.
- Sorting only makes the sample easier to read. Comparing observed job-minutes across repositories is **not a normalized efficiency score, budget total, or spend ranking**: workflows, activity levels, job complexity and sample truncation differ.

## Report semantics and limits

- `elapsed_job_minutes` is the sum of `completed_at - started_at` for sampled jobs, rounded to one decimal.
- Workflows are grouped by GitHub's **stable numeric `workflow_id`**, not their editable display names. Two different workflow files named `CI` are reported separately, and a renamed workflow retains a continuous history under its original ID. Text and Markdown outputs display this ID beside the name, while JSON includes `workflow_id` on each workflow record. For older/mocked records without a valid ID, the tool falls back to grouping by name; such a fallback may combine identically named workflows.
- **It is not GitHub's billed minutes**, nor an account-level billing statement. Job time excludes incomplete jobs. Runner multipliers, OS-specific rates, storage, cached artifact usage, and additional account activity are not modeled.
- A maximum of 100 recent runs can be inspected; at most 500 jobs per run are sampled. The report flags truncated results.
- Jobs without usable start/end timestamps (including malformed or reversed timestamps) are counted separately as `incomplete_jobs`, **not** as completed zero-minute jobs. Genuine zero-minute jobs remain valid.
- Malformed GitHub API collections or unexpected JSON responses cause the command to **fail explicitly**, rather than incorrectly displaying an empty successful report.
- A rate-limited response is reported with safe retry guidance. HTTP failures never print token values. A JSON or Markdown report is not produced after API validation fails.
- `--since YYYY-MM-DD` uses GitHub's documented `created` workflow-run filter (inclusive lower bound, UTC). It scopes the API query **before** sampling; it does not promise complete historical coverage if more than `--limit` runs match.
- `--branch REF` scopes workflow run discovery to a single branch using GitHub's `branch` REST query parameter. Branch names containing `/` are URI-encoded, and the selected branch is recorded in text, Markdown and JSON output. Combine it with `--since` to focus on one development line; this does not change branches, run workflows or query billing.
- `--markdown` renders a deterministic, escaped Markdown summary you can save or attach to an engineering review. It cannot be combined with `--json`.
- Generated Markdown includes sampled run counts, failures, scheduled triggers, runtime estimates and recommendations. Treat it as diagnostic evidence rather than an exact bill.
- Recommendations are *heuristics*, not proven savings. A high number of scheduled executions, recurring failures, or significant sample runtime prompts human review.
- No automated modification of cron schedules, branch rules, repository permissions or workflows is performed.
- A public repository using standard GitHub-hosted runners does not consume the private-repository included-minutes allowance; a private repository typically does.
- Unauthenticated requests have stricter API rate limits. Use a read-only token if GitHub responds with rate-limit errors.

## Integration and developer support

Integration repository: https://github.com/senanurcetin/Ops-Copilot

Reproducible public API demonstration: [github-api-live-demo.md](github-api-live-demo.md)

Developer Program eligibility and submission evidence: [github-developer-program-application.md](github-developer-program-application.md)

Project support: **senanur.cetin.work@gmail.com**

Issues: https://github.com/senanurcetin/Ops-Copilot/issues

This repository provides a GitHub API integration in development for the GitHub Developer Program's technical eligibility criterion. **GitHub alone decides program acceptance**, and membership does not grant additional GitHub Actions minutes.

Reference: https://docs.github.com/en/integrations/concepts/github-developer-program
