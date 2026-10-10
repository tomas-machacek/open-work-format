# 0017 — Align documentation for reusable Views

> Status: in_progress
> Description: Align Core and tool design around reusable Markdown definitions and independent View instances.
> Depends on: [0016 — Board search](0016-board-search.md), as the current delivered baseline.

The user agreed the design decisions and authorized documentation edits on a
new branch on 2026-10-08. This is a documentation-only increment. The prepared
text awaits document review; agreement on direction does not claim review of
the final diff.

## Goal and scope

Prepare one coherent baseline for the next View implementation increments.
Include the conceptual amendment, representation and store authority, optional
Snapshot capture scope, namespaces, runtime validation, transition consistency,
ordering without previous-position memory, and the current priority of Views
before Inbox.

Update Core, representation notes, Operational Store notes, principles,
architecture, MVP scope, design review, journal, and the root document index.
Retain completed increments and journal history. Do not change application code,
tests, dependencies, store schema, generated Workspace instructions, or
shipped-feature claims.

## Proposed solution

[Views Profile Design Notes](../../../../docs/design/views-profile-notes.md)
own the detailed profile. Other documents describe their own responsibility
and link to it rather than independently defining divergent behavior.

Core allows explicit, computed, and combined membership and independent order.
Planning expresses intentional focus through membership, grouping, and order.
No separate persistent planning-selection relation or planning-column flags
are required. Snapshot capture chooses the whole instance or explicit columns
without prescribing sprint semantics.
View definitions are reusable Markdown documents; each concrete live instance
has its own store identity and local data. All instances use the current shared
definition; an incompatible change can use a separate independent definition.

The first Kanban profile requires unique cross-column membership. Overlap
invalidates the whole runtime evaluation with concrete diagnostics.
Registered selectors are read-only. Cross-column operations obey Action rules,
and destination evaluation precedes atomic commit of all related store changes.
Manual order has no dormant positions; returning Actions have a new position.

The example uses canonical `OWF View Definition` and `in_progress` spelling.
Columns, selectors, and operations are definition data; instance parameters
and an optional window belong to the instance. The generic work-board example
includes Backlog and New Actions; a separate capture example selects only
current-work and Done columns. Existing live-store
schema/version and CLI/API mechanics are untouched.

## Acceptance criteria

AC1: Core no longer requires mutually exclusive whole-View membership kinds.
It preserves non-ownership, lifecycle separation, optional purpose/window, and
intentional focus without a separate planning-selection relation or flags.

AC2: Markdown definitions and concrete operational instances have unambiguous
authority and identity. Several independent instances can use one current
definition without automatic copies or pinned versions.

AC3: The profile describes stable column IDs, namespaced capabilities, read-only
evaluation, whole-View or selected-column Snapshot scope, and actionable
whole-instance failure on overlap or unresolved dependencies of the definition.

AC4: Every allowed cross-column move uses shared Action rules and verifies
unique target membership before store changes and events commit together.
Neither partial changes nor effects outside the transaction are authorized.

AC5: Manual order is instance/column-local, independent of population mode,
and retains no prior positions. New arrivals and explicit return positions
are explained; reads do not write or invent computed membership history.

AC6: MVP sequencing, principles, authority/logging notes, architecture,
decision history, and document links agree. The example's field spelling,
Snapshot scope, and transition effects match the written contract.

AC7: No runtime capability is claimed to exist and no code, schema, dependency,
release, or migration is introduced. Open technical details are explicitly
assigned to later implementation increments.

## Verification plan

Review the documentation diff against the agreed discussion and AC1–AC7.
Check relative file links and newly targeted section anchors, Markdown fences,
YAML examples, stale authority statements in current documents, and
`git diff --check`. Completed increments and append-only journal history remain
historical records rather than targets for wholesale rewriting.

Use document checks only: application tests and `npm run verify` do not establish
these documentation semantics and are not required for this docs-only change.
No new executable tests or dependency installation is requested.

## Open questions

No unresolved conceptual decision blocks this documentation increment.
The physical store schema, exact commands/endpoints, capability interfaces,
default comparator, write-side ordering reconciliation, concurrency preconditions,
and custom capability packaging belong to later implementation increments.
No reconstruction of unobserved computed membership history is required.

## Implementation and review outcome

Prepared the amended Core and coordinated design documents, including a
dedicated Views profile and example definition/instance. Actual verification
evidence is recorded below. This status remains `in_progress`
pending review of the final text. No independent review, application tests,
Windows verification, release, or merge is claimed.

Verification of the previous revision on Linux, 2026-10-08 (historical):

- Documentation checks passed for 12 changed Markdown files, 63 relative links,
  seven locally available linked anchors, balanced fences, and unique numbered
  sections. File targets also matched the repository tree.
- Both new YAML examples parsed with duplicate-key rejection. Definition type,
  namespaces, column IDs, planning flags, canonical state spelling, transition
  references, and instance reference/window values were checked.
- `git diff --check` passed. The diff was inspected against AC1–AC7 and the
  agreed decisions; only Markdown files changed.
- Completed increment documents and the existing tool command README remain
  unchanged. The previous journal text was preserved and a new entry appended.
- Application tests and `npm run verify` were not run for this docs-only change.
  No independent review or Windows verification is claimed.

Verification of the Snapshot-scope revision on Linux, 2026-10-10:

- Documentation checks passed for 11 changed Markdown files, 45 relative links,
  seven locally available linked anchors, balanced fences, and unique numbered
  sections. File targets also matched the repository tree.
- All three YAML examples parsed with duplicate-key rejection. Definition type,
  namespace and column IDs, canonical states, transition references, absence of
  planning flags, the instance reference, and selected capture columns matched
  the contract.
- `git diff --check` passed. The diff was inspected against AC1–AC7;
  only Markdown files changed and the previous journal text was preserved.
- Application tests and `npm run verify` were not run for this docs-only change.
  No independent review or Windows verification is claimed.

## Decision changes and follow-up

The definition/instance separation replaces the earlier proposal to require
a Markdown ID for each live View. Optional definition IDs and stable instance
IDs have separate roles.

All instances use the current shared definition. The rejected alternatives
were definition copies/version pinning and remembered old column positions.
On 2026-10-10, the user rejected separate persisted planning membership and
planning-column flags. Snapshot scope is chosen per capture, supports continuous
Kanban as well as optional planning periods, and does not modify live membership.
Decision 026 records this simplification; the earlier verification of planning
flags above describes the superseded revision.

Future implementation must follow the agreed contracts through separately
reviewed increments, not interpret this document as authorization to build the
whole View feature set at once.
