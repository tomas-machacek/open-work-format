# 0023 — Move Actions between View columns through CLI

> Status: in_progress
> Description: Move an existing Action into a View column, atomically applying column effects and storing instance-local placement.
> Depends on: [0020](0020-view-instance-cli-foundation.md), [0021](0021-view-evaluation-cli.md), [0022](0022-web-view-display.md), and existing Action state/block/dependency operations.

## Goal and scope

Make same-state organization useful: move an Open Action from New to organize
to Todo, Sprint backlog or Backlog without changing its identity or ownership.
Moves to columns representing other states apply the agreed state and blocking
rules. CLI show and the existing passive web View display the result.

Authority: [Views profile](../../../../docs/design/views-profile-notes.md),
[Core](../../../../spec/core-v0.md), [Operational Store notes](../../../../docs/design/operational-store-notes.md),
[architecture](../architecture.md), and [development guidelines](../development-guidelines.md).

Included:

- A noninteractive CLI move operation and a shared application operation.
- Persistent current placement, independently per View instance.
- Ordinary and special Blocked destinations, including validation and rollback.
- Placement-aware shared evaluation and reconciliation on supported writes.
- Required schema, event, documentation and generated Workspace guide changes.

Deferred:

- Manual ordering, ranks, before/after positions and reorder commands.
- Web movement controls/endpoints, drag and drop in Views, and creation in a column.
- Selecting a non-default destination state, arbitrary filters and transition hooks.
- View/definition editing commands, placement repair commands, Snapshots and windows.
- Action archival, Outcome dependencies, migrations and unrelated refactoring.

This slice retains ascending Action ID order from 0021 for all column members,
including explicitly placed Actions. A moved card is not promised to appear at
the bottom. Manual ordering and append-on-arrival behavior belong to a later
CLI increment. This is an explicit partial delivery of the full profile.

## Proposed solution

### CLI contract

Proposed command:

```text
owf move action ACTION_ID --view VIEW_ID --column COLUMN_ID [--reason TEXT] [--waiting-for TEXT] [--json]
```

IDs identify the existing Action, stored View instance and definition-local
column. Titles are not selectors. Resolve the Workspace using existing rules,
including invocation from descendants; do not narrow the View by current owner.
No running web server or interactive prompt is required.

An Action may be moved even if it is currently outside this View, provided the
result satisfies the destination and Action rules. Determine the source from
current evaluated membership, not a possibly obsolete stored placement.

Human and JSON results identify the Action, View, evaluated source (nullable),
destination, resulting state/blocking and whether anything changed. Reuse
existing envelopes, state vocabulary, exit codes and diagnostics conventions.
Do not return success until commit. Unknown IDs, invalid input, broken definitions,
unavailable/unsupported stores and rejected moves fail explicitly.

The reason option supplies a manual-block reason only when entering Blocked.
Reject it for ordinary destinations and same-column no-ops; never ignore an
option that suggests a semantic change.

The optional `--waiting-for TEXT` supplies the Action's shared `waiting_for`
reason during a move to an ordinary column whose effective destination state is
`waiting`. Eligibility depends on `default_status` (or the first listed state),
not the column title or merely having `waiting` among its supported states.
For example, with a column ID `waiting-for` whose default state is `waiting`:

```text
owf move action ACTION_ID --view VIEW_ID --column waiting-for --waiting-for "Odpoveď dodávateľa"
```

Reuse the existing [0005 waiting-reason contract](0005-action-state.md):
supplied text must contain a non-whitespace character and is preserved verbatim.
Entering `waiting` without the option starts without a reason. When moving an
already Waiting Action to another column with default `waiting`, omission
preserves its reason and supplied text replaces it. Leaving `waiting` clears
the reason. Clearing it while remaining Waiting is not added here.

Reject `--waiting-for` for a different effective destination state, entry into
Blocked (even if the preserved state is Waiting), and same-column requests.
Those requests must not silently discard the input or become reason-only edits;
existing Action editing remains available for that purpose. A valid move from
Blocked to an ordinary Waiting column may supply the option, subject to the
usual dependency checks. Manual-block `--reason` and `--waiting-for` have
distinct purposes and cannot be combined in this command.

State, waiting reason, placement and their events commit atomically. Failed
input validation or a rejected move preserves the previous reason as well as
all other data. Human and JSON move results include the resulting waiting reason
when present.

