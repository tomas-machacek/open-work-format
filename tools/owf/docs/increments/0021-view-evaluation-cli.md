# 0021 — Read-only View evaluation through CLI

> Status: in_progress
> Description: Show current Actions grouped into a View instance's columns without changing persistent data.
> Depends on: [0020 — View instance CLI foundation](0020-view-instance-cli-foundation.md) and [0017 — CLI Action blocking and dependencies](0017-action-blocking-cli.md).

## Goal and scope

A user can inspect the actual current content of a stored View instance through
the CLI. Increment 0020 returns validated configuration; this increment evaluates
non-archived Workspace Actions into that configuration's columns.

The authority is the [Views profile](../../../../docs/design/views-profile-notes.md),
especially eligibility and unique placement in Section 4, together with
[Core](../../../../spec/core-v0.md) and the
[Operational Store design](../../../../docs/design/operational-store-notes.md).
Follow the [architecture](../architecture.md),
[development guidelines](../development-guidelines.md) and current
[MVP sequence](../../../../docs/design/mvp-scope.md).

Implementation clarification approved by the user on 2026-10-22: schema 6 and
the existing Action model support only `open`, `in_progress`, `waiting`,
`completed` and `cancelled`, without `archived` or `archived_from`. Preserve
schema 6 and existing blocking semantics. Archival exclusion and archived
prerequisite disposition cannot be delivered or verified in this increment;
they require a future agreed schema/model change. Externally injected archived
records are invalid data and must fail explicitly. The criteria below reflect
this accepted resolution of the original archival requirement.

Included:

- A noninteractive CLI operation with human and structured JSON output.
- Evaluation of current Action state and derived blocking against the current
  shared definition.
- Unique derived column assignment, including empty columns and deterministic
  card order.
- Explicit errors and no semantic writes.
- Command help, README examples and generated Workspace guidance.

Deferred: persisted placements, manual ordering, moves, write-side reconciliation,
creation in columns, instance windows, editing/deleting instances, definition
authoring/discovery, filters/search, owner scoping, HTTP/GUI changes, Snapshots
and automated Planning/Review. Do not introduce storage or generic abstractions
for those capabilities. Existing board behavior remains unchanged.

## Proposed solution

### CLI contract

Add the verb-first command:

```bash
owf show view VIEW_ID
owf show view VIEW_ID --json
```

Resolve the stored instance by ID, never by title or definition path. Workspace
discovery, help, success/error envelopes and exit conventions follow existing
commands. Invocation from a Workspace descendant must produce the same result
as invocation from its root; the current Project/Outcome directory must not
implicitly narrow membership. No web server or interactive prompt is required.

Keep the existing operations distinct:

| Command             | Meaning                                                    |
| ------------------- | ---------------------------------------------------------- |
| `list views`        | Inventory of stored instances without loading definitions. |
| `get view VIEW_ID`  | Instance metadata and validated current configuration.     |
| `show view VIEW_ID` | Instance metadata and evaluated current column content.    |

Do not change the existing get/list contracts or add parallel aliases.
The command name is fixed for this proposal; exact DTO names and diagnostic
codes are implementation choices and must be documented.

### Evaluation and blocking

Load and validate the stored instance and its current definition using the 0020
reference and definition rules. Obtain supported Actions across the Workspace
and the prerequisite facts needed by the existing blocking evaluator.

Reuse existing Action dependency/blocking semantics, including manual reasons,
unsatisfied Cancelled prerequisites and established missing-target behavior.
Action archival is unavailable in schema 6, as clarified above.
Do not infer blocking from whether a prerequisite appears in this View. Waiting
alone is not blocking. Do not add Outcome dependencies, graph traversal rules,
cycle rejection or a new lint subsystem in this increment.

There are no stored placements in the supported schema. Every candidate is
therefore evaluated as unplaced:

1. If it is blocked and non-terminal and the definition contains a special
   Blocked column, assign it there.
2. Otherwise consider ordinary columns accepting its current state and blocking:
   an ordinary column accepts a blocked Action only with `include_blocked: true`.
3. Select the effective default column for that state if eligible. If it is not
   eligible, select the first eligible ordinary column in definition order.
4. If no column is eligible, the Action is outside the View.

