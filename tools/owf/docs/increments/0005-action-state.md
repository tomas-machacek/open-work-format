# 0005 — Action state changes

> Status: draft
> Description: Change an Action's execution state, record waiting context and filter lists by state.
> Depends on: [0004 — Action listing](0004-action-list.md).

The user agreed to state changes, a waiting reason, editing that reason while
remaining in `waiting`, and a state filter. For this PoC, existing Workspaces
need no migration or compatibility path: assume all
Workspaces used after delivery are initialized with this increment's schema.

## Goal and scope

Make created Actions usable through their active and terminal execution states.
The current store supports only `open`; this increment adds `in_progress`,
`waiting`, `completed` and `cancelled`, and an optional `waiting_for` reason.
`get action` and `list actions` show the persisted values; `list actions` can
filter by state. References: [architecture](../architecture.md),
[development guidelines](../development-guidelines.md),
[Core v0](../../../../spec/core-v0.md),
[Operational Store model](../../../../docs/design/operational-store-notes.md),
and [MVP scope](../../../../docs/design/mvp-scope.md).

Deferred: `archived` and `archived_from`, dependencies and derived blocking,
manual block, changing content or owner, searching, GUI and migrations. A
completion cannot evaluate dependencies until dependency data exists. State
changes do not automatically change the owning Outcome or Project.

## Proposed solution

### Operations and transitions

```text
owf set action UUID --state in_progress
owf set action UUID --state waiting --waiting-for "Odpoveď dodávateľa"
owf set action UUID --state waiting --waiting-for "Nový termín odpovede"
owf set action UUID --state completed
owf set action UUID --state cancelled
owf set action UUID --state open
owf list actions --state waiting --json
```

Accept a UUID v4 or `owf:action:UUID`, as `get action` does. `--state` is required
on `set action`. The new state must be one of `open`, `in_progress`, `waiting`,
`completed` and `cancelled`; reject `archived` in this increment. A change from
any of those states to any _different_ one is permitted, including reopening a
terminal Action to correct an accidental completion or cancellation. There is
no automatic cascade. While already in `waiting`, the same command with a
different `--waiting-for` updates only the waiting reason. A repeated state
request that changes neither state nor waiting reason is `INVALID_ARGUMENT`
and makes no write.

`--waiting-for` is optional when entering `waiting` and invalid with other
target states. If supplied, it must contain non-whitespace text; preserve the
supplied string verbatim, without trimming or silently replacing it. Entering
`waiting` without the option starts with no reason. While already `waiting`,
supplying a different reason replaces the existing value; omitting the option
leaves it unchanged and is therefore a no-op error. Leaving `waiting` clears
the reason in the same update. Clearing a reason while remaining `waiting` is
deferred. JSON and human output show the resulting Action, including the reason
when present.

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
operational event that identifies the Action, old and new state and event time;
for a reason-only edit, it must also record the old and new waiting reasons.
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
update `updated_at` and record one matching operational event. A request that
changes neither state nor reason, or supplies an invalid state, does not write.

AC2: `waiting_for` can accompany a transition into `waiting`, can be replaced
while remaining `waiting`, and is absent after leaving it. It is optional,
nonblank and preserved literally when supplied, and rejected for other target
states. Failed validation makes no partial change.

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
  When I change its waiting reason while it remains Waiting
  Then the new reason is available when I read the Action
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

## Open questions

No blocking question. Reopening terminal Actions and replacing `waiting_for`
while remaining in `waiting` were confirmed by the user. Other transition
details in this draft remain subject to design review.

## Implementation and review outcome

Not implemented or independently reviewed. Record actual delivery and evidence
here; set `completed` only after implementation, verification and review.

## Decision changes and follow-up

- No schema migration or compatibility path for pre-0005 PoC Workspaces, per
  user decision. Future changes can define migrations if persistence becomes
  necessary.
- Reopening `completed`/`cancelled` corrects accidental transitions. A repeated
  `waiting` command may replace the reason without a state change, per user
  decision.
- Archive, dependency checks and derived blocking remain separate increments.
