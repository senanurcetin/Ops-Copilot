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


## Experimental dual-anchor design review (not deployed)

The opt-in `createDualAnchorWebhookOutbox` module is a candidate
transactional design: insert a permanent minimal GUID record in
`githubWebhookDedupAnchors` and the outbox work document in the same
Firestore transaction. The existing adapter is **not changed or
reconfigured**. The local emulator suite proves concurrency behavior,
client access denial and duplicate rejection after a **synthetic test**
outbox deletion.

- [ ] Owner approves the additional long-lived collection and its cost
- [ ] Existing single-collection GUIDs are fully migrated and reconciled
- [ ] All active ingestion paths transition atomically without a race window
- [ ] Billed write/read/index/storage overhead is measured with actual project data
- [ ] Policy and legal retention horizon are decided and approved
- [ ] No paid TTL/deletion is enabled without separate explicit authorization

Keeping both the original records and any candidate anchors indefinitely
is safer for replay protection than deleting history, but it is not a
storage-cost optimization. This review is informational; no migration
tool, live caller or Firebase configuration change is enabled.


## Rehearsal-specific blockers before any historical migration

A new opt-in primitive, `createWebhookLegacyAnchorBackfill`, can
create one minimal permanent anchor for a verified legacy outbox GUID,
with a mandatory authorization callback. The demo Firestore emulator
validates concurrent calls and unchanged source records.

- [ ] Enumerate and reconcile **all** historical GUIDs with authorized,
      independently reviewed completeness evidence; no enumeration tool is
      enabled or run by this prototype
- [ ] Resolve **uppercase/mixed-case historical GUIDs**; the current
      legacy adapter accepts them but the new dual adapter/backfill
      prototype intentionally rejects them
- [ ] Switch and retire every single-collection writer using a
      separately tested no-race cutover; the emulator explicitly proves
      the old writer can recreate a work record after synthetic deletion,
      despite a permanent anchor
- [ ] Verify cost/quota impact and get owner approval before any live
      backfill or changes to data retention

**Release is blocked** until every item above and the existing owner
decision gates are reviewed. In particular, an emulator success is not
a declaration of collection-wide production migration.


## Cutover snapshot preflight — no production authorization

The optional `assessWebhookCutoverSnapshot` analyzer accepts a
**caller-supplied bounded list** of source outbox document IDs, anchor
document IDs, and declared writer modes. It detects missing exact
anchors, case-fold GUID collisions, uppercase/mixed-case historical IDs,
remaining legacy writers and unknown writers. It returns only counts
and fixed risk codes, never actual GUIDs.

A fully matching **synthetic** sample may pass its local invariants,
but all reports explicitly prohibit production deletion, TTL and
adapter release. Manually asserted inventory-completeness flags are
not independently verified. There is still no authenticated service
enumeration, live project inventory or production migration.

- [ ] Independently verify exhaustive **historical** GUID coverage
- [ ] Reconcile uppercase/case-variant collisions without losing identity
- [ ] Independently inventory and retire **every** legacy writer
- [ ] Establish a provable pause/drain/cutover barrier for in-flight
      historical transactions
- [ ] Review real Firestore usage/quota and obtain explicit owner approval

The emulator test demonstrates why this matters: the old adapter can
create two independent Firestore documents for GUID strings that
differ only by letter case. This release blocker remains in force.
