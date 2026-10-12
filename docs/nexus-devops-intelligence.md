# NEXUS DevOps Intelligence — MVP development record

**Status:** Stage 1 implemented on a feature branch; not a deployed production system.

This is the first independent product surface built inside the existing Ops-Copilot codebase. The product may move to a dedicated repository once the public preview has been tested and its deployment path is settled. No new GitHub repository, Marketplace listing, npm publication or GitHub App installation is implied.

## Stage 1: public, read-only preview

- Route: `/developer-tools/nexus`
- Existing API: `GET /api/public-actions?repository=owner/repo`, samples up to **10** recent workflow runs.
- New API: `GET /api/public-prs?repository=owner/repo`, lists six open PRs and fetches details for up to five. The sixth entry indicates that the list is truncated. At most six upstream GitHub GET requests occur per uncached PR analysis (one list, five detail calls).
- Data sources: official GitHub REST `GET /repos/{owner}/{repo}/actions/runs`, `GET /repos/{owner}/{repo}/pulls` and `GET /repos/{owner}/{repo}/pulls/{pull_number}`.
- Authentication: none; **public repositories only**. No write scopes, secrets, Actions execution, installation tokens or private repository data.
- Safety: fixed `api.github.com` host; strict owner/repo validation; PR link validation; abort previous queries on repo change; short API timeouts and Next.js caching.
- Known limits: GitHub `mergeable` may be `null`; statuses can be delayed or stale; `blocked` can reflect multiple policies; no CI check-run inspection or root-cause diagnosis. Missing details remain **Unknown** rather than being treated as successful. Statistics use sampled records, never repo-wide totals.

## Local verification

```bash
npm ci
node --import tsx --test tests/nexus-public-prs.test.mjs
npm run typecheck
npm run lint
npm run build
```

Manually inspect `/developer-tools/nexus` with the app running, and enter a *public* repository with known recent Actions and open PRs. Verify both success and 404/rate-limit paths, plus mobile display and keyboard navigation. Offline unit tests do not verify GitHub availability or a production deployment.

## Next milestones

1. Verify strict TypeScript, lint, build and new test suites in the complete checkout.
2. Run a smoke test against current public GitHub API results and confirm UI accessibility.
3. Deploy the public read-only preview (hosting quota/permissions permitting).
4. Add reliable check-run and review state gathering with explicit rate-limit and pagination behavior.
5. Extract the developer UI/API into a dedicated repository without changing Ops-Copilot's industrial assistant responsibilities.
6. Only after stable public use, consider scoped GitHub App installation, CircleCI integration and explainable failure classification.

This feature does not add billable GitHub Actions minutes, guarantee a merge decision or claim AI-generated root cause analysis.