# Changelog — GitHub Actions Auditor

The standalone CLI uses semantic versioning. Dates represent the source snapshot and do not imply a package-registry publication.

## [0.1.0] — 2026-10-12 (release candidate, not published)

### Added

- Read-only GitHub REST workflow-run and paginated job inspection.
- Filters for inclusive UTC date windows, branch, event and status.
- Markdown, JSON and human-readable reports.
- Two-to-five repository comparison command.
- Stable GitHub workflow IDs to prevent false grouping by display name.
- Safe rate-limit and malformed-response handling, sample caps and incomplete-job reporting.
- Dependency-free npm-style packaging with isolated CLI entry points and offline verification tests.
- Optional GitHub App installation-token integration remains in the parent repository and is not required by the CLI package.

### Limitations

- Job duration is an observed sum of elapsed job time, **not** GitHub's billed Actions minutes, cost or quota use.
- API rate limits and limited run history apply. Reports disclose sampling limitations.
- Package name availability and npm ownership require confirmation by the account owner.
- No registry package, GitHub release or git tag has been created by preparing this changelog.
