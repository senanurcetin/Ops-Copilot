# GitHub Actions Auditor: offline artifact checksum evidence

**Status: candidate integrity only — NOT published, NOT approved for production.**

This procedure applies to the versioned standalone package at
[`tools/github-actions-auditor/package.json`](../tools/github-actions-auditor/package.json).
Its existing [CHANGELOG](../tools/github-actions-auditor/CHANGELOG.md) and
[packlist/offline-install tests](../tests/github-actions-package.test.mjs) remain mandatory.
A SHA-256 digest checks *exact bytes*; it does not certify an authentic builder,
a reproducible archive, package safety, dependency provenance, a registry upload or live deployment.

## Offline operator procedure (no upload, release or deploy)

From the repository root, on the reviewed exact commit:

```bash
npm ci
npm test
npm run auditor:package
npm run auditor:pack:dry-run
mkdir -p dist/release-evidence
npm pack --offline --ignore-scripts ./dist/github-actions-auditor --pack-destination ./dist/release-evidence
node scripts/github-auditor-artifact-checksum.mjs create
node scripts/github-auditor-artifact-checksum.mjs verify
```

For version `0.1.0`, the only permitted candidate filename is
`dist/release-evidence/senanurcetin-github-actions-auditor-0.1.0.tgz`.
The checker derives the version from the checked-in standalone package manifest,
reads the **actual** local `.tgz` bytes, and writes a single
`dist/release-evidence/SHA256SUMS` record with exclusive-create semantics.
Repeat `create` never overwrites evidence. `verify` fails closed on a changed
archive, wrong filename, wrong checksum, duplicate lines, empty/oversized input,
or symbolic-link artifact/manifest. It never takes a caller-supplied CLI path.

The entire `dist/` directory is ignored by Git. Do not commit customer data,
credentials, local build intermediates or an unreviewed binary archive. Record
the exact source commit, artifact SHA-256, size, package version, builder
runtime, packlist, tested commit/run IDs, owner and independent reviewer in a
separate [release evidence record](RELEASE_EVIDENCE_TEMPLATE.md).
An approved reviewer should recompute the digest independently on the same
candidate artifact. An archive regenerated with changed bytes needs a new
review and evidence record rather than silently overwriting an old manifest.

## Scope boundary

- No npm publication, GitHub release, git tag or deployment is performed.
- Verification alone does not validate tar archive format or package contents;
  the distinct offline packaging and `npm pack` tests check those properties.
- `checksumManifestVerified=true` only means the supplied local candidate
  matches its local checksum record. It does not authenticate the artifact's
  supplier or imply multi-machine reproducibility.
- `packagePublished`, `provenanceIndependentlyVerified` and
  `productionReleaseAuthorized` remain `false`.
- The separate [senior readiness issue #109](https://github.com/senanurcetin/Ops-Copilot/issues/109)
  remains open until independent test/recovery, security and owner gates close.