### Move effects

| Evaluated source and target                        | Result                                                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Different column or outside View → ordinary column | Set target default_status (or first listed status) and persist target placement.                                |
| Different column or outside View → Blocked         | Preserve execution state, set the supplied manual reason or reuse an existing valid one, and persist placement. |
| Blocked → ordinary column                          | Require no unresolved dependency block, clear manual block, set target default state and persist placement.     |
| Already displayed in target column                 | Successful no-op; no default-state reset, block change, placement pinning, timestamp or event.                  |

A same-column request does not implement reordering. In particular, an Action
in a multi-state column keeps its actual state on that request.

Entering Blocked requires a non-empty reason unless an existing valid manual
reason can be reused. Whitespace-only supplied input fails rather than falling
back silently. Terminal Actions cannot enter Blocked. Dependency blocking alone
does not substitute for the manual reason required by an explicit move.

Leaving the evaluated Blocked column fails while any dependency remains
unresolved, even if the ordinary destination includes blocked Actions or uses
Cancelled as its default. Rejection preserves the existing manual reason.

Moves between ordinary columns do not implicitly clear manual blocks.
include_blocked allows a blocked Action to remain eligible; it does not create
or remove a block. Apply existing Action transition rules, including waiting
metadata cleanup, terminal/manual-block constraints and completion prerequisites.
Do not remove dependencies or invent state-transition exceptions.

Validate the full candidate after all effects. Final evaluation must put the
Action exactly once in the requested destination. Column defaults apply only
to actual cross-column moves, never on reads or ordinary detail saves.

### Placement and evaluation

Store at most one current placement per (instance ID, Action ID), referring to
the column ID. Do not copy Action state/content/ownership into instance data.
No ranks or historical previous-column fields are introduced.

Extend the existing shared evaluator: retain an eligible stored placement;
otherwise apply existing Blocked/default/fallback routing. A blocked Action
already placed in an ordinary include_blocked column stays there. Unplaced
Actions retain 0021 behavior. Definition order and ascending member ID order
remain unchanged.

Two instances using one definition can now organize the same Open Action
differently. A move writes the requested destination only in the selected
instance. A shared Action state/block change can invalidate placements in other
instances; retain their eligible placements and discard invalid ones without
copying the selected destination into them.

A removed referenced column is a configuration error, not ordinary ineligibility.
Do not silently discard that reference. Restoring its stable ID in Markdown is
the available repair in this slice. Changing a title preserves identity; changing
defaults does not displace a still-eligible placement. Known columns that cease
to accept an Action use normal rerouting.

CLI show and web display must consume the same placement-aware evaluation.
Existing refresh reveals CLI changes without restarting the server. View cards
remain passive; Default Kanban retains its current operations.

### Write-side reconciliation and atomicity

Supported writes must prevent old placements from returning after observed
departure. Reuse one domain eligibility/routing implementation across reads and
writes; do not independently implement rules in SQLite, CLI or React.

For a successful operation that can affect membership:

1. Load current placements, relevant current definitions and coherent Action/
   prerequisite facts.
2. Identify invalid placements against the pre-change facts, before applying a
   change that could make an obsolete placement eligible again.
3. Apply the proposed Action effects and explicit destination, then reconcile
   invalid placements against the resulting facts.
4. Persist the Action changes, placement additions/removals and corresponding
   events in one SQLite transaction.

Removal leaves an Action unplaced; normal evaluation supplies fallback routing.
Do not materialize every inferred membership as an explicit choice.

Cover existing CLI and HTTP Action state, block and dependency writes, including
shared detail editing and Default Kanban transitions. A prerequisite's state
change can affect placements of its direct dependents; reconcile those as well.
Re-evaluate affected Actions in every instance with their stored placements.
A same-state organizational move that changes no Action fields must not change
its updated_at or produce a fake Action state-change event. If --waiting-for
changes the reason during a cross-column move while remaining Waiting, update
Action metadata and record the actual reason change using existing conventions;
do not report a state change that did not occur.

Missing/invalid definitions or removed column references needed to reconcile an
affected stored placement reject the write with instance/definition context.
An unrelated broken View with no affected placement must not block an Action
operation. Read-only instance inventory remains available for diagnosis.

