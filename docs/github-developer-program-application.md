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

## Short integration description (English)

> Ops-Copilot includes a developer-facing GitHub Actions auditor that uses the GitHub REST API to retrieve repository workflow runs and job execution timestamps. It helps maintainers inspect recurring workflows, failure frequency, and approximate elapsed job time without starting new GitHub Actions runs. The integration is open source, read-only, works as a standalone Node.js command-line tool, includes automated tests, and provides documentation and an accessible support email. It is currently in active development.

## How to demonstrate technical eligibility

1. Open the [public source code](../scripts/github-actions-audit.mjs) and show the `GET /repos/{owner}/{repo}/actions/runs` and `GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs` calls.
2. Open the [dated, independently linkable live API snapshot](github-api-live-demo.md).
3. Run `node scripts/github-actions-audit.mjs senanurcetin/Ops-Copilot --limit 5 --markdown` locally with Node.js 20 or later.
4. Open the [automated tests](../tests/github-actions-audit.test.mjs) to inspect the validation and read-only behavior.
5. Review a [second independently verifiable GitHub API demo comparing two public repositories](github-actions-repository-comparison-example.md), with clear sampling and non-billing limitations.

The official program documentation additionally suggests sharing an integration via a blog or video; that is guidance, **not a prerequisite**. The public [integration demo article](github-api-live-demo.md) is shareable without any new hosted infrastructure.

## What the account owner must do

- Open https://github.com/developer/register while signed in to the intended GitHub account.
- Supply any required information truthfully, pointing to the integration and contact email above.
- Review and personally accept GitHub's applicable agreement, and submit the application.
- Check the GitHub account and email for the outcome. We **cannot** claim approval until GitHub confirms it.

## Benefits: important distinction

Developer Program membership itself does **not** guarantee extra GitHub Actions minutes, free Copilot Pro, ChatGPT Plus, Claude Pro, API credits, or GitHub Marketplace listing. Those have separate offers and eligibility conditions.
