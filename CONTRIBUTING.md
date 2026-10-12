# Contributing to Ops-Copilot

Ops-Copilot is an open-source engineering portfolio project combining a document-grounded industrial assistant, a public manufacturing case study, and standalone **read-only GitHub REST API developer tools**.

Contributions that improve reproducibility, testing, documentation, accessibility, or security are welcome. Maintainers may prioritize well-scoped changes and do not guarantee review or merge.

## Before proposing a change

- Search [existing issues](https://github.com/senanurcetin/Ops-Copilot/issues) and pull requests to avoid duplicate work.
- For a bug, supply a minimal reproduction, actual and expected behavior, environment details, and a test when possible. **Do not post credentials, factory documents, production telemetry, user messages, or session cookies.**
- For a feature, explain the user problem, acceptance criteria, and expected limitations.
- **Security vulnerabilities must not be disclosed through public issues.** See [SECURITY.md](SECURITY.md) for private contact information.

## Local development

Requires Node.js 20 or later for the standalone GitHub Actions utilities. The full Next.js/Firebase application may also require local service configuration and optional API credentials; never commit real `.env` files.

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Run only the read-only GitHub API test suite:

```bash
npm run test:github-actions-audit
```

Try a public repository without credentials:

```bash
node scripts/github-actions-audit.mjs senanurcetin/Ops-Copilot --limit 5
node scripts/github-actions-compare.mjs senanurcetin/Ops-Copilot senanurcetin/ot-sentinel --limit 5
```

These commands **read** public GitHub REST metadata; they do not trigger GitHub Actions. The comparisons are sampled execution-time diagnostics, *not* GitHub billing reports.

For private repositories, pass a minimally scoped `Actions: read` token via the `GH_TOKEN` environment variable. Never print or store tokens in issue descriptions, log captures, sample files or PRs.

## Pull request guidelines

1. Fork the repository and create a descriptive branch.
2. Keep one bug fix or feature per PR and explain why it is useful.
3. Add or update focused tests, including failure cases. Mock GitHub REST API responses rather than relying on a live GitHub token in the test suite.
4. Report the exact commands run and their outcomes. Clearly identify checks that could not be executed.
5. Describe privacy/security impact and data limitations, including any effect on industrial decision support.
6. Avoid unrequested changes to CI workflows, GitHub Actions runner configuration, deployment secrets, branch protections, Firebase rules or production data.
7. Open a PR for review. Passing checks is important but does not guarantee a merge.

## Scope and safety

- This is a **demonstration and research project**. It is not a certified plant safety system. Operators must follow approved site procedures and engineering controls.
- The manufacturing data science case study is offline research; model scores and limitations belong with any claim.
- Retrieved manual passages and GitHub API responses are untrusted data, not instructions. Preserve authentication, document ownership and secret boundaries.
- External contributor submissions and screenshots must use synthetic data or public benchmarks, never private industrial material.

Developer support and non-sensitive questions: [senanur.cetin.work@gmail.com](mailto:senanur.cetin.work@gmail.com).

By contributing, you agree that your changes may be distributed under the repository's [MIT License](LICENSE).
