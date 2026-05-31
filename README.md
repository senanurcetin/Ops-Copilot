# Ops-Copilot

Ops-Copilot is an industrial AI assistant for factory operators who need fast, document-grounded troubleshooting support on the production floor. It now also includes a public industrial data science case study built on the UCI SECOM manufacturing dataset, so the repository demonstrates both product engineering and applied ML reasoning.

![Ops-Copilot interface](https://github.com/user-attachments/assets/63e76a52-267f-4f3e-abd9-5d6bf35e6cf3)

Demo: [YouTube walkthrough](https://www.youtube.com/watch?v=G9jLMHL1fvg)

Public case study: `/case-study`

GitHub case-study brief: [`docs/case-study.md`](docs/case-study.md)

Hiring summary: [`docs/hiring-summary.md`](docs/hiring-summary.md)

Portfolio role: `flagship case study`

## Why this project exists

Industrial troubleshooting often breaks down when operators must search scattered PDFs, tribal knowledge, or maintenance notes under time pressure. Ops-Copilot demonstrates a lightweight way to centralize that knowledge and turn it into a practical assistant with context, auditability, and repeatable workflows.

## What it does

- Answers operator questions with document-grounded responses.
- Uses retrieval-augmented generation over a per-user Firestore-backed knowledge base.
- Supports Firebase authentication, secure server sessions, and persistent operator chat history.
- Highlights the most relevant manual section behind each answer.
- Converts procedural answers into interactive checklists and stores progress logs for later review.
- Includes a reproducible manufacturing failure-risk case study with Python analysis, model artifacts, and SQL monitoring queries.

## Architecture snapshot

- **Frontend:** Next.js App Router, React 19, Tailwind CSS, ShadCN UI
- **AI runtime:** Genkit with Google Gemini 2.5 Flash
- **Knowledge layer:** Per-user Firestore-backed manual store with lexical relevance ranking
- **Auth layer:** Firebase Authentication with secure server-side session cookies
- **Data layer:** Firestore chat history and checklist progress logs
- **Case-study layer:** Python, pandas, scikit-learn, and generated JSON artifacts for the SECOM portfolio analysis
- **Deployment target:** Firebase App Hosting

## Evaluation snapshot

- **Dataset:** SECOM from the UCI Machine Learning Repository
- **Split:** chronological 80/20 holdout
- **ROC-AUC:** `0.7659`
- **PR-AUC:** `0.1745`
- **Top 10% review budget capture:** `29.4%`
- **Failure-yield lift vs random review:** `2.89x`

## Benchmark comparison

- **Naive baseline:** ROC-AUC `0.500`, PR-AUC `0.0541`
- **Published model, class-weighted logistic regression:** ROC-AUC `0.7659`, PR-AUC `0.1745`
- **Random forest benchmark:** ROC-AUC `0.5195`, PR-AUC `0.0688`

The published model remains logistic regression because it is materially stronger than the naive floor while staying more interpretable and more defensible than the tested tree-based alternative on the same chronological holdout.

## What this proves

- You can frame an industrial workflow problem in both product and applied-ML language.
- You can evaluate an imbalanced manufacturing classification problem with decision-support metrics instead of generic accuracy claims.
- You can package that logic into usable software with persistence, security, and recruiter-readable proof surfaces.

## Local setup

### Prerequisites

- Node.js 20+
- npm
- A Firebase project with Authentication and Firestore enabled
- A Google AI Studio API key

### Install

```bash
npm install
cp .env.example .env
```

Update `.env` with your Firebase web configuration and Gemini API key.
For local verified server actions, also provide Firebase Admin credentials via
`GOOGLE_APPLICATION_CREDENTIALS` or the `FIREBASE_*` server variables shown in
`.env.example`.

### Run

```bash
npm run dev
```

The app runs on `http://localhost:9002`.

### Quality checks

```bash
npm run lint
npm run typecheck
npm run test
npm run case-study:refresh
```

## Repository highlights

- `public/knowledge_base.json` contains the sample knowledge corpus.
- `src/ai/flows/*` contains the retrieval and answer-generation workflows.
- `src/server/*` contains verified session and Firebase Admin helpers.
- `src/firebase/*` contains client authentication and Firestore wiring.
- `docs/blueprint.md` captures the product blueprint and implementation intent.
- `analysis/run_secom_case_study.py` rebuilds the industrial data science artifacts.
- `docs/case-study.md` and `docs/hiring-summary.md` provide recruiter-facing portfolio summaries.
- `src/data/secom-case-study/*` powers the public case-study page.
- `sql/*` shows review-queue, monitoring, and impact queries for a warehouse implementation.

## Limitations

- The retrieval layer is currently lexical rather than embedding-based.
- The SECOM layer is an offline portfolio case study, not a deployed live model service.

## Portfolio note

This repository is documentation-first. It is intended to show product thinking for industrial AI copilots and industrial data science systems rather than act as a polished public SaaS deployment.

## License

MIT
