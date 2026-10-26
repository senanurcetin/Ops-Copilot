# Independent GitHub Actions Auditor consumer

This example runs the standalone **`@senanurcetin/github-actions-auditor` npm package** from a separate, clean Node.js project. It exercises the published package **exports** (`auditRepository` and `compareRepositories`), not the application's private source files.

The package is **not published to npm yet**. Install an actual npm archive built from its GitHub source instead. These commands do not publish anything, create GitHub workflows, or require Next.js/Firebase dependencies.

## Build and pack (Node.js 20+)

From a checkout of [Ops-Copilot](https://github.com/senanurcetin/Ops-Copilot):

```sh
node scripts/build-github-auditor-package.mjs
npm pack ./dist/github-actions-auditor --pack-destination ./dist --ignore-scripts
```

The resulting archive is `dist/senanurcetin-github-actions-auditor-0.1.0.tgz`. Its six files are `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE` and two executable `bin/*.mjs` files; it has no runtime dependencies.

## Install into an unrelated consumer project

Run these commands in the **parent directory** of the checkout, assuming its directory name is `Ops-Copilot`.

**macOS/Linux shell:**

```sh
mkdir -p auditor-consumer-demo
cd auditor-consumer-demo
npm init -y
npm install ../Ops-Copilot/dist/senanurcetin-github-actions-auditor-0.1.0.tgz --offline --ignore-scripts --no-audit --no-fund
cp ../Ops-Copilot/examples/github-actions-auditor-consumer/consumer.mjs ./consumer.mjs
node consumer.mjs senanurcetin/Ops-Copilot senanurcetin/senanurcetin
```

**Windows PowerShell:**

```powershell
New-Item -ItemType Directory auditor-consumer-demo
Set-Location auditor-consumer-demo
npm init -y
npm install ../Ops-Copilot/dist/senanurcetin-github-actions-auditor-0.1.0.tgz --offline --ignore-scripts --no-audit --no-fund
Copy-Item ../Ops-Copilot/examples/github-actions-auditor-consumer/consumer.mjs ./consumer.mjs
node consumer.mjs senanurcetin/Ops-Copilot senanurcetin/senanurcetin
```

Run the example from the consumer directory. It imports **both** package entrypoints, inspects two recent workflow runs in the first repository, and compares up to one recent run in each supplied repository. Both names may be replaced with any two *distinct public repositories* that have accessible Actions data.

To use the installed CLI commands directly instead, run:

```sh
node ./node_modules/@senanurcetin/github-actions-auditor/bin/github-actions-audit.mjs senanurcetin/Ops-Copilot --limit 2 --json
node ./node_modules/@senanurcetin/github-actions-auditor/bin/github-actions-compare.mjs senanurcetin/Ops-Copilot senanurcetin/senanurcetin --limit 1 --json
```

Node.js itself runs the package bins above; this avoids platform-specific `npm.cmd` versus `npm` shim behavior.

## Live-data behavior and limitations

- The package makes **read-only GET** requests to the public GitHub REST API. Installing the archive uses `--offline`; **running** the example requires network access to GitHub.
- Public repositories do not require credentials. Optional `GH_TOKEN` or `GITHUB_TOKEN` can grant `Actions: read` access to selected private repositories; **never commit a token or paste it into a bug report**.
- Anonymous API rate limits, disabled Actions, zero workflow runs or network restrictions may prevent useful results. A nonzero exit code is a failure; the script does not invent missing counts.
- Every run reports its own *sample*; sample totals change as Actions run history changes. **Elapsed job-minutes are not billed minutes, dollar costs, or normalized cross-repository rankings.**
- No independent external installs, registry downloads, adoption, release or upstream approvals are claimed merely because this example works locally.

## Local verification snapshot

On a Windows host running Node.js 24.13.0, a package assembled from the repo's main commit `a0e93c0` was installed from an **actual six-file npm tarball** into a fresh consumer without registry access. The installed CLI `audit` on `senanurcetin/Ops-Copilot` observed **2 sampled runs / 4 completed jobs / 5.1 elapsed job-minutes**; comparison with `senanurcetin/senanurcetin` returned **two valid repository records**. These values are dated evidence, not fixed expectations. This example script is separately validated on its own source commit before it is merged.
