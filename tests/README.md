# Testing Guide

## Current test layers

- `npm run test` runs the lightweight document-ranking unit checks with the Node test runner.
- `npx playwright test` is kept as a draft E2E harness for manual verification work.

## Unit tests

Current unit coverage is intentionally narrow and focuses on ranking behavior in:

- `tests/document-ranking.test.ts`

Run it with:

```bash
npm run test
```

## Playwright E2E

Playwright is configured in [`playwright.config.ts`](../playwright.config.ts). The browser tests are not treated as required CI gates yet because the authenticated product flow still needs dedicated test fixtures and stable selectors.

Run the draft E2E harness manually with:

```bash
npm run e2e
npm run e2e:headed
npm run e2e:debug
```

## CI posture

- Main CI uses lint, typecheck, unit test, and build.
- The Playwright workflow is `workflow_dispatch` only until the browser tests are upgraded from draft coverage to stable release gates.