Effective per-state defaults are those already resolved by 0020: an explicit
`defaults[state]`, otherwise the first ordinary column supporting that state.
A column's `default_status` is a future move/create target; evaluating an Action
must not use it to change or reinterpret that Action's current state.

Each Action appears at most once in this instance. Multiple columns supporting
the same state are valid and do not duplicate cards. Terminal Actions never
enter the special Blocked column; ordinary eligibility uses the existing
derived blocking result rather than a View-specific reinterpretation.

| Situation                                                        | Expected assignment                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| Unblocked Open Action; several Open columns                      | Effective Open default only.                                       |
| Blocked non-terminal Action; Blocked exists                      | Blocked, even if an ordinary column permits blocked Actions.       |
| Blocked Action; no Blocked; state default excludes blocked       | First eligible ordinary column permitting blocked Actions, if any. |
| Unblocked Waiting Action; no Waiting column                      | Outside this View.                                                 |
| Blocked Waiting Action; Blocked exists                           | Blocked, despite the omitted ordinary Waiting state.               |
| State has no eligible ordinary column and Blocked does not apply | Outside this View.                                                 |
| Externally injected archived Action in schema 6                  | Explicit invalid-data failure; archival is unsupported.            |

These are the unplaced branch of the agreed profile rules. Do not implement
hypothetical placement retention or reconciliation against nonexistent data.

With the shipped example, all unblocked Open Actions go to New to organize;
Todo, Sprint backlog and Backlog remain empty. Two instances of the same
definition evaluate the same Workspace content while retaining different
identities and titles. Independent organization arrives with persisted
placements in a later increment.

### Output and ordering

Return all configured columns in definition order, including empty columns.
Within each column use ascending Action ID with a fixed, locale-independent
comparison. This is a deterministic fallback while all members are unplaced,
not stored manual order, priority or a configurable sorting policy. Repeated
reads of unchanged inputs must produce the same column/member ordering.

Human output identifies the instance by title and ID, shows each column's title
and ID, and lists member Action IDs, titles, execution states and derived blocked
status. Make empty columns visibly empty. Preserve actual states in multi-state
columns; a column title must not substitute for execution state.

JSON exposes structured instance identity/reference and ordered columns with
their IDs, titles and member arrays. Each member includes at least Action ID,
title, execution state and derived blocked boolean. Reuse established public
Action field/state conventions; do not invent a second Action state vocabulary.
Both output modes must describe the same memberships and order.

Outside-View Actions are omitted; do not synthesize an Other column or expose a
separate diagnostic inventory. Optional counts, if included, must be derived
from the returned members. An empty Workspace, no eligible members, and a valid
zero-column definition are successful empty evaluations, not failures.
Do not persist or present the result as an immutable Snapshot.

### Read purity, errors and boundaries

Show reads current data each time. Changes to an Action or a valid shared
definition appear on the next invocation without refresh/rebuild commands.
Reads must not change Actions, instance metadata, timestamps, Markdown, placements,
ranks, schema or event logs. Do not initialize, repair or upgrade a store.

Reuse existing corruption and missing-dependency handling. Membership exclusion
must not conceal malformed candidate Action data: validate non-archived
candidates before routing, including candidates whose states have no columns.
This does not introduce a Workspace-wide Markdown conformance scan.

Unknown instance IDs, unavailable/unsupported stores, invalid instance records,
missing/invalid definitions and inconsistent definition references fail explicitly.
An evaluation failure must not produce a partial successful board or an empty
success. Validate/evaluate fully before rendering success output. Diagnostics
identify the instance and relevant definition/Action where available, using
existing CLI conventions.

Use a coherent set of store facts for one evaluation so that Actions and their
prerequisite states do not describe different moments within that read.
Reuse the existing store read facilities or a narrow read transaction where
needed; do not add persistent caching, write locks or a concurrency framework.
Externally edited Markdown and SQLite do not form a cross-representation atomic
snapshot, and the output must not claim one.

Keep eligibility, routing and deterministic ordering in domain code; application
code coordinates existing instance, definition and Action reads through ports.
CLI parsing and rendering belong in the interface adapter. Reuse blocking
logic without duplicating it in View code. Avoid speculative repositories or
changes to Action write paths.

No schema change is needed or authorized: supported schema 6 Workspaces from
0020 remain usable. Existing rejection of older/unknown versions remains.

### Documentation

During implementation update command help, the tool README, architecture's
delivered-capability summary and the single-source generated Workspace
`AGENTS.md` template. Explain get versus show, the current unplaced-only routing,
same-definition instances, fallback order and the absence of persisted placement.

Include a copyable flow using the existing definition example: create a View,
create Actions, show it, change an Action state/block and show it again.
Existing user-edited Workspace guides must not be overwritten. Keep capability
claims accurate: this proposal alone delivers no command.

## Acceptance criteria

- **AC1 — CLI access:** Given a supported Workspace and instance, show succeeds
  from the Workspace root or a descendant without a server, in human and JSON
  modes; get/list retain their existing contracts.
- **AC2 — Unique routing:** Given overlapping ordinary state sets, each eligible
  Action appears once, using the explicit/effective default and eligible fallback.
  Multi-state columns preserve actual Action states and ignore move defaults.
- **AC3 — Blocking:** Manual and dependency blocking use existing semantics.
  Unplaced blocked non-terminal Actions prefer Blocked; without it, ordinary
  inclusion and fallback apply. Waiting alone does not route to Blocked.
  Prerequisites outside the View still affect blocking; schema 6 has no archived
  target representation, as agreed in the clarification above.
- **AC4 — Exclusion and emptiness:** States unsupported by the definition and
  ineligible Actions are outside the View. Invalid stored states fail explicitly.
  Empty columns stay
  visible; empty Workspace, no eligible members and zero columns succeed.
- **AC5 — Output and order:** Both formats identify the instance and columns,
  expose member identity/title/state/blocking, preserve definition column order,
  and use ascending Action ID within columns regardless of source enumeration.
- **AC6 — Live evaluation:** Subsequent reads reflect Action state/block/dependency
  changes and valid definition edits. Same-definition instances have the same
  evaluated content but distinct identities. No membership cache is persisted.
- **AC7 — Purity and failure:** Successful, repeated, empty and failed reads leave
  semantic store data, schema, events and Markdown unchanged. Unknown instances,
  broken definitions/references and unavailable/unsupported stores fail explicitly
  without partial success. Malformed non-archived candidates cannot be hidden by
  routing exclusion.
- **AC8 — Usable documentation and compatibility:** Help, README and newly generated
  guidance describe the implemented contract and limitations. Schema 6 remains
  supported without migration; existing guides and GUI behavior remain untouched.

Executable acceptance scenario:
[A View reflects current work without changing it](../../tests/acceptance/features/view-evaluation.feature).

## Verification plan

Use distinct behavioral and boundary tests, not a test-count target or the same
full matrix at every layer.

| Risk / criteria                                                  | Verification                                                                                                                                                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unique routing, eligibility and deterministic fallback (AC2–AC5) | Focused domain cases covering overlapping states, explicit defaults, blocked fallback, terminal exclusion from Blocked, omitted states and shuffled input order.                                   |
| Real dependency facts and live reads (AC3, AC6)                  | Integration with SQLite, current Markdown and existing Action operations; include a prerequisite outside the View and Cancelled/Completed disposition. Archived data is unsupported in schema 6.   |
| Read purity and errors (AC7)                                     | Semantic before/after store and file comparisons for success/failure; cover malformed excluded candidates and broken definitions/store errors. Avoid byte comparisons of SQLite bookkeeping files. |
| Observable behavior (AC2, AC3, AC6)                              | Small Cucumber journey through the real application boundary, based on the scenario above.                                                                                                         |
| CLI and guidance (AC1, AC5, AC8)                                 | Built-CLI journey covering human/JSON results, descendant invocation and a failure exit; verify help/examples and new Workspace guidance.                                                          |

Run required `npm run verify` before implementation handoff and record the
revision, platform and actual results. No new browser scenarios are required
because GUI behavior is unchanged; existing required gates still apply.

Human try-out:

1. Use a supported Workspace and the example definition from 0020.
2. Create a named instance and several Open, Waiting and Completed Actions.
3. Show the View in human and JSON modes; verify omitted states and empty columns.
4. Manually block an Open Action and show it again; clear the block and repeat.
5. Change the definition's Open default to Todo; show the same instance again.
6. Break the definition temporarily: show must fail, while list still inventories
   the instance. Restore it and show succeeds.