All validation and affected store facts must be checked within the operation's
transaction boundary, using current facts rather than an earlier CLI rendering.
Retain existing HTTP stale-edit protection; no new distributed concurrency system
is required. Definition reads are not a filesystem/SQLite atomic snapshot.

A failed operation, including failure after writing Action data or during event
insertion, rolls back all effects and reconciliation. Do not perform cleanup as
a side effect of a rejected move. Record actual changes using the existing
Operational Event Log conventions; current placements, not events, are authority.

### External changes and the read-purity boundary

Reads must remain semantically write-free: no cleanup, timestamps, schema changes,
events or persistent "observed departure" markers. On a read, an ineligible
placement is ignored logically. The next relevant successful write reconciles
the current pre-change and post-change facts.

Clarification agreed on 2026-10-27: durable departure tracking is guaranteed for
supported writes; read-only observations of external edits are not durable
history. Current external invalidity is reconciled on the next relevant
successful write. If an external definition edit makes a placement ineligible
and is then reverted before such a write, the stored placement may become valid
again, even if a read observed the intermediate definition. Do not add hidden
writes, process-local membership caches or copied definitions to imply a
stronger guarantee. The tool does not repair user-edited definitions on reads.

The user also confirmed that Action state/block/dependency operations reconcile
affected placements across View instances atomically, including when invoked
outside a View. For example, changing an Action from Open to In Progress removes
its placement in an Open-only Todo column; later returning to Open uses default
routing, not the old Todo placement. A placement in a column accepting both states
survives. A broken definition required for this reconciliation rejects the whole
operation, as specified above.

### Schema, boundaries and documentation

Introduce schema 7 for current placements, assuming main remains at schema 6.
Follow the existing PoC policy: initialize new Workspaces at the supported
version, reject older/unknown versions without mutation, and add no implicit
migration or replacement store. Existing schema 6 Workspaces are therefore not
usable with the new tool until a separately designed migration exists; document
this explicitly. Do not add archival as part of the schema change.

Keep movement/eligibility in domain, orchestration through application ports,
transactions in infrastructure and argument/output handling in CLI. Reuse the
existing show/display read path and Action mutation rules.

During implementation update help, README, architecture's delivered capabilities,
and the single-source generated Workspace AGENTS.md template. Preserve existing
user-edited guides. Explain instance-local placement versus shared Action state,
same-column no-op, Blocked rules, schema compatibility and deferred manual order.
Provide copyable same-state, Blocked and Waiting-with-reason examples using real
command syntax. Explain optional --waiting-for, preservation/replacement/cleanup,
and rejection for inapplicable destinations or same-column requests.

## Acceptance criteria

- **AC1 — CLI access:** Move works from root/descendants without a server, with
  matching human/JSON semantics and explicit failures for invalid IDs/options.
- **AC2 — Same-state organization:** Moving Open from New to Todo persists across
  process restarts, changes only selected-instance organization and creates no
  Action state/timestamp change. Other instances retain eligible placements.
- **AC3 — State effects and no-op:** Cross-column moves use destination defaults,
  including multi-state columns; same-column requests never reset state or write.
  An outside-View Action may enter a valid destination.
- **AC4 — Blocking:** Entering Blocked preserves state and requires/reuses a valid
  reason; terminal entry fails. Leaving rejects unresolved prerequisites,
  including include_blocked targets, without losing manual reason.
- **AC5 — Final eligibility and rollback:** Candidate Action rules and target
  acceptance are enforced. Validation, persistence and event failures leave
  Action, placements, timestamps and events unchanged.
- **AC6 — Reconciliation:** Supported state/block/dependency changes through CLI
  and HTTP discard invalid placements across affected instances and dependents.
  Pre-change residue cannot be revived by the operation. Clearing a later block
  does not restore an old Todo placement. Eligible placements survive.
- **AC7 — Shared reads:** Show and web display agree after refresh, contain each
  Action at most once and preserve ascending ID order. Reads remain pure.
  Invalid references fail explicitly; inventory still works.
- **AC8 — Compatibility and scope:** New schema rejects unsupported stores without
  mutation; documentation and generated guide match behavior. No View drag/drop,
  ordering, creation, arbitrary filters or state-choice capability is added.
- **AC9 — External-edit boundary:** Reading a temporarily incompatible definition
  leaves stored placement unchanged. Restoring that definition before a relevant
  write may restore eligibility. A successful relevant write while the placement
  is ineligible removes it permanently; subsequent restoration does not revive it.

