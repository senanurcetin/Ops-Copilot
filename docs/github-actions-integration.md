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
node scripts/github-actions-audit.mjs senanurcetin/Ops-Copilot --event schedule --status failure --limit 10 --markdown
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
node scripts/github-actions-compare.mjs owner/one owner/two --event pull_request --status failure --limit 10 --markdown
node scripts/github-actions-compare.mjs owner/one owner/two --since 2026-10-01 --until 2026-10-12 --markdown > comparison.md
npm run audit:github-actions-compare -- owner/one owner/two --limit 5
```

- Accepts **2–5 distinct repositories**, validates each `owner/name` input, and uses **up to 10 recent runs per repository by default** (maximum 100). Calls are sequential to avoid unnecessary API bursts.
- Reports sampled run counts, failed/scheduled runs, completed/incomplete jobs, elapsed job-minutes, and per-repository sampling warnings.
- `--event EVENT` (e.g. `push`, `pull_request`, `schedule`, `workflow_dispatch`) and `--status STATUS` (e.g. `failure`, `success`, `completed`, `in_progress`) apply the **same GitHub REST filters** to every repository before the run cap. The supported status values follow GitHub's documented API enum. Each selected filter appears in text, JSON and Markdown. A request like `--status failure` returns only failed runs, so its failure count is scoped to that subset; it is not a global failure rate.
- If any repository cannot be read, the command **fails without emitting a partial JSON/Markdown result**. Private repositories need an appropriately scoped Actions-read token.
- `--since YYYY-MM-DD` and `--until YYYY-MM-DD` define the same **inclusive UTC calendar-day range** for every compared repository. Either boundary can be used alone; a reversed date range fails before any API requests. GitHub's `created` search filter applies **before** the existing per-repository sample cap. Date-limited results are still not account-wide billing totals.
- Same `--since YYYY-MM-DD` UTC lower bound applies to each repository. `--branch` is deliberately not available on the cross-repository command, because different repos may use different default branches; compare their unfiltered runs instead or use the single-repo auditor with explicit branches.
- Sorting only makes the sample easier to read. Comparing observed job-minutes across repositories is **not a normalized efficiency score, budget total, or spend ranking**: workflows, activity levels, job complexity and sample truncation differ.

## REST reliability and request efficiency

- The command retries an idempotent GitHub **GET** request at most twice for short transient `429`, `502`, `503` or `504` responses. If GitHub provides a short `Retry-After` (either numeric seconds or a valid HTTP-date within 3 seconds), it is respected. Long, invalid or ambiguous `Retry-After` values are treated as a reason **not to retry**, preventing unintended request bursts during server throttling. Long rate-limit windows are reported immediately rather than issuing more requests. Authentication failures (`401`, permission-denied `403`) are not blindly retried.
- For **anonymous public repository requests only**, a process-local cache can reuse successful GitHub API responses for 30 seconds, with a maximum of 100 entries. Expired entries are ignored; cached data is defensively copied. **Authenticated requests are never cached** in this shared cache, to prevent private-token response mixing.
- The public web Explorer also uses server-side cache revalidation; it does not store installation tokens.
- This is not persistent caching across separate CLI processes, and it does not change or consume GitHub Actions runner quotas. Never interpret sampled job durations as billed minutes.

## Report semantics and limits

- `elapsed_job_minutes` is the sum of `completed_at - started_at` for sampled jobs, rounded to one decimal.
- Workflows are grouped by GitHub's **stable numeric `workflow_id`**, not their editable display names. Two different workflow files named `CI` are reported separately, and a renamed workflow retains a continuous history under its original ID. Text and Markdown outputs display this ID beside the name, while JSON includes `workflow_id` on each workflow record. For older/mocked records without a valid ID, the tool falls back to grouping by name; such a fallback may combine identically named workflows.
- **It is not GitHub's billed minutes**, nor an account-level billing statement. Job time excludes incomplete jobs. Runner multipliers, OS-specific rates, storage, cached artifact usage, and additional account activity are not modeled.
- A maximum of 100 recent runs can be inspected; at most 500 jobs per run are sampled. The report flags truncated results.
- When the GitHub REST API supplies `total_count` for workflow runs, the auditor reports it as `total_matching_runs`. The number of API matches is distinct from `inspected_runs` (the subset with downloaded job details). A warning now states the exact coverage, such as *Only 3 of 250 matching workflow runs were sampled*. If all matches fit within the requested limit, the report does **not** falsely claim that older runs were omitted. Some old or mocked responses omit `total_count`; in that case total coverage remains **unknown**, never assumed to be zero. Impossible counts fail validation.
- The multi-repository JSON/Markdown/terminal comparison preserves each repository's own GitHub matching count. Do not compare failure totals as complete or calculate account-wide failure rates when only some of the matching runs were inspected.
- For each run, the fetched job count must match GitHub's declared `total_count` (up to the intentional 500-job sample cap). Repeated GitHub job IDs across pages are also rejected. If a page is missing or inconsistent, the auditor fails rather than displaying misleading elapsed job-minutes. A valid run with more than 500 jobs is labeled as truncated, never silently treated as complete.
- Jobs without usable start/end timestamps (including malformed or reversed timestamps) are counted separately as `incomplete_jobs`, **not** as completed zero-minute jobs. Genuine zero-minute jobs remain valid.
- Malformed GitHub API collections or unexpected JSON responses cause the command to **fail explicitly**, rather than incorrectly displaying an empty successful report.
- A rate-limited response is reported with safe retry guidance. HTTP failures never print token values. A JSON or Markdown report is not produced after API validation fails.
- `--until YYYY-MM-DD` adds the inclusive UTC upper bound to GitHub's `created` search filter. With both bounds, the tool sends `created=START..END`; with only `--until`, it sends `created=<=END`. Both forms were verified against the public GitHub API on 12 October 2026. Invalid or inverted ranges are rejected before any network request. JSON, text and Markdown record any selected upper bound.
- `--since YYYY-MM-DD` uses GitHub's documented `created` workflow-run filter (inclusive lower bound, UTC). It scopes the API query **before** sampling; it does not promise complete historical coverage if more than `--limit` runs match.
- `--event EVENT` scopes workflow runs by their trigger, and `--status STATUS` scopes by GitHub's status or conclusion. You can use either independently, or combine them with `--since`, `--until` and `--branch`. Invalid values are rejected before any network request. GitHub applies these filters server-side and may impose a 1,000-result cap per filtered query; these tools only inspect up to their selected per-page limit.
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
