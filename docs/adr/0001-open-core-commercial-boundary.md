# ADR-0001 — Public open-source core and commercialization boundary

**Decision status:** accepted planning direction on 3 November 2026. Any actual commercial launch, license transition or deployment still requires separate owner approval.

## Context

Ops-Copilot is a public open-source engineering portfolio and could also underpin a separately operated commercial service. A private repository is neither necessary nor sufficient for secure production operation. The existing public repository has an MIT license: rights already granted under a published license are not automatically revoked by a later visibility change.

## Decision

1. Keep the current public, MIT-licensed open-source core publicly reviewable by default.
2. Keep credentials, tokens, customer/factory documents, confidential algorithms and private telemetry outside Git history **even in private repositories**.
3. If customer contracts, confidentiality or proprietary integrations require it, design a **separate private boundary** only after explicit review. This ADR creates no private repository.
4. Independently enforce secure runtime access, Firebase/IAM permissions, per-user access, secrets, data protection and rate/cost limits. A public codebase does not mean a public production database or operator console.
5. Never silently upgrade a paid tier, launch a service, register billing, expose a webhook, change repository visibility, or modify the MIT license. Obtain owner approval for each substantive change.
6. Open-source code and commercial support/hosting may coexist; commercialization does **not** automatically require closing the core.

## Review and notification triggers

Notify the owner with evidence **before** any of these events:

- Paying customer, paid proof of concept, professional/consulting deployment or intended financial gain.
- Customer confidential data, protected personal information, proprietary industrial procedures, or restrictive distribution agreement.
- Chargeable platform feature, resource quota pressure, sustained hosting/storage/traffic cost or explicit SLA/on-call/support commitment.
- Dependency or data license that restricts commercial redistribution, plus any exclusivity, IP ownership or trademark contract.
- Production readiness sign-off, release policy or storage-retention decision requiring a legal/financial judgment.

**Platform-specific trigger:** The official [Vercel Terms of Service](https://vercel.com/legal/terms) and [fair-use guidance](https://vercel.com/docs/limits/fair-use-guidelines) limit Hobby usage to personal/noncommercial use. If the user plans a commercial hosted service, verify the actual account plan and secure owner approval for a compliant plan or alternate provider **before commercial usage**. The Vercel billing plan was **not** independently confirmed during this audit.

## Non-goals

This decision document is not a commercial business plan, an IP transfer, a new private repository, legal advice, a live Firebase migration, a paid service enrollment or a production release. It changes no external service or project settings.