- **AC10 — Waiting reason:** A cross-column move whose effective target state is
  Waiting accepts optional nonblank --waiting-for, preserving supplied text
  verbatim. Test entry with/without a reason, replacement/preservation between
  two Waiting columns, and cleanup on leaving Waiting. Invalid, blank,
  same-column and non-Waiting-target input fails without writes; a multi-state
  target supporting Waiting but defaulting elsewhere also rejects the option.
  Blocked exit to Waiting accepts it only if the entire move is valid. Results
  expose the saved reason; rollback preserves the previous reason and placement.

## Verification plan

Use focused cases with distinct failure reasons, not the full matrix at every
layer.

| Risk                                       | Verification                                                                                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Move effects, eligibility, no-op (AC3–AC4) | Focused domain cases for ordinary/multi-state/Blocked columns and outside-View source.                                                                                                      |
| Persistence and isolation (AC2, AC6)       | Real SQLite integration with two instances, process reopen, state/block changes and direct dependents.                                                                                      |
| Atomicity (AC5, AC10)                      | Inject failure after Action/waiting-reason write and during event write; compare semantic data before/after.                                                                                |
| Waiting context (AC10)                     | Focused domain cases for optional/literal text, preservation/replacement/cleanup and invalid destinations; built-CLI example plus persisted reason in existing Action detail after refresh. |
| External edits and errors (AC7, AC9)       | Definition default/title/support changes, removed column, broken affected/unrelated definition, pre-change residue and pure reads.                                                          |
| User contract (AC1, AC8)                   | Built-CLI flow, JSON/human output, descendant invocation, errors, unsupported schema and generated guide examples.                                                                          |
| Passive web integration (AC6–AC8)          | Small existing-style browser journey: CLI placement → refresh View → detail block edit → refresh; retain passive controls and Default behavior.                                             |

Canonical executable acceptance journeys for independent organization and rejected
Blocked exit: [view-move.feature](../../tests/acceptance/features/view-move.feature).

Human try-out: create a fresh Workspace, two instances and Open Actions; move one
to Todo in only one instance; compare CLI and browser; move it to Blocked with a
reason; reject exit while a prerequisite remains unresolved; resolve that
prerequisite, move out and verify state, placement and refresh.

Run required npm run verify for implementation handoff and record actual revision,
platform and results. Actual implementation verification is recorded below.

## Open questions

No blocking product questions remain. The user resolved the external-edit and
cross-View reconciliation questions on 2026-10-27. The user reviewed and approved
the full increment for implementation on 2026-10-27.

- SQL layout, result field names and narrow module extraction are implementation
  choices within this contract.

## Implementation and review outcome

Implemented the approved CLI/application move, schema 7 placements and placement
events, shared placement-aware evaluation, and transactional reconciliation for
existing CLI/HTTP Action mutations and direct dependents. No deferred 0024 behavior
was added. Status remains `in_progress` pending the separate independent code review.

Domain cases cover defaults, outside-View entry, same-column no-op, Blocked and
Waiting options. SQLite/HTTP tests cover independent instances, retained and
discarded placements, pre-change residue, external edits, broken affected versus
unrelated definitions, completion guards, stale writes and semantic rollback after
Action writes, Action/View events, placement writes and deferred commit failure.
The built CLI exercises descendant discovery, human/JSON results, generated-guide
examples and rejected options/schema 6. The browser journey covers CLI placement,
refresh, shared detail blocking, Waiting reason persistence and Default Kanban
transitions, while retaining passive View cards.

Waiting-reason-only updates now use `action.updated` with actual changed fields
and old/new reasons, including existing Action editing, so they do not claim a
state transition. State changes retain the established event conventions.
README, help, architecture, example prose and the single-source generated Workspace
AGENTS.md template describe delivered behavior. Existing user-edited guides remain
preserved. The generated guide includes a Waiting column for its copyable example;
the smaller standalone example can be extended with the README snippet.

