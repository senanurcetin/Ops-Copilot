---
description: Read-only acceptance test for Grounded Ops QA custom agent
---

# Grounded Ops QA — manual acceptance

Manually select Grounded Ops QA in a GitHub Copilot-supported IDE. If unavailable, report NOT RUN, not a successful agent test.

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