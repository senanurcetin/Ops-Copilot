---
description: Read-only acceptance test for Auth Boundary Bugfix custom agent
---

# Auth Boundary Bugfix — manual acceptance

Agent invocation: use a supported IDE agent selector **or** GitHub Copilot CLI with `--agent=auth-boundary-bugfix`. CLI agent selection is valid; do not mark this test NOT RUN merely because no IDE selector was used. The wrapper must record the requested agent ID and CLI exit status independently. If the actual loaded profile cannot be independently confirmed, report agent identity UNVERIFIED separately from the source-review checks. Do not infer successful runtime tests from a read-only answer.

Read:
- src/server/auth-session.ts
- src/server/session-core.ts
- src/app/actions.ts
- src/server/checklist-progress.ts
- tests/checklist-progress.test.ts

Answer using source evidence:

1. Where is session identity established? Can a client payload control the owner of checklist or knowledge records?
2. Which expired/missing/invalid session cases fail closed, and how do the existing tests support the conclusion?
3. How are checklist document IDs, titles and steps bounded/normalized before Firestore persistence?
4. Propose one synthetic cross-user isolation test; explain why it cannot prove live Firebase rules.

Report PASS/FAIL/UNVERIFIED with file citations, and explicitly mark runtime Firestore authorization UNVERIFIED. Do not edit, run shell or CI, contact Firebase/Gemini, install packages or expose credentials.