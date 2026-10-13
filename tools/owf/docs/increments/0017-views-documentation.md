# 0017 — Align documentation for reusable Views

> Status: in_progress
> Description: Define reusable state/Blocked Views, independent instances, and manual order.
> Depends on: [0016 — Board search](0016-board-search.md), as the current delivered baseline.

Documentation edits were authorized on 2026-10-08, Snapshot scope simplified on
2026-10-10, and the state/Blocked profile agreed on 2026-10-11. This is a
documentation-only increment. Final text still awaits review; agreement on
direction does not claim review of the diff.

## Goal and scope

Prepare a coherent baseline for the first configurable View implementation:
reusable Markdown definitions, independent instances, state-mapped columns,
a special Blocked column, current placement, exclusively manual order, fixed
move/create semantics, scoped Snapshots, and Views before Inbox.

Update Core clarification, representation/store notes, principles, architecture,
MVP scope, profile, decision history, journal, and document indexes. Retain
completed increments and append-only journal history. Change no application code,
tests, dependencies, physical schema, or generated Workspace instructions.

## Proposed solution

Decision 028 keeps Core independent of concrete identity forms, field names,
and first-tool choices. Profile documents own those conventions and preserve
the agreed runtime direction; this cleanup changes no reference syntax.

[Views Profile Design Notes](../../../../docs/design/views-profile-notes.md)
own the detailed contract; related documents link to it.

Ordinary columns support one or several execution states. Per-state default
columns handle unplaced Actions; per-column default states define moves and
creation. Current placement distinguishes columns accepting the same state.
A special Blocked column uses derived blocking, sets a manual reason on entry,
and clears it on departure only when no dependency block remains. Ordinary
columns exclude blocked Actions unless `include_blocked: true`.

All card order is manual. Keep eligible placement, otherwise route through
Blocked and eligible state defaults. New arrivals append. No earlier column
or position is restored. Evaluate reads without writes; define physical
reconciliation in the code increment.

Fixed application commands obey shared Action rules and atomically commit
Action data, placement, order, and events after validating the resulting View.
Creation in a column follows the same default-state and required-input rules.
Blocking support must be implemented before claiming the full workflow.

Definitions remain current and shared; instances have independent IDs and data.
No separate planning-selection set or flags are introduced. Snapshot capture
chooses the whole instance or explicit columns and remains deferred at runtime.

The earlier namespaced capability design for selection, filtering, automatic
sorting, and custom transitions is deferred because of its complexity. Revisit
it for a concrete need; do not implement a registry or hooks in anticipation.

## Acceptance criteria

AC1: Core retains general View semantics, unambiguous identity, consistent
references, and optional temporal boundaries. Concrete identity forms,
definition/instance structure, window field names, and first-tool feature
choices belong to the profile. Core does not prescribe the smaller Kanban model.

AC2: Markdown definitions and Operational Store instances have clear authority
and identity, current shared definitions, no automatic copies or pinned versions,
and independent current placement/order without generic capability parameters.

AC3: The profile specifies single/multi-state columns, state default columns,
column default states, Blocked, `include_blocked`, and deterministic unique
routing. Several columns accepting one state are normal, not overlap errors.

AC4: Fixed move/create rules use shared Action semantics and validate before an
atomic commit. Manual-block reasons remain required; dependency-blocked exits
fail without removing the manual reason or changing other data. No custom hooks.

AC5: Order is always manual. New arrivals append; departure discards prior
placement and position. Reads remain side-effect free and implementation must
define write-side reconciliation without reconstructing unobserved history.

AC6: Snapshot scope is whole-instance or selected-column capture without a
persistent planning set. Examples show the user's seven-column board,
multi-state acceptance, independent instances, and a capture excluding New and
Backlog. Sprint naming remains local to the example.

AC7: Current documents agree and record why the generic capability model was
deferred. Historical decisions and verification are clearly identified.
No runtime, migration, release, merge, or completed blocking feature is claimed.

## Verification plan

Review the diff against AC1–AC7 and the agreed discussion. Check relative links,
local anchors, fences, numbered sections, unique-key YAML examples, defaults,
blocking declarations, and stale current requirements. Run `git diff --check`.
Preserve journal history and completed increment documents.

Use documentation checks only. Application tests and `npm run verify` do not
establish these documentation semantics and are not required for this change.
No new executable application tests or dependencies are requested.

## Open implementation details

Physical tables, schema/version changes, exact CLI/API, concurrency preconditions,
required-input UI, write-side placement/order reconciliation, and newcomer
tie-breaking belong to separately agreed code increments. No generic capability
interfaces or packaging are prerequisites. Snapshot runtime remains deferred.

## Implementation and review outcome

Prepared the simplified profile and coordinated documents. Status remains
`in_progress` pending review of final text. Historical evidence below describes
earlier revisions, not tests of the current model. No independent review,
application tests, Windows verification, release, or merge is claimed.

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

Verification of the Snapshot-scope revision on Linux, 2026-10-10 (historical):

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

Verification of the simplified-profile revision on Linux, 2026-10-11:

- Documentation checks passed for 12 changed Markdown files, 66 relative links,
  eight locally available linked anchors, balanced fences, and unique numbered
  sections. File targets also matched the repository tree.
- Four YAML examples parsed with duplicate-key rejection. Checks covered the
  seven-column board, state/default mappings, the special Blocked declaration,
  multi-state and include-blocked options, instance reference, and capture scope.
  Examples contain no generic capability, filter, ordering, or transition fields.
- The diff was inspected against AC1–AC7, including same-state placement,
  dependency-blocked exit rejection, no former-column restoration, creation,
  and retained Snapshot scope. `git diff --check` passed.
- The existing Action domain and completed state increment were checked to
  distinguish the planned blocking workflow from delivered functionality and
  preserve the existing optional waiting-reason behavior.
- Only Markdown changed; journal history and completed increments were preserved.
  Application tests and `npm run verify` were not run. No independent review or
  Windows verification is claimed.

Verification of the Core/profile cleanup on Linux, 2026-10-13:

- Checks passed for five changed Markdown files, 12 relative links, five local
  anchors, balanced fences, and unique numbered sections. The four existing
  profile YAML examples still passed their configuration checks.
- Inspected the Core diff for representation leakage and confirmed concrete
  identity, window names, and View-instance rules remain in profile documents.
  `git diff --check` passed; journal history was preserved.
- No application code changed. Application tests and `npm run verify` were not
  run; no independent review or Windows verification is claimed.

## Decision changes and follow-up

Decision 025 introduced reusable definitions and independent instances without
definition copies/version pinning or remembered former positions. Decision 026
removed separate planning membership and made Snapshot scope a per-capture
choice. Decision 027 retains those simplifications and replaces the generic
capability profile with fixed state/blocking behavior and manual order.

The complexity of generic selection, filtering, ordering, and transition
capabilities is not justified by the actual seven-column board. Preserve this
rationale and revisit generalization if practical needs arise. Future runtime
work must follow separately agreed increments.

Decision 028 removes representation-specific identity/window conventions and
first-Kanban implementation details from Core while retaining them in the
profile. Historical decisions remain annotated rather than rewritten.
