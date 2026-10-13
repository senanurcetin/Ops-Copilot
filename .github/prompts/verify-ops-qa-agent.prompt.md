---
description: Read-only acceptance test for Grounded Ops QA custom agent
---

# Grounded Ops QA — manual acceptance

Agent invocation: use a supported IDE agent selector **or** GitHub Copilot CLI with `--agent=grounded-ops-qa`. CLI agent selection is valid; do not mark this test NOT RUN merely because no IDE selector was used. The wrapper must record the requested agent ID and CLI exit status independently. If the actual loaded profile cannot be independently confirmed, report agent identity UNVERIFIED separately from the source-review checks. Do not infer successful runtime tests from a read-only answer.

Read:
- src/services/document-ranking.ts
- src/services/vector-store.ts
- src/server/sample-knowledge-base.ts
- tests/sample-knowledge-base.test.ts
- src/app/actions.ts

Perform an offline source review:

1. Explain how retrieval relevance differs from authoritative operator safety instructions.
2. Trace authenticated user ownership of Firestore knowledge document paths.
3. Explain why replacement decisions are planned within a transaction and what remains unverified without a Firestore emulator.
4. Explain how the assistant should respond when no relevant source procedure is available.

Cite sources, distinguish structural/synthetic tests from live Firebase or Gemini verification, and report PASS/FAIL/UNVERIFIED for all checks. No editing, API calls, CI/Actions/CircleCI/Vercel, secrets or plant actions.