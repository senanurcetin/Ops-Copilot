# Ops-Copilot

Ops-Copilot is an industrial AI assistant for factory operators who need fast, document-grounded troubleshooting support on the production floor. It combines Firebase-backed user workflows with Genkit-powered retrieval to turn technical manuals into guided operator actions.

![Ops-Copilot interface](https://github.com/user-attachments/assets/63e76a52-267f-4f3e-abd9-5d6bf35e6cf3)

Demo: [YouTube walkthrough](https://www.youtube.com/watch?v=G9jLMHL1fvg)

## Why this project exists

Industrial troubleshooting often breaks down when operators must search scattered PDFs, tribal knowledge, or maintenance notes under time pressure. Ops-Copilot demonstrates a lightweight way to centralize that knowledge and turn it into a practical assistant with context, auditability, and repeatable workflows.

## What it does

- Answers operator questions with document-grounded responses.
- Uses retrieval-augmented generation to search a curated knowledge base.
- Supports Firebase authentication and persistent operator chat history.
- Highlights the most relevant manual section behind each answer.
- Converts procedural answers into interactive checklists for execution tracking.

## Architecture snapshot

- **Frontend:** Next.js App Router, React 19, Tailwind CSS, ShadCN UI
- **AI runtime:** Genkit with Google Gemini Flash models
- **Knowledge layer:** JSON knowledge base ingested into a temporary vector workflow
- **Data layer:** Firebase Authentication and Firestore
- **Deployment target:** Firebase App Hosting

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

### Run

```bash
npm run dev
```

The app runs on `http://localhost:9002`.

### Optional Genkit development UI

```bash
npm run genkit:dev
```

## Repository highlights

- `public/knowledge_base.json` contains the sample knowledge corpus.
- `src/ai/flows/*` contains the retrieval and answer-generation workflows.
- `src/firebase/*` contains client authentication and persistence wiring.
- `docs/blueprint.md` captures the product blueprint and implementation intent.

## Portfolio note

This repository is documentation-first. It is intended to show product thinking for industrial AI copilots rather than act as a polished public SaaS deployment.

## License

MIT
