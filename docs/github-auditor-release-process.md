# GitHub Actions Auditor release process

**Candidate:** `@senanurcetin/github-actions-auditor` version **0.1.0**  
**Status:** ready for reproducible packaging and manual release review; **not published**.  
**Developer support:** senanur.cetin.work@gmail.com

## Before any release

1. Start from a reviewed main branch and check that lint, typecheck, Node tests and the Next.js build all pass.
2. Inspect the independent package manifest at [tools/github-actions-auditor/package.json](../tools/github-actions-auditor/package.json), the [changelog](../tools/github-actions-auditor/CHANGELOG.md) and [package README](../tools/github-actions-auditor/README.md).
3. From the repository root, run:

```bash
npm ci
npm test
npm run auditor:package
npm run auditor:pack:dry-run
```

4. The CI package test now invokes `npm pack --dry-run --json` and asserts the exact npm packlist, not just the staging directory. The builder rejects arbitrary output paths and will not erase an existing custom temporary directory. Inspect this test before release.
5. Confirm the tarball contains **only** `package.json`, `README.md`, `LICENSE`, `CHANGELOG.md` and the two CLI executables. Ensure no `.env` files, API tokens, PEM keys, node_modules, Firebase config, industrial documents or private data appear.
6. Test both entrypoints offline:

```bash
node dist/github-actions-auditor/bin/github-actions-audit.mjs --help
node dist/github-actions-auditor/bin/github-actions-compare.mjs --help
```

7. Verify the intended npm package name is available, that the publisher controls the `@senanurcetin` scope and that registry account security controls are configured. **Do not assume ownership or availability.**
8. Only after account-owner review, create an appropriate git tag, GitHub release and public npm publication from the clean, verified package folder. Record final published URLs and checksums in this document in a separate PR.

## Versioning rules

- `MAJOR`: breaking CLI or JSON output changes.
- `MINOR`: backward-compatible features.
- `PATCH`: backward-compatible fixes and minor hardening.
- Update `tools/github-actions-auditor/package.json` and its changelog together. Never claim a package is published until the registry confirms its existence.
- Keep source-of-truth CLI modules under `scripts/`; release packaging copies them rather than duplicating maintenance.

## Security and release boundaries

- No GitHub Actions workflow or CI settings need modification to prepare or use this package.
- All audit commands call GitHub GET endpoints only; the optional local GitHub App authentication module is **not bundled** in this package.
- GitHub App private keys and installation tokens must not be bundled or recorded.
- Not a GitHub billing product, registered GitHub App, Marketplace listing or verified Developer Program membership.

This document is a release checklist, not an assertion that an npm registry upload or GitHub release already occurred.
