# 0017 — Manual blocking and Action dependencies through the CLI

> Status: reviewed
> Description: Set and clear manual blocks, manage Action prerequisites, and explain derived blocking in CLI reads.
> Depends on: [0011 — CLI Action editing](0011-action-edit-cli.md) and [0014 — CLI Action search](0014-action-search-cli.md).

Proposed on 2026-10-14 as a prerequisite to implementing Views. This document
defines a tool increment; it does not change Core semantics. The user reviewed
and approved this design for implementation on 2026-10-15.

## Goal and scope

Let a person or agent record why an Action cannot proceed, distinguish manual
blocking from unfinished prerequisites, and remove obsolete blockers. All new
controls and presentation are CLI-only. Shared validation must also protect
existing browser writes, so the board cannot bypass completion rules.

References: [Core §§7.2–7.3](../../../../spec/core-v0.md#72-execution-dependencies),
[Operational Store §§9.2, 10, 11](../../../../docs/design/operational-store-notes.md),
[architecture](../architecture.md), [development guidelines](../development-guidelines.md)
and [MVP scope](../../../../docs/design/mvp-scope.md).

Included: one optional manual reason per Action; add/remove directed Action-to-Action
dependencies in the same Workspace, including across Projects; derived blocking
on get/list and mutation results; shared completion checks and atomic persistence.

Deferred: Outcome endpoints, archival, reverse-dependency queries, blocking
filters, new create options, cycle-lint tooling, Views, Kanban blocking controls
and indicators, and new HTTP mutation capabilities. Existing title/description
search does not search manual reasons or prerequisite titles. The broader MVP
still includes Outcome dependencies and GUI access in later increments.

## Proposed solution

### CLI edits

Extend the existing partial-edit operation:

```text
owf set action {id} --manual-block "Čakám na obnovenie prístupu"
owf set action {id} --clear-manual-block
owf set action {id} --add-dependency {prerequisite-id}
owf set action {id} --remove-dependency {prerequisite-id}
owf set action {id} --add-dependency {first-id} --add-dependency {second-id}
owf set action {id} --remove-dependency {old-id} --add-dependency {new-id}
owf set action {id} --clear-manual-block --state completed
```

The source is `{id}`; the supplied target is its prerequisite. Accept UUID v4
and `owf:action:UUID` for both endpoints, normalize using existing ID rules, and
persist target references as canonical Action URIs. Targets must exist in the
current Workspace; Markdown URLs and other endpoint kinds are unsupported here.

`--manual-block` sets or replaces a nonblank human-readable reason, using the
same text handling as `--waiting-for`. Reject repeated scalar/clear flags and
set-plus-clear. The reason is independent of `waiting_for`; a waiting Action
may have both. Setting/clearing it never changes execution state.

Manual blocking is allowed only in `open`, `in_progress`, and `waiting`.
Omission preserves the reason. A transition to `completed` or `cancelled` while
a manual reason remains fails with an explanation to clear it explicitly;
`--clear-manual-block` can be combined with that transition atomically. Do not
silently discard the reason. Clearing an absent reason is an idempotent no-op,
including on terminal Actions. Setting a reason with a resulting terminal state
is invalid. This explicit-clear interaction is an approved CLI choice, not a new
Core requirement.

Dependency flags are repeatable and may be combined with each other and all
existing edits. Treat dependencies as a set: duplicate adds normalize to one
target, adding an existing edge and removing an absent edge are successful
no-ops. Reject a normalized target supplied in both add and remove in one
request. Validate supplied target IDs and existence, including no-op requests.
All requested changes form one final candidate and commit together or not at all.

Clearing a manual block leaves dependency blocking intact. Removing an edge
does not clear a manual reason. Completing a target leaves the edge in place;
it becomes satisfied. Reopening or cancelling that target makes the edge
unresolved again on the next read, without rewriting its dependents.

Cycles, including self-dependencies, are representable rather than rejected.
Evaluation examines direct target disposition, not recursive graph execution,
so it terminates for cycles. No linter is delivered or conformance claimed in
this increment; a later linter must report cycles as required by Core.

### Completion and terminal behavior

An Action dependency is satisfied exactly when its target is `completed`.
`open`, `in_progress`, `waiting`, and `cancelled` targets are unresolved.
The current tool has no archive operation; archived disposition handling remains
part of that future increment, not a new accepted state in this one.

Entering `completed` requires every remaining dependency of the final candidate
to be satisfied. A request may remove an obsolete dependency and complete the
source together. Entering `cancelled` does not require satisfied dependencies,
but still requires clearing any manual reason. `open`, `in_progress`, and
`waiting` remain assignable while dependency-blocked; blocked is not a sixth
state and does not replace the existing state filter.

Apply this rule through the shared operation, including the existing board
state endpoint. Reject a forbidden completion with a stable domain error and
the unresolved prerequisite IDs; the browser must display its existing failure
notice and retain the actual state. Browser content edits preserve all new fields.
New blocking controls or visual design are outside scope.

Core constrains entering the successful disposition; it does not cascade a
later target correction back into the source's state. Existing terminal Actions
may therefore acquire unresolved dependencies through edits or target changes.
Keep their state and report current derived blocking honestly. An unchanged
`completed` state request is not re-entry; reopening and then completing is.
Do not reject unrelated edits solely because an already completed source now
has an unresolved dependency. Manual reasons remain forbidden on terminal Actions.

### CLI presentation

Keep `State` unchanged and always show a separate `Blocked` summary in get,
list, and mutation results. Use these forms:

```text
Blocked: no
Blocked: yes (manual)
Blocked: yes (dependencies: 2 unresolved of 3)
Blocked: yes (manual; dependencies: 2 unresolved of 3)
```

In list output, add `Manual block: {reason}` when present. Keep prerequisite
details in get/mutation output so a long list remains readable. In those details,
show every dependency, including satisfied ones, with full canonical URI, current
title, state, and `satisfied` or `unresolved`. Show `Dependencies: none` for an
empty set. Sort dependency details by canonical URI for stable output; order is
not priority. Preserve existing Action list order and filters.

Illustrative excerpt from get (symbolic IDs for readability):

```text
Title: Nasadiť aplikáciu
State: open
Blocked: yes (manual; dependencies: 1 unresolved of 2)
Manual block: Chýba prístup na produkciu
Dependencies:
  owf:action:{a} | Schváliť nasadenie | waiting | unresolved
  owf:action:{b} | Dokončiť testy | completed | satisfied
```

`--json` preserves existing envelopes and fields. Extend each returned Action
projection with optional persisted `manual_block`, a `depends_on` array of
canonical URIs (empty when none), and an always-present derived `blocking` object:

```json
{
  "blocked": true,
  "manual": true,
  "unresolved_dependencies": ["owf:action:{a}"],
  "dependencies": [
    { "uri": "owf:action:{a}", "title": "Schváliť nasadenie", "state": "waiting", "satisfied": false },
    { "uri": "owf:action:{b}", "title": "Dokončiť testy", "state": "completed", "satisfied": true }
  ]
}
```

The example is the value of `action.blocking`, not a replacement Action envelope.
Use the same complete projection in list JSON and get/mutation JSON. With no
dependencies, both derived arrays are empty. `blocked` is the OR of manual
presence and any unresolved target. Compute it in shared application/domain
logic; transport projections are not authoritative stored Action properties.

Resolve prerequisites outside list filters as well: an Action selected by owner,
state or text may depend on a target excluded by those filters. Missing or
malformed referenced data is a read error, never `satisfied`, `unresolved`, or
`Blocked: no`. Retain existing corruption detection outside the selected list.
Use one consistent SQLite read snapshot for source and target facts; get/list
never change data, timestamps or event counts.

### Persistence, layers and compatibility

Store only the manual reason and outgoing reference set as new authoritative
Action data. Do not persist target titles/states, satisfaction, blocking booleans,
reverse lists, or a cached count. Keep physical schema choices within SQLite
infrastructure and domain evaluation free of database access.

Extend the existing atomic edit transaction. Read current source and required
target facts, validate the final candidate and completion guard, and persist
the source plus exactly one operational event within that transaction. A target
change cannot race between validation and commit. Retain existing expected
snapshot checks for browser edits; new source data changes advance its revision.
Target-only changes need not advance the source revision, so completion must
always recheck target facts even when the source snapshot still matches.

A real manual/dependency edit uses `action.updated`, recording changed fields
and old/new manual reason or dependency sets alongside existing event details.
State-only changes retain existing event conventions. Preserve ID/created_at;
advance updated_at once per real source edit. No-ops produce no event or timestamp
change. Target completion emits only the target's normal event, not dependent
update events. Write/event/commit failure rolls back the complete source edit.
Invalid arguments, missing targets, invalid completion, corruption and unavailable
stores retain distinct structured errors and existing exit conventions.

Bump schema 4 to 5 for the new authoritative data and validation. Follow the
agreed PoC policy: initialize fresh schema-5 Workspaces; reject older stores
with `UNSUPPORTED_STORE_VERSION` without migration or mutation. Document the
fresh-workspace trial requirement; do not overwrite existing data. No release
or dependency upgrade is part of this increment.

Update CLI help, tool README and generated Workspace AGENTS.md with commands,
direction of dependency, terminal rules, JSON fields and examples. Existing
user-edited Workspace guides remain untouched. Preserve current browser API
compatibility; internal/shared contract additions may be needed but no new
blocking mutation endpoint is introduced.

## Acceptance criteria

AC1 — Independent reasons and atomic terminal edits:

```gherkin
Given a waiting Action with a waiting reason and a manual block
When I replace its manual reason
Then its state and waiting reason remain unchanged
When I clear its manual block
Then only its manual reason is removed
```

Blank/contradictory input fails. Terminal transitions with a retained manual
reason fail; explicit clear plus an otherwise valid terminal transition succeeds
atomically. Setting a manual reason on a terminal result fails.

AC2 — Dependency set and endpoint semantics: add/remove multiple dependencies,
cross-Project targets, canonical URI/UUID equivalence and replacement work as
defined. No-op requests preserve timestamps/events. Missing/unsupported targets
and add/remove conflicts leave all fields unchanged. Cycles/self-edges are
accepted and reads terminate.

AC3 — Derived dependency blocking:

```gherkin
Given an Action depending on another Action
When its prerequisite is cancelled
Then the source remains dependency-blocked
When its prerequisite is completed
Then that dependency is satisfied without deleting the relationship
When the prerequisite is reopened
Then the dependency is unresolved again without changing the source state
```

A separate manual reason continues blocking after all dependencies are satisfied.
Only direct target disposition determines satisfaction, including a completed
target that itself later acquires an unresolved dependency.

AC4 — Shared completion guard: unresolved remaining dependencies prevent entering
completed through CLI and existing HTTP state updates. Removing an obsolete
edge and completing can succeed atomically. Cancellation is allowed subject to
manual clear. An already completed source is not automatically reopened and
unrelated edits/no-op state requests remain possible as specified.

AC5 — Useful reads: human get/list keep state separate and accurately show each
blocking combination; get includes satisfied and unresolved targets. JSON exposes
complete projections consistently. Targets outside selection filters are resolved;
corrupt/missing data fails without partial successful output or writes.

AC6 — Persistence and existing clients: edits/events commit together, rollback
on failure, and preserve unrelated fields. Browser edits preserve CLI-added
data and reject stale source revisions. Completion validates current target
facts within the transaction even after a target-only change. Fresh schema 5
works; schema 4 is rejected unchanged. Help, README and generated guidance agree.

## Verification plan

- Application acceptance scenarios for independent blockers, completion/cancellation,
  target corrections, and atomic remove/clear plus completion (AC1–AC4).
- Focused domain cases for candidate validation, idempotency, terminal-source
  semantics and direct evaluation in cycles; avoid duplicating the acceptance matrix.
- SQLite integration for coherent source/target reads, target validation at write,
  event rollback, derived reads without writes, corrupt references outside filters,
  and schema rejection (AC2, AC5–AC6).
- CLI process checks for repeatable flags, URI normalization, text/JSON output
  and error exits; one end-to-end manual/dependency unblock journey (AC1–AC5).
- Existing HTTP integration tests extended for forbidden completion, preservation
  of new fields, and current-target validation despite an unchanged source snapshot.
  Reuse board error-handling tests and existing browser journeys; no new blocking
  UI journey is required (AC4, AC6).
- Run `npm run verify` before implementation handoff and record actual revision,
  platform and results. No runtime tests are claimed for this draft-only change.

Manual trial: initialize a fresh Workspace, create prerequisite and dependent
Actions in different owners, add their edge and a manual reason, compare get
and filtered list in text/JSON, try completion, complete the prerequisite, clear
the manual reason and complete the source. Reopen the prerequisite and inspect
the source again. Also try forbidden completion through the existing board.

## Open questions

No blocking questions remain. The user approved the CLI command/output shape
and explicit manual-clear rule for terminal transitions on 2026-10-15. No Core
specification change is proposed.

## Implementation and review outcome

Design reviewed and approved for implementation on 2026-10-15. Implementation
and code review have not started.
