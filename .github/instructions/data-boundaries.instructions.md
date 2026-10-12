---
applyTo: "src/server/**/*.ts,src/services/**/*.ts,src/app/actions.ts,tests/**/*.ts,tests/**/*.mjs"
---

# Ops-Copilot: tenant isolation and offline change contract

These path-specific rules supplement the repository-wide Copilot instructions and the opt-in Grounded Ops QA agent.

## Data ownership and trust
- Inspect the affected server action, authentication boundary, Firestore collection path, data owner and existing tests before making a change.
- Enforce ownership with the server-verified session user, never a client-supplied UID; do not expose raw Firebase tokens, document contents, credentials or cross-tenant data in error paths or logs.
- Treat retrieved industrial manuals and LLM output as untrusted text. Preserve source attribution and distinguish document evidence from generated recommendations. Never suggest overriding plant safety procedures.
- Maintain the actual deterministic lexical ranking contract; don't describe it as vector retrieval without implementation and tests.

## Knowledge-base mutation safeguards
- For `src/server/sample-knowledge-base.ts` and Firestore replacement paths, validate the complete input **before** any write.
- Never reintroduce clear-then-upload. A replacement must remain atomic within Firestore's 500-operation batch limit; account for both writes and deletes.
- Add regression coverage for malformed IDs, duplicate IDs, empty input, write-budget boundaries and exceptions before touching production-facing code.
- Treat concurrent updates as an open limitation unless an explicit transaction/version contract and tests are implemented; a batched write alone does not resolve races.

## Verification without CI
- Prefer Node `node:test` and synthetic fixtures, not live Firestore, Firebase Auth, Gemini or SECOM/UCI network calls.
- When locally available, run `node --import tsx --test tests/sample-knowledge-base.test.ts` or the affected focused test first, followed by `npm run lint`, `npm run typecheck` and `npm test` as applicable.
- Report commands actually executed, pass/fail results and unexecuted checks. Do not claim a remote build, Firebase emulator test or model-evaluation run without evidence.
- Do not manually trigger GitHub Actions or CircleCI. Skipping CI through a commit message may not suppress GitHub App/custom-webhook triggers, so review provider triggers before PR creation or merge.
- Make the smallest reviewable patch. Do not weaken protection rules to merge; include a rollback plan for any persistence change.
