# 0005 — Action state changes

> Status: draft
> Description: Change an Action's execution state, record waiting context and filter lists by state.
> Depends on: [0004 — Action listing](0004-action-list.md).

The user agreed to state changes, a waiting reason and a state filter. For this
PoC, existing Workspaces need no migration or compatibility path: assume all
Workspaces used after delivery are initialized with this increment's schema.

## Goal and scope

Make created Actions usable through their active and terminal execution states.
The current store supports only `open`; this increment adds `in_progress`,
`waiting`, `completed` and `cancelled`, and an optional `waiting_for` reason.
`get action` and `list actions` show the persisted values; `list actions` can
filter by state. See [Core v0](../../../../spec/core-v0.md#6-actions) and the
[Operational Store model](../../../../docs/design/operational-store-notes.md).

Deferred: `archived` and `archived_from`, dependencies and derived blocking,
manual block, changing content or owner, searching, GUI and migrations. A
completion cannot evaluate dependencies until dependency data exists. State
changes do not automatically change the owning Outcome or Project.

## Proposed solution

### Operations and transitions

```text
owf set action UUID --state in_progress
owf set action UUID --state waiting --waiting-for "Odpoveď dodávateľa"
owf set action UUID --state completed
owf set action UUID --state cancelled
owf set action UUID --state open
owf list actions --state waiting --json
```

Accept a UUID v4 or `owf:action:UUID`, as `get action` does. `--state` is required
on `set action`. The new state must be one of `open`, `in_progress`, `waiting`,
`completed` and `cancelled`; reject `archived` in this increment. A change from
any of those states to any _different_ one is permitted, including reopening a
terminal Action. This proposes an explicit correction path for an accidental
completion or cancellation; it does not introduce an automatic cascade.
Reject setting the existing state again as `INVALID_ARGUMENT` without a write.

`--waiting-for` is optional when entering `waiting`, may be an empty string only
if the existing string validation allows it, and is invalid with other target
states. Entering `waiting` without the option starts with no reason; leaving
`waiting` clears the reason in the same update. This command does not edit the
reason while the state remains `waiting`; a later content-edit operation can
provide that capability. Preserve the supplied reason verbatim, without
trimming or silently replacing it. JSON and human output show the resulting
Action, including the reason when present.

`list actions --state STATE` selects precisely one of the five states. It can be
combined with `--owner` and `--recursive`, which retain their current semantics.
Without a state filter, list returns all stored Actions, including `completed`
and `cancelled`. A state filter with no matches returns a successful empty list.
Multiple `--state` options are rejected rather than silently choosing one.

### Persistence and errors

Initialize new Workspaces with a new schema version that allows these states and
`waiting_for` (nullable, valid only in `waiting`). Update all row validation and
store-shape checks for the new version. A schema 2 store is rejected as
`UNSUPPORTED_STORE_VERSION` without modification, using existing discovery
behavior; do not migrate, delete or recreate it. Existing user-written
Workspace AGENTS.md files remain untouched.

Keep Action ID, owner, title, description and `created_at`. On a successful
transition set `updated_at` to the tool's current time and append a correlated
operational event that identifies the Action, old and new state and event time.
The Action update and event insert must commit atomically; a failed update,
event insert or commit leaves both the Action and Event Log unchanged. Use a
single read/write transaction and check that the intended Action still has the
read state when writing; report a concurrent change rather than overwrite it.
The state after read must be validated just as for `get action`.

Unknown Action IDs report `ACTION_NOT_FOUND`; invalid CLI arguments exit 2.
Invalid stored rows, unavailable or corrupt stores, failed transactions and
concurrent changes produce a clear nonzero error, never success or an implicit
store initialization. Reads remain read-only. The set operation must not
depend on a surviving Markdown owner directory: the stored owner reference
remains unchanged. Preserve the distinction between a missing Action and a
store that cannot be read.

Update CLI help, tool README and the single generated Workspace AGENTS.md
template. `get` and list JSON retain their envelopes and add `waiting_for`
only when present; the set JSON response follows the existing Action result
style, with `status: "updated"`. Document the schema break and how to create a
fresh PoC Workspace. No compatibility promise or migration is implied.

## Acceptance criteria

AC1: An Action can enter each supported state, leave `waiting`, and reopen from
`completed` or `cancelled`. ID and creation time stay stable; successful changes
update `updated_at` and record one matching operational event. Repeating the
same state or supplying an invalid state does not write.

AC2: `waiting_for` can accompany a transition into `waiting` and is absent
after leaving it. It is optional, preserved literally when supplied, and
rejected for other target states. Failed validation makes no partial change.

AC3: List without a state filter includes terminal Actions. The state filter
matches exactly and composes with direct or recursive owner filtering. Empty
results succeed; `get` and list return full and valid Action data.

AC4: The transition and event are atomic even when event insertion or commit
fails. A missing Action, damaged row, store problem or concurrent change is
distinguished from success; no read creates or modifies a store. Schema 2 is
refused without mutation.

AC5: The built CLI, help, README and newly generated Workspace guide agree;
existing create/get/list and Project/Outcome behavior is preserved. Existing
Workspace guides are not overwritten.

Draft domain scenarios (replace with canonical executable links after delivery):

```gherkin
Scenario: Wait for a response, then complete a step
  Given an open Action
  When I change it to Waiting with a reason
  Then the reason is available when I read the Action
  When I change it to Completed
  Then it is Completed without a waiting reason

Scenario: Find work by state and owner
  Given a Project with a completed Action and a nested Outcome with a waiting Action
  When I list the Project Actions recursively in Waiting
  Then only the nested Outcome Action is returned
```

## Verification plan

- Domain tests for transition and waiting invariants; application/acceptance
  scenarios for the observable journeys (AC1–AC3).
- SQLite integration checks for event correlation, rollback on insert and commit
  failures, stale concurrent writes, schema rejection and unchanged prior data
  (AC1, AC4). Avoid duplicating all transition pairs at every layer.
- Small built-CLI checks for JSON and human output, combined state/owner filter,
  argument errors and examples in the generated guide (AC3–AC5).
- Run `npm run verify` before handoff and record exact revision, platform and
  actual results. Manually try a fresh Workspace and the commands above.

## Open questions for review

- Confirm that terminal Actions can be reopened and that a repeated same-state
  request is rejected. Core names terminal dispositions but does not prescribe
  a transition graph.
- Confirm whether editing `waiting_for` while remaining in `waiting` belongs in
  this increment; the proposal defers it to content editing.

## Implementation and review outcome

Not implemented or independently reviewed. Record actual delivery and evidence
here; set `completed` only after implementation, verification and review.

## Decision changes and follow-up

- No schema migration or compatibility path for pre-0005 PoC Workspaces, per
  user decision. Future changes can define migrations if persistence becomes
  necessary.
- Archive, dependency checks and derived blocking remain separate increments.
