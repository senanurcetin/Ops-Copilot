# GitHub webhook outbox: retention decision record

Status: **PROPOSED — owner approval pending**  
Scope: \`githubWebhookOutbox/{deliveryId}\` in Ops-Copilot  
Reference: Issue #95, PRs #96–#101.

## Implemented baseline

- Delivery GUID is the Firestore document ID. The transaction tests existence before creating a new queued work item.
- Completed GUID records may be manually compacted **in place** after at least seven days with a separately authorized operator. No document deletion occurs.
- Dead-letter records are never auto-deleted and manual replay is constrained by current transaction/state rules.
- No automatic Firestore TTL field or deletion policy is configured. No running worker or public webhook exists.
- A new bounded, pure inventory helper gives state counts and sampled JSON-byte estimates, not live Firestore billing or a collection census.

## Proposed safe policy — requires owner approval

1. **Default hold:** never delete a known delivery GUID, whether queued, processing, completed, or dead. Preserve replay deduplication without a finite expiration horizon.
2. **Compaction:** allow only explicit owner-approved in-place compaction of old completed work; keep the original GUID and completed state as a permanent deduplication anchor.
3. **Operational review:** collect an authorized bounded snapshot *without exporting credentials or payloads*, determine total document count, growth per day, retained dead-letter volume, actual Firestore billed usage and free-tier headroom from authoritative project billing/usage controls. Do not extrapolate a partial sample as a census.
4. **Escalation:** if size, quota, or legitimate compliance requirements necessitate deletion, design and test a distinct, persistent GUID tombstone index **before** deleting any original record. Prove atomic cutover and replay safety across restarts and concurrent deliveries; review legal/privacy requirements.
5. **TTL / automated deletion:** disabled unless the owner separately approves the full deduplication migration and production release plan. Never treat absence of a deletion feature as proof of zero storage cost.

## Owner decision gates (not yet signed)

- [ ] Actual daily delivery rate and total retained GUID count reviewed
- [ ] Actual Firebase billed storage/index/write/read usage and quota reviewed
- [ ] Target retention horizon and privacy/compliance obligations established
- [ ] Maximum acceptable storage growth and intervention threshold agreed
- [ ] If finite TTL is requested, independent tombstone persistence and race tests approved
- [ ] Authenticated operator/owner approval workflow implemented for manual compaction
- [ ] Explicit production enablement authorized separately

**Current decision:** keep TTL disabled and existing GUID anchors intact. This document is a proposal, not proof of an owner sign-off or an applied cloud setting.


## Free-tier and TTL release boundary (documented 3 November 2026)

Firebase's [Firestore billing documentation](https://firebase.google.com/docs/firestore/pricing)
specifies that TTL delete operations require billing and do not qualify
for free usage. [Google Cloud's TTL documentation](https://docs.cloud.google.com/firestore/native/docs/ttl)
also specifies asynchronous, nontransactional expiry.

- [ ] **Explicit owner consent for a paid Firestore feature** (not granted)
- [ ] **Separate implementation preserving signed-webhook deduplication** after document expiry (not implemented)
- [ ] **Observed project usage, limits, index overhead and costs reviewed** (not measured)
- [ ] **Formal production release approval** (not granted)

Until all these controls are separately satisfied, enabling TTL or
hard-deleting GUID documents is prohibited. The local report CLI can
prepare aggregate, sample-only evidence but **cannot** sign off a
retention policy, read actual billable storage or authorize production
settings.