## Open questions

No blocking product questions remain in this proposal. DTO names, diagnostic
codes and module decomposition are implementation choices within the contract.
The user reviewed and approved this document for implementation on 2026-10-22.

## Implementation and review outcome

Implemented `owf show view VIEW_ID [--json]` through the shared application
boundary. Domain routing returns every configured column, chooses one eligible
column per Action, preserves current execution state and derived blocking, and
orders members by fixed ascending Action ID. Application reads use the existing
instance/definition ports and the Action repository's coherent candidate and
prerequisite read. No schema, write operations, placements, events or GUI behavior
were added or changed.

The public application DTO is `ShowViewResult`: the standard success envelope
contains `result.status: evaluated`, `type: view`, `root`, stored `view` metadata,
and `columns: [{ id, title, members: [{ id, title, state, blocked }] }]`.
Diagnostics reuse `VIEW_NOT_FOUND`, `VIEW_READ_FAILED`,
`INVALID_VIEW_DEFINITION`, `INVALID_VIEW_REFERENCE`, `ACTION_READ_FAILED` and
existing Workspace/store codes. Show adds instance/definition context; Action
validation includes source ID and missing prerequisite identity where available.
Get/list result contracts remain unchanged.

Tests cover routing/fallback/terminal blocking, real dependency and definition
changes, separate instance identities, root/Project context equivalence, empty
results, malformed omitted candidates, unknown instances, definitions/references,
invalid/old/unknown/missing stores, and semantic read purity. The executable
acceptance journey above uses real application operations. Built-CLI tests compare
human and JSON output, verify failures without partial success and preserve
user-edited guides; the existing guide-example journey executes the new flow.
Help, README, architecture summary, example and the single-source Workspace guide
describe unplaced routing and its limitations.

The only scope clarification is the user-approved archival limitation above.
Persisted placement/manual order and a cross-representation atomic snapshot remain
outside scope. Independent code review is pending; both increment records remain
`in_progress` as requested.

Verification on 2026-10-22:

- Verified implementation revision: `a9548c391bc4848422b5793cabcc4ba4060bdedb`.
  This subsequent handoff update changes only the verification record.
- Platform: Windows x64 (`win32`, Windows NT 10.0.26300.0), Node.js 24.21.0,
  npm 11.4.1. Linux verification was not performed.
- Focused domain/View integration run: 3 files, 30 tests passed.
- The initial complete gate found a new guide-example placeholder mismatch
  (`{action-id}` versus the established `{id}`). Corrected the guide; the focused
  built-CLI guide-example test passed before the implementation commit.
- Final `npm run verify` on the revision above: **passed**, exit 0. Typecheck,
  ESLint, Prettier, architecture (53 modules, no violations), production build,
  149 unit tests, 211 integration tests, 32 Cucumber scenarios (181 steps),
  25 built-CLI tests and all 7 existing Chromium journeys passed.
- Windows sandbox blocked Vite/Vitest helper startup with `spawn EPERM` during
  an intermediate focused rerun. Build/test retries and the final complete gate
  ran outside that sandbox successfully; no checks were weakened or disabled.
- `git diff --check` passed. The documentation-only handoff update was formatted
  and checked separately; implementation/test/configuration files did not change
  after the verified revision.

No unresolved implementation findings are known. Independent code review has
not been performed in this session and remains the next gate. No merge, version
change, tag or release was performed.

## Decision changes and follow-up

- 2026-10-22: User accepted read-only CLI evaluation as the next increment;
  this draft makes the proposed command, routing, output and verification precise.
- 2026-10-22: User reviewed the detailed document and approved implementation;
  status changed to reviewed.
- 2026-10-22: Implementation started; document and index changed to in_progress.
  User approved retaining schema 6 without Action archival/archived prerequisites;
  externally injected archived data is rejected explicitly. No schema change or
  new archival interpretation was introduced.
- Persisted placements and CLI moves are the next candidate. That increment must
  define atomic Action/placement writes and reconciliation before introducing
  instance-specific organization. It is not authorized by this document.
