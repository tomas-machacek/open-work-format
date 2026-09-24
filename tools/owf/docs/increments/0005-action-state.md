# 0005 — Action state changes

> Status: in_progress
> Description: Change an Action's execution state, record waiting context and filter lists by state.
> Depends on: [0004 — Action listing](0004-action-list.md).

The user reviewed and approved this design for implementation. It covers state
changes, a waiting reason, editing that reason while remaining in `waiting`,
and a state filter. For this PoC, existing Workspaces
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
owf list actions --state open --state waiting --owner /_projects/kitchen/ --recursive
```

Accept a UUID v4 or `owf:action:UUID`, as `get action` does. `--state` is required
on `set action`. The new state must be one of `open`, `in_progress`, `waiting`,
`completed` and `cancelled`; reject `archived` in this increment. A change from
any of those states to any _different_ one is permitted, including reopening a
terminal Action to correct an accidental completion or cancellation. There is
no automatic cascade. While already in `waiting`, the same command with a
different `--waiting-for` updates only the waiting reason. A repeated state
request that changes neither state nor waiting reason succeeds idempotently:
return the current Action without changing `updated_at` or appending an event.

`--waiting-for` is optional when entering `waiting` and invalid with other
target states. If supplied, it must contain non-whitespace text; preserve the
supplied string verbatim, without trimming or silently replacing it. Entering
`waiting` without the option starts with no reason. While already `waiting`,
supplying a different reason replaces the existing value; omitting the option
leaves it unchanged and therefore succeeds as a no-op. Leaving `waiting` clears
the reason in the same update. Clearing a reason while remaining `waiting` is
deferred. JSON and human output show the resulting Action, including the reason
when present.

Each `list actions --state STATE` occurrence selects one of the five states.
Repeated occurrences select Actions in **any** specified state, without
duplicating an Action when a value is repeated. State selection combines with
`--owner` and `--recursive` using **and**; owner filtering retains its existing
semantics. The comma-separated form `--state open,waiting` is invalid. Without
a state filter, list returns all stored Actions, including `completed` and
`cancelled`. A state filter with no matches returns a successful empty list.

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
style, with `status: "updated"` for a change and `status: "unchanged"` for an
idempotent no-op. Both are successful responses. Document the schema break and how to create a
fresh PoC Workspace. No compatibility promise or migration is implied.

## Acceptance criteria

AC1: An Action can enter each supported state, leave `waiting`, and reopen from
`completed` or `cancelled`. ID and creation time stay stable; successful changes
update `updated_at` and record one matching operational event. A request that
changes neither state nor reason succeeds with the unchanged Action, timestamp
and event log. An invalid state is rejected without a write.

AC2: `waiting_for` can accompany a transition into `waiting`, can be replaced
while remaining `waiting`, and is absent after leaving it. It is optional,
nonblank and preserved literally when supplied, and rejected for other target
states. Failed validation makes no partial change.

AC3: List without a state filter includes terminal Actions. Repeated `--state`
values match any named state, with no duplicate Actions; invalid values and
comma-separated lists are rejected. State selection composes with direct or
recursive owner filtering. Empty results succeed; `get` and list return full
and valid Action data.

AC4: The transition and event are atomic even when event insertion or commit
fails. A missing Action, damaged row, store problem or concurrent change is
distinguished from success; no read creates or modifies a store. Schema 2 is
refused without mutation.

AC5: The built CLI, help, README and newly generated Workspace guide agree;
existing create/get/list and Project/Outcome behavior is preserved. Existing
Workspace guides are not overwritten.

Canonical executable criteria:

- [Action state acceptance scenarios](../../tests/acceptance/features/action-state.feature)
  cover waiting context, completion/reopening and OR state selection with direct
  or recursive owner scope (AC1–AC3).
- [Domain rules](../../src/domain/actions/actions.test.ts) cover the complete
  transition matrix, literal/optional reasons and no-op invariants (AC1–AC2).
- [SQLite integration](../../tests/integration/actions.test.ts) covers correlated
  events, rollback at update/event/commit, competing writers, rejected conditional
  writes, damaged rows and unsupported schemas without mutation (AC1, AC4).
- [Built CLI](../../tests/e2e/cli.test.ts) covers envelopes, human output, arguments,
  combined filters and execution of generated guide examples (AC3–AC5).

## Verification plan

- Domain tests for transition, waiting and idempotent no-op invariants;
  application/acceptance scenarios for the observable journeys (AC1–AC3).
- SQLite integration checks for event correlation, rollback on insert and commit
  failures, stale concurrent writes, schema rejection and unchanged prior data
  (AC1, AC4). Avoid duplicating all transition pairs at every layer.
- Small built-CLI checks for JSON and human output, combined state/owner filter,
  argument errors and examples in the generated guide (AC3–AC5).
- Run `npm run verify` before handoff and record exact revision, platform and
  actual results. Manually try a fresh Workspace and the commands above.

## Open questions

No blocking question. Reopening terminal Actions, replacing `waiting_for`
while remaining in `waiting`, idempotent requests and repeated state filters
were confirmed by the user.

## Implementation and review outcome

Implemented the five-state operation, optional/editable waiting reason,
idempotent unchanged response and repeated state filters. Domain rules run via
an application callback inside one SQLite read/write transaction. BEGIN IMMEDIATE
serializes writers; the conditional update also checks the read state, reason
and updated_at. An update, event insert or commit failure rolls back both records.
Lock timeout reports ACTION_UPDATE_FAILED with concurrency guidance; a rejected
conditional write reports ACTION_CONFLICT.

New Workspaces use schema 3. Previous schema versions are refused without
migration, reset or replacement. Reads remain read-only; stored ownership stays
usable after a Markdown owner moves. CLI help, README and the single generated
guide source are updated; existing user guides remain untouched.

Verified implementation commit: `7581a71edb190c01875ae8f8e3f5cbca06baf455`.
On 2026-09-24, `npm run verify` passed on Windows 11 (build 26200),
Node 24.21.0 and npm 11.4.1: typecheck, ESLint, Prettier, architecture
(28 modules, 70 dependencies), build, 56 unit tests, 101 integration tests,
24 acceptance scenarios / 123 steps, and 19 built-CLI tests. The working tree
was clean for this run. A following documentation-only commit records this
evidence; it does not alter implementation, tests or configuration.

Earlier checks: typecheck, lint and build passed; unit tests passed (56).
The targeted integration invocation also selected the colocated Action tests
(118 tests total). Acceptance passed (24 scenarios). Sandbox Vitest startup
failed with spawn EPERM; tests were rerun successfully outside the sandbox.
The first CLI run passed 18 tests but timed out executing the expanded guide
at 5 seconds. That one test now has a 15-second budget for over twenty separate
Node processes; all examples remain executed, and the final verify passed.

Manual built-CLI trial in a fresh temporary Workspace passed: initialize,
create Project and Action, enter waiting, edit its reason, omit the reason for
an unchanged result with the same updated_at, combine repeated states with
recursive owner filtering (one result), complete, reopen, and retrieve by URI.
JSON and human output matched the persisted values. Existing user-written guides
are covered by the unchanged initialization acceptance scenario.

Independent review is pending; status remains in_progress in this document and
index. No merge or release was performed. Linux was not tested for this increment.
No migration, archive, dependencies, derived blocking, or clearing a waiting
reason while remaining waiting is included. Review should assess the PR diff
against the canonical tests and acceptance criteria above.

## Decision changes and follow-up

- No schema migration or compatibility path for pre-0005 PoC Workspaces, per
  user decision. Future changes can define migrations if persistence becomes
  necessary.
- Reopening `completed`/`cancelled` corrects accidental transitions. A repeated
  `waiting` command may replace the reason without a state change, per user
  decision.
- Repeating the same state and reason succeeds idempotently without a timestamp
  or event change, per user decision.
- Repeated `--state` options mean any listed state; comma-separated values are
  not accepted, per user discussion.
- Archive, dependency checks and derived blocking remain separate increments.
