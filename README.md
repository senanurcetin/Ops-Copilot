# Ops-Copilot — Document-Grounded Industrial AI Assistant

[![Ops-Copilot CI](https://github.com/senanurcetin/Ops-Copilot/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/senanurcetin/Ops-Copilot/actions/workflows/ci.yml)

<p align="right"><img src="docs/assets/nexus-official-midnight.svg" alt="NEXUS Official Midnight brand" width="220"></p>

Ops-Copilot is an industrial AI assistant for factory operators who need fast, document-grounded troubleshooting support on the production floor. It now also includes a public industrial data science case study built on the UCI SECOM manufacturing dataset, so the repository demonstrates both product engineering and applied ML reasoning.

## At a glance

**Next.js · Firebase · Genkit/Gemini · Document retrieval · Operator checklists · SECOM ML case study**

This repository has two **separate** lines of work:

| Line of work | What it is | Start here |
| --- | --- | --- |
| Industrial troubleshooting/RAG + SECOM research | Next.js/Firebase operator assistant with document-grounded answers and checklists, plus an offline SECOM failure-risk case study | [Case study](docs/case-study.md) · [Local setup](#local-setup) |
| Read-only GitHub Actions REST auditor | Standalone Node CLI that reads workflow runs and job timings and suggests optimization candidates without making changes | [Integration guide](docs/github-actions-integration.md) · [Public API demo evidence](docs/github-api-live-demo.md) |

**What it is not:** a certified industrial safety product, a deployed live model service, or a polished public SaaS deployment. See [Limitations](#limitations).

## Key results / what you can try

- **SECOM failure-risk model (chronological 80/20 holdout):** ROC-AUC `0.7659` and PR-AUC `0.1745` vs a naive baseline of `0.500` / `0.0541`; reviewing the top 10% captures `29.4%` of failures (`2.89x` lift vs random review). Details in [Evaluation snapshot](#evaluation-snapshot).
- **Ask operator questions** with document-grounded answers, the most relevant manual section highlighted, and procedural answers converted into interactive checklists ([What it does](#what-it-does)).
- **Audit GitHub Actions usage read-only** for any public repository, or compare two repositories side by side ([GitHub Actions REST API integration](#github-actions-rest-api-integration)).
- **Explore workflow runs interactively** at `/developer-tools/github-actions` when the app runs locally ([Public interactive GitHub Actions Explorer](#public-interactive-github-actions-explorer)).
- **Rebuild the SECOM artifacts** with `npm run case-study:refresh` ([Quality checks](#quality-checks)).

## Demo

Portfolio case study: [senanur-cetin.vercel.app/projects/ops-copilot](https://senanur-cetin.vercel.app/projects/ops-copilot)

![NEXUS Ops-Copilot public sign-in screen (real local Chromium, 1440 × 960)](docs/assets/nexus-login-desktop.png)

<sub>Actual local browser capture of the **public sign-in** page, not an authenticated operator session. Dashboard access remains protected by Firebase.</sub>

<details><summary>Mobile public sign-in · 390 × 844</summary>

<img src="docs/assets/nexus-login-mobile.png" alt="NEXUS Ops-Copilot public login on a mobile Chromium viewport" width="390">

</details>

In-app case study route: `/case-study` after running the app locally

Earlier, pre-NEXUS case-study walkthrough (archival): [`docs/assets/ops-copilot-case-study.webm`](docs/assets/ops-copilot-case-study.webm)

![NEXUS Ops-Copilot SECOM public case study (real local Chromium, 1440 × 960)](docs/assets/nexus-secom-case-study-desktop.png)

<details><summary>Mobile SECOM case study · 390 × 844</summary>

<img src="docs/assets/nexus-secom-case-study-mobile.png" alt="NEXUS Ops-Copilot SECOM case-study landing section on mobile Chromium" width="390">

</details>

GitHub case-study brief: [`docs/case-study.md`](docs/case-study.md)

Engineering evidence: [`docs/case-study.md`](docs/case-study.md)

## Quick start

**App** (Node.js 20+, a Firebase project with Authentication and Firestore, a Google AI Studio API key — full steps in [Local setup](#local-setup)):

```bash
npm install
cp .env.example .env   # add Firebase web config and Gemini API key
npm run dev            # http://localhost:9002
```

**GitHub Actions auditor CLI** (read-only; optional `GH_TOKEN` only for private repositories):

```bash
node scripts/github-actions-audit.mjs senanurcetin/Ops-Copilot --limit 20
node --test tests/github-actions-audit.test.mjs
```


## Limitations

- **Not safety guidance.** Document-grounded answers and checklists support operator review; they are not validated operating procedures, certified industrial safety guidance or a substitute for plant safety policies.
- **Lexical retrieval.** The knowledge layer ranks documents lexically, not with embeddings.
- **Offline SECOM model.** The SECOM work is an offline benchmarking case study, not a deployed model service or live equipment monitoring.
- **Not a hosted product.** The repository is documentation-first and is not a polished public SaaS deployment. Passing CI is not production certification; see the [engineering readiness audit and phased action plan](docs/ENGINEERING_READINESS_AUDIT_2026-11-03.md).
- **Actions Explorer is local only.** The `/developer-tools/github-actions` route is implemented but has not been deployed or checked at a public URL.
- **Elapsed, not billed, minutes.** Auditor and comparison reports show observed elapsed job-minutes on a sample of runs, not billed Actions minutes or normalized engineering performance.
- **Auditor package and GitHub App are not published.** The CLI package is a release candidate with no npm or GitHub release; no GitHub App is created or installed automatically, and registration and private-key provisioning are up to the account owner. None of this implies a GitHub partnership or Developer Program membership.
- **Tag Map is display only.** The viewer and parser do not import or store data, synchronize products, connect telemetry or send PLC/DCS commands, and the displayed metadata is not an engineering sign-off.
- **Emulator isolation scope.** The Firestore emulator job does not prove session-cookie browser authentication, Admin SDK behavior in a real deployment, or production tenant isolation.

## Why this project exists

Industrial troubleshooting often breaks down when operators must search scattered PDFs, tribal knowledge, or maintenance notes under time pressure. Ops-Copilot centralizes that knowledge into an assistant with context, auditability, and repeatable workflows.

## What it does

- Document-grounded answers via retrieval-augmented generation over a per-user Firestore-backed knowledge base, with the most relevant manual section highlighted.
- Procedural answers become interactive checklists whose progress logs are stored for later review.
- Firebase authentication, secure server sessions, and persistent operator chat history.
- A reproducible manufacturing failure-risk case study with Python analysis, model artifacts, and SQL monitoring queries.

## Architecture snapshot

- **Frontend:** Next.js App Router, React 19, Tailwind CSS, ShadCN UI · **AI runtime:** Genkit with Google Gemini 2.5 Flash
- **Knowledge layer:** per-user Firestore-backed manual store with lexical relevance ranking
- **Auth / data:** Firebase Authentication with secure server-side session cookies; Firestore chat history and checklist progress logs
- **Case-study layer:** Python, pandas, scikit-learn, generated JSON artifacts · **Deployment target:** Firebase App Hosting

## Evaluation snapshot

SECOM (UCI Machine Learning Repository), chronological 80/20 holdout:

| Model | ROC-AUC | PR-AUC |
| --- | --- | --- |
| Naive baseline | `0.500` | `0.0541` |
| **Class-weighted logistic regression (published)** | **`0.7659`** | **`0.1745`** |
| Random forest benchmark | `0.5195` | `0.0688` |

Reviewing the top 10% captures `29.4%` of failures, a `2.89x` failure-yield lift over random review. Logistic regression is published because it clearly beats the naive floor and is more interpretable than the weaker tree-based alternative on the same holdout. Methodology: [`docs/case-study.md`](docs/case-study.md).

## GitHub Actions REST API integration

A standalone, **read-only** CLI that retrieves workflow runs and job timings, ranks time-consuming workflows and suggests optimization candidates without making changes or using runner minutes. Private repositories need an optional read-only `GH_TOKEN`.

```bash
node scripts/github-actions-audit.mjs senanurcetin/Ops-Copilot --csv --output-file audit.csv
node scripts/github-actions-compare.mjs senanurcetin/Ops-Copilot senanurcetin/ot-sentinel --since 2026-10-01 --limit 10 --markdown
```

- **Filters:** inclusive UTC window (`--since` / `--until`, validated before any API request), `--branch`, and `--event schedule` / `--status failure`, which use GitHub's REST query parameters to filter **before** sampling. All combine, including for multi-repository comparisons.
- **Output:** `--json`, `--markdown` or `--csv` to stdout, or `--output-file PATH` with exactly one of those formats. Files get owner-only permissions where supported, existing files are never overwritten (`EEXIST`), and the output directory must already exist.
- **Accuracy:** workflows are keyed by stable workflow IDs even when several files share a display name; when the API returns `total_count`, reports separate all **matching runs** from the **inspected sample**.
- **Resilience:** bounded retries for transient errors and throttling, and a 30-second process-local cache for **anonymous public GET responses only**; authenticated responses are never cached.
- **Package:** `npm run auditor:package` assembles a dependency-free npm-style CLI (read-only API modules, README, MIT license) into an ignored staging directory; `npm run auditor:pack:dry-run` and `node --test tests/github-actions-package.test.mjs` verify it. See the [package README](tools/github-actions-auditor/README.md), [0.1.0 changelog](tools/github-actions-auditor/CHANGELOG.md) and [release checklist](docs/github-auditor-release-process.md).
- **GitHub App auth (optional):** the [GitHub App scaffold](docs/github-app-integration.md) signs an RS256 JWT from a private key kept outside the repository and exchanges it for an installation token limited to one repository with `Actions: read`.

Docs: [integration guide, privacy limits and support](docs/github-actions-integration.md) · [reproducible public API demo](docs/github-api-live-demo.md) · [two-repository comparison example](docs/github-actions-repository-comparison-example.md).

### Public interactive GitHub Actions Explorer

With the app running, `/developer-tools/github-actions` reads up to 10 recent runs for a public `owner/repo` through a bounded, cached server-side endpoint and shows linked workflow records, success/failure counts and sampling limits. It needs no token, GitHub App, paid runner or login.

## NEXUS Tag Map

The **NEXUS Tag Map** sidebar link (`/developer-tools/nexus-tag-map`) opens a reviewed JSON export from Vision2DCS (Tag Map v1). The browser validates the file (max 1 MiB) and shows up to 100 matching tag rows with local filtering. The file never leaves the browser (no Firestore, Genkit, server actions or local storage), and clearing it discards the view. The parser validates untrusted JSON (`src/lib/nexus-tag-map.ts`, `tests/nexus-tag-map.test.ts`); CI runs size-boundary and no-network regression tests.

## Local setup

Prerequisites: Node.js 20+, npm, a Firebase project with Authentication and Firestore, and a Google AI Studio API key. After the [Quick start](#quick-start) install, fill `.env` with the Firebase web config and Gemini API key; for verified server actions also provide Firebase Admin credentials via `GOOGLE_APPLICATION_CREDENTIALS` or the `FIREBASE_*` server variables in `.env.example`. `npm run dev` serves `http://localhost:9002`.

### Quality checks

```bash
npm run lint && npm run typecheck && npm run test
npm run case-study:refresh   # rebuild SECOM artifacts (Python)
```

### Firebase two-account isolation (localhost emulators)

- **Rules contract (CI):** `tests/firestore-rules-contract.test.ts` checks that `firestore.rules` scopes user profiles/messages to `request.auth.uid` and grants no browser access to Admin-only `knowledgeDocuments` or `checklistLogs`.
- **Emulator integration:** `tests/firestore-isolation.emulator.test.ts` creates two anonymous test users (Alice/Bob), proves own-profile/own-message access, rejects cross-user reads and writes, and confirms Admin-only subcollections are denied. A separate `firestore-isolation` GitHub Actions job runs it.

```bash
npx firebase-tools emulators:exec --only auth,firestore --project demo-nexus-ops-isolation "npm run test:firestore:emulator"
```

`firebase.json` pins Auth to `127.0.0.1:9099` and Firestore to `127.0.0.1:8080` (Emulator UI off). The test refuses to run unless both emulator host variables match and rejects non-`demo-` project IDs, so pass the `demo-` project even if `.firebaserc` points to a real one. No service account, billed resource or real user data is involved. Do not use `firebase deploy` in place of emulator validation.

## Repository highlights

- `public/knowledge_base.json` — sample knowledge corpus
- `src/ai/flows/*` — retrieval and answer-generation workflows
- `src/server/*` — verified session and Firebase Admin helpers
- `src/firebase/*` — client auth and Firestore wiring
- `analysis/run_secom_case_study.py` — rebuilds the SECOM artifacts; `src/data/secom-case-study/*` powers the case-study page
- `sql/*` — review-queue, monitoring, and impact queries for a warehouse implementation
- `docs/blueprint.md` — product blueprint; [`docs/adr/0001-open-core-commercial-boundary.md`](docs/adr/0001-open-core-commercial-boundary.md) — open-core and commercialization decision

## Contributing, security and license

Contributions to the GitHub API tooling, documentation, accessibility and offline tests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). Report non-sensitive bugs through the GitHub issue forms and vulnerabilities privately via [SECURITY.md](SECURITY.md). Developer support: [senanur.cetin.work@gmail.com](mailto:senanur.cetin.work@gmail.com). License: MIT.