Verified implementation revision:
[`b9b54460188729bb91d194916895534f9b998610`](https://github.com/tomas-machacek/open-work-format/commit/b9b54460188729bb91d194916895534f9b998610),
2026-10-27. The subsequent evidence-only documentation commit does not change
implementation or tests. Platform: Windows NT 10.0.26300.0 x64, Node 24.21.0,
npm 11.4.1, Chromium through Playwright.

Final `npm run verify`: **passed, exit 0**. This included:

| Check                         | Actual result                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| Typecheck, ESLint, Prettier   | Passed, including tests/configuration                                                                 |
| Architecture                  | Passed: 59 modules, 190 dependencies, no violations                                                   |
| Production build              | TypeScript and Vite passed                                                                            |
| Unit/component tests          | 174 passed in 12 files                                                                                |
| SQLite/HTTP/other integration | 231 passed in 15 files                                                                                |
| Cucumber                      | 34 scenarios and 193 steps passed, including both new move journeys                                   |
| Built CLI E2E                 | 26 passed in 3 files, including all generated guide examples                                          |
| Chromium E2E                  | 10 passed, including CLI placement/Waiting refresh, detail blocking and desktop/mobile existing flows |

Focused domain/SQLite/HTTP cases, the two new Cucumber scenarios (12 steps), and
the new browser journey also passed during development.
Initial sandboxed Vite/Cucumber/Playwright execution encountered `spawn EPERM`;
reruns outside the sandbox succeeded. An initial CLI journey exceeded Vitest's
default 5-second timeout; it uses the existing CLI suite's 30-second Windows
process-startup allowance, with all assertions retained. Existing tests were
updated to assert real state transitions separately from reason-only events and
the new placement-aware guide wording. Executing every generated example caught
new placeholder spelling inconsistent with the existing guide runner; the guide
now consistently uses its established `{id}` / `{view-id}` placeholders. Earlier
verification attempts stopped on those stale expectations/example issues; the
final complete command above passed after the fixes. No check was disabled,
skipped or relaxed.

Limitations follow the approved scope: schema 6 has no migration path; fresh
schema 7 Workspaces are required. Reads do not durably record temporary external
incompatibility; filesystem definitions and SQLite are not one atomic snapshot.
Manual ordering, append-on-arrival, View movement in the web, creation in a column
and destination state choice remain deferred. Linux verification and independent
code review have not been performed. No merge or release is part of this handoff.

Manual try-out (use `node <absolute-tools/owf>/dist/bootstrap/cli.js` for `owf`
when it is not installed on PATH): initialize a fresh disposable directory with
`owf init`, copy [work-board.md](../examples/work-board.md) into its `_views/`,
and create two instances referencing `/_views/work-board.md`. Create an Open
Action and a prerequisite with `owf create action --title "Work" --json` and
`owf create action --title "Prerequisite" --json`; replace the IDs below:

```sh
owf move action ACTION_ID --view FIRST_VIEW_ID --column todo --json
owf show view FIRST_VIEW_ID
owf show view SECOND_VIEW_ID
owf move action ACTION_ID --view FIRST_VIEW_ID --column blocked --reason "Missing access"
owf set action ACTION_ID --add-dependency PREREQUISITE_ID
owf move action ACTION_ID --view FIRST_VIEW_ID --column todo
owf get action ACTION_ID --json
owf set action PREREQUISITE_ID --state completed
owf move action ACTION_ID --view FIRST_VIEW_ID --column todo
owf serve
```

The unresolved exit must fail without losing its manual reason. In the browser,
select each instance and use Refresh after further CLI changes; only the first
keeps Todo. Add the README's Waiting column to try the documented
`--column waiting-for --waiting-for "Odpoveď dodávateľa"` command and inspect the
saved reason in Action detail after refresh.

## Decision changes and follow-up

- 2026-10-26: User agreed to CLI-first column moves as the next increment;
  detailed proposal prepared for review.
- Manual ordering is a separate future CLI increment; web movement follows CLI.
- The initial conversation mentioned filters, but the agreed simplified profile
  has no arbitrary filters. This document follows its state/blocking eligibility.

- 2026-10-27: User requested optional waiting reason during a move to Waiting.
  Added --waiting-for using existing Action reason semantics; same-column moves
  remain no-ops without semantic options, and invalid options fail explicitly.

- 2026-10-27: User accepted pure reads with no durable tracking of temporary
  external definition changes, and atomic cross-View placement reconciliation
  on Action writes, including failure for a required broken definition.

- 2026-10-27: User reviewed and approved the full increment for implementation;
  status changed to reviewed. Implementation and independent code review remain pending.

- 2026-10-27: Implemented the approved scope; status is `in_progress`. Independent
  code review follows in a separate session; completion and release remain separate.
