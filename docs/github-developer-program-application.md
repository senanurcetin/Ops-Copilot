# GitHub Developer Program — application evidence

This document contains a ready-to-review summary for the **GitHub Developer Program**. It does not represent approval, a GitHub-issued certificate, or a registered Marketplace listing.

## Eligibility checked against the official program

The official program page lists two substantive eligibility requirements:

1. An integration that is in development or production and uses the GitHub API.
2. An email address GitHub users can contact for support.

Source: https://docs.github.com/en/integrations/concepts/github-developer-program

The registration agreement and the program's current terms still apply: https://docs.github.com/en/site-policy/github-terms/github-registered-developer-agreement

These are **not** the separate GitHub Marketplace listing criteria, paid-app install counts, GitHub Student Pack criteria, or the open-source-maintainer Copilot benefit conditions.

## Submission details

| Item | Value |
| --- | --- |
| Applicant GitHub account | [senanurcetin](https://github.com/senanurcetin) |
| Integration name | Ops-Copilot GitHub Actions Auditor |
| Integration stage | In development; public, executable CLI |
| Public repository | https://github.com/senanurcetin/Ops-Copilot |
| GitHub API integration code | [`scripts/github-actions-audit.mjs`](../scripts/github-actions-audit.mjs) |
| Unit tests | [`tests/github-actions-audit.test.mjs`](../tests/github-actions-audit.test.mjs) |
| User guide | [`github-actions-integration.md`](github-actions-integration.md) |
| Real API evidence | [`github-api-live-demo.md`](github-api-live-demo.md) |
| Support contact | [senanur.cetin.work@gmail.com](mailto:senanur.cetin.work@gmail.com) |
| Security reporting | [`SECURITY.md`](../SECURITY.md) |
| Standalone CLI package candidate | [`tools/github-actions-auditor/`](../tools/github-actions-auditor/) — version 0.1.0, not published to npm |
| Reproducible package tests | [`tests/github-actions-package.test.mjs`](../tests/github-actions-package.test.mjs) |
| Public interactive UI source | [`/developer-tools/github-actions`](../src/app/developer-tools/github-actions/page.tsx) — not publicly deployed |
| Optional GitHub App authentication | [`docs/github-app-integration.md`](github-app-integration.md) — local scaffold; no app installation claimed |

## Short integration description (English)

> Ops-Copilot includes a developer-facing GitHub Actions auditor that uses the GitHub REST API to retrieve repository workflow runs and job execution timestamps. It helps maintainers inspect recurring workflows, failure frequency, and approximate elapsed job time without starting new GitHub Actions runs. The integration is open source, read-only, works as a standalone Node.js command-line tool, includes automated tests, and provides documentation and an accessible support email. It is currently in active development.

## How to demonstrate technical eligibility

1. Open the [public source code](../scripts/github-actions-audit.mjs) and show the `GET /repos/{owner}/{repo}/actions/runs` and `GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs` calls.
2. Open the [dated, independently linkable live API snapshot](github-api-live-demo.md).
3. Run `node scripts/github-actions-audit.mjs senanurcetin/Ops-Copilot --limit 5 --markdown` locally with Node.js 20 or later.
4. Open the [automated tests](../tests/github-actions-audit.test.mjs) to inspect the validation and read-only behavior.
5. Review a [second independently verifiable GitHub API demo comparing two public repositories](github-actions-repository-comparison-example.md), with clear sampling and non-billing limitations.

The official program documentation additionally suggests sharing an integration via a blog or video; that is guidance, **not a prerequisite**. The public [integration demo article](github-api-live-demo.md) is shareable without any new hosted infrastructure.

## Interactive public repository demo

A [public GitHub Actions Explorer source page](../src/app/developer-tools/github-actions/page.tsx) and [read-only server-side API handler](../src/app/api/public-actions/route.ts) demonstrate an accessible UI for selecting a public repository and viewing GitHub workflow history. The route is `/developer-tools/github-actions` **when the app is running**; there is no claim that this page has been publicly deployed.

## Optional GitHub App implementation

This repository now also includes [offline-tested GitHub App JWT and installation-token authentication](github-app-integration.md). It illustrates a least-privilege path for private repositories, but the GitHub App has **not** been registered or installed by this repository work. Registration is not required by the core Developer Program eligibility rules.

## Current evidence and deployment status (12 October 2026)

The integration already meets the **technical description** of a public, in-development GitHub REST API application with a declared developer support address; only GitHub can determine program membership.

- **Implemented and merged:** a standalone Node.js CLI, a multi-repository comparison command, workflow/date/branch/event/status filters, validation of job pagination, failure handling and offline tests. No GitHub Actions workflow changes are necessary to use the local CLI.
- **Prepared, not published:** an independently buildable `@senanurcetin/github-actions-auditor` 0.1.0 npm package candidate with a [release checklist](github-auditor-release-process.md). npm ownership, registry publication and a GitHub Release have not been completed.
- **Prepared, not registered:** GitHub App JWT/installation-token authentication with requested `Actions: read` permission. App creation, key provisioning and installation are manual account-owner actions; no public app or Marketplace listing is claimed.
- **Implemented, not publicly deployed:** a browser-based public GitHub Actions Explorer at `/developer-tools/github-actions`, plus a public-only read API route. A Vercel project `ops-copilot-developer-demo` has been created and linked to this GitHub repository, but the initial preview deployment was rejected by a daily Hobby deployment limit on 12 October 2026. **No live demo URL exists yet.** The CLI and [public API case study](github-actions-repository-comparison-example.md) provide independently verifiable alternatives.
- **Separate open-source contribution evidence (not a Developer Program requirement):** three submitted PRs to `pydata/xarray`: [#11713](https://github.com/pydata/xarray/pull/11713), [#11714](https://github.com/pydata/xarray/pull/11714) and [#11715](https://github.com/pydata/xarray/pull/11715). They were open and not merged when checked on 12 October 2026; do not list them as accepted contributions.

The GitHub Developer Program's published eligibility rules do **not** require an npm package, production deployment, GitHub App registration, Marketplace listing or a particular number of upstream PRs. Do not delay an otherwise accurate membership application just to complete those optional milestones.

## What the account owner must do

- Open https://github.com/developer/register while signed in to the intended GitHub account.
- Supply any required information truthfully, pointing to the integration and contact email above.
- Review and personally accept GitHub's applicable agreement, and submit the application.
- Check the GitHub account and email for the outcome. We **cannot** claim approval until GitHub confirms it.

## Benefits: important distinction

Developer Program membership itself does **not** guarantee extra GitHub Actions minutes, free Copilot Pro, ChatGPT Plus, Claude Pro, API credits, or GitHub Marketplace listing. Those have separate offers and eligibility conditions.
