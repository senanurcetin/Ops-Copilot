# GitHub Actions Auditor — standalone CLI

This Node.js 20+ tool uses the read-only GitHub REST API to inspect sampled workflow runs, failures, and elapsed job time. The package has no runtime dependencies on Next.js, Firebase, or the full Ops-Copilot application.

The maintained sources remain in `scripts/github-actions-audit.mjs` and `scripts/github-actions-compare.mjs`. The package builder copies them into a self-contained distribution.

## Local packaging and use

From the repository root:

```bash
npm run auditor:package
node dist/github-actions-auditor/bin/github-actions-audit.mjs senanurcetin/Ops-Copilot --limit 5 --markdown
node dist/github-actions-auditor/bin/github-actions-compare.mjs senanurcetin/Ops-Copilot senanurcetin/ot-sentinel --limit 5 --json
npm run auditor:pack:dry-run
```

After installing a release of the package, two executable commands are available: `github-actions-audit` and `github-actions-compare`. At this stage, packaging does not imply that a release has been uploaded to a package registry.

For private repositories, set a fine-grained `GH_TOKEN` granting only `Actions: read` for the selected repositories. Do not disclose tokens in issue reports or terminal recordings. The client performs GET requests only.

This is a sampled operational diagnostic and **not** a GitHub Actions billing statement, cost estimate or normalized performance ranking.

## Release preparation

Run `npm run auditor:package` to assemble the package at `dist/github-actions-auditor`. Run `npm run auditor:pack:dry-run` to inspect its content without publishing. The account owner controls whether and when any npm release is published.

Developer support: senanur.cetin.work@gmail.com. MIT license. For technical details see the repository's GitHub Actions integration guide.
