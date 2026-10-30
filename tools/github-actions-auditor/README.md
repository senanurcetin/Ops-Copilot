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

## CSV export for spreadsheet and downstream tooling

Both commands support `--csv` in addition to plain text, JSON and Markdown. CSV includes
stable column headers and explicit sample scope; it is **not** a billing report.

```bash
node scripts/github-actions-audit.mjs owner/repo --limit 10 --csv > actions.csv
node scripts/github-actions-compare.mjs owner/one owner/two --limit 10 --csv > comparison.csv
```

The standalone package exports the same two commands. Workflow rows contain stable numeric
workflow IDs where GitHub supplies them, the sampled run count, API match count (when
known), selected filters, incomplete coverage warnings and a metric caveat. A filter
that finds zero runs still produces a summary row. The single-repository export
always includes a `record_type=summary` row for complete/incomplete job totals
and `record_type=workflow` rows for individual workflows, including their
completed and incomplete job counts; the per-workflow counts sum to the
summary totals for the sampled runs. Filter by this field
before summing elapsed time to avoid double-counting. Comparison rows carry each
repository's coverage information and the non-ranking warning.

Workflow names and other GitHub-controlled text are CSV-quoted, line breaks are flattened,
and formula-like cells are prefixed with an apostrophe to reduce spreadsheet formula
injection risk. Treat exported files as **untrusted external data** when importing into
other tools. `--csv`, `--json` and `--markdown` are mutually exclusive.

After installing a release of the package, two executable commands are available: `github-actions-audit` and `github-actions-compare`. At this stage, packaging does not imply that a release has been uploaded to a package registry.

For private repositories, set a fine-grained `GH_TOKEN` granting only `Actions: read` for the selected repositories. Do not disclose tokens in issue reports or terminal recordings. The client performs GET requests only.

This is a sampled operational diagnostic and **not** a GitHub Actions billing statement, cost estimate or normalized performance ranking.

## Independent consumer and live REST API example

See [the standalone consumer guide](https://github.com/senanurcetin/Ops-Copilot/blob/main/examples/github-actions-auditor-consumer/README.md) and [its runnable ESM example](https://github.com/senanurcetin/Ops-Copilot/blob/main/examples/github-actions-auditor-consumer/consumer.mjs). The example installs the six-file local npm archive into a **separate Node.js project** and imports both supported package exports to query **live public GitHub Actions data**. Running the example is opt-in; offline/automated tests never depend on an external API or registry. Neither a local package nor successful requests mean that the package has been published or adopted externally.

## Release preparation

The isolated package test also verifies the exact archive file list using npm's own `pack --dry-run --json` operation; no secrets, unrelated Next.js sources, or undeclared application files may enter the package. The builder refuses arbitrary cleanup destinations.

Run `npm run auditor:package` to assemble the package at `dist/github-actions-auditor`. Run `npm run auditor:pack:dry-run` to inspect its content without publishing. The account owner controls whether and when any npm release is published.

Developer support: senanur.cetin.work@gmail.com. MIT license. For technical details see the repository's GitHub Actions integration guide.
