# 0024 — Persist and change View column order through CLI

> Status: in_progress
> Description: Reorder Actions within a View column and choose a persistent insertion position on cross-column moves.
> Depends on: [0023](0023-view-move-cli.md), including its agreed reconciliation contract.

## Goal and scope

Let the user arrange a column deliberately and retain that order across CLI
processes and browser refreshes. Moving an Action between columns inserts it
at the requested destination position and preserves the relative order of all
other cards. Order belongs to a concrete View instance, not to the Action or
the reusable definition.

Authority: [Views profile](../../../../docs/design/views-profile-notes.md),
[Core](../../../../spec/core-v0.md#12-views),
[Operational Store notes](../../../../docs/design/operational-store-notes.md),
[architecture](../architecture.md) and [development guidelines](../development-guidelines.md).

Included:

- Numeric, one-based positions on the existing CLI move command.
- Same-column reorder and cross-column insertion through the shared application.
- Durable instance/column-local order, arrival/departure reconciliation and
  atomic persistence with Action effects, placements and events.
- Position-aware CLI output and ordered passive web display.
- Help, generated Workspace guide and schema/documentation changes.

Deferred: View drag/drop and other web movement controls, before/after selectors,
bulk reorder, automatic sorting, priority fields, creation directly in a chosen
column, state choice on a move, Snapshots, archival and migrations.

0023 remains the historical contract for placement-only moves. This increment
replaces its ascending-ID member order and adds positional same-column moves;
its state, blocking and validation rules otherwise remain applicable.

## Proposed solution

### CLI contract

Extend the command delivered in 0023:

```text
owf move action ACTION_ID --view VIEW_ID --column COLUMN_ID [--position N] [--reason TEXT] [--waiting-for TEXT] [--json]
```

Keep the column required, including same-column reordering. No separate reorder
command or interactive prompt is needed. IDs retain 0023 selection semantics.

N is the final one-based position in the destination's complete evaluated list.
It is not an Action ID, a database rank, or a position in a filtered UI subset.
Accept a positive decimal integer representable safely by the implementation;
reject zero, negative, fractional, nonnumeric, unsafe and out-of-range input.
Do not clamp an invalid position or silently append.

To calculate the insertion, remove the moved Action from the destination list
if already present, then insert it at N. If that remaining list has M members,
the allowed range is 1 through M + 1.

| Situation                                            | Allowed position |
| ---------------------------------------------------- | ---------------- |
| Same column with K cards, including the moved card   | 1 through K      |
| Different column or outside View; target has K cards | 1 through K + 1  |
| Empty destination                                    | 1                |

Examples, with letters denoting distinct Action IDs:

| Before                         | Request         | After                       |
| ------------------------------ | --------------- | --------------------------- |
| A, B, C, D                     | D to position 3 | A, B, D, C                  |
| A, B, C, D                     | B to position 3 | A, C, B, D                  |
| A, B, C, D                     | D to position 1 | D, A, B, C                  |
| A, B, C, D                     | C to position 3 | Unchanged; successful no-op |
| Target A, B, C, D; X elsewhere | X to position 3 | A, B, X, C, D               |

These examples specify the observable behavior, not a requirement to persist
dense numeric indices or rewrite every subsequent database row.

### Omitted position and move effects

| Request                                             | Behavior                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------- |
| Same evaluated column, explicit different position  | Reorder only.                                                           |
| Same evaluated column, same position                | Successful no-op.                                                       |
| Same evaluated column, position omitted             | Successful no-op, preserving 0023 compatibility.                        |
| Different column or outside View, explicit position | Apply 0023 move effects and insert at N.                                |
| Different column or outside View, position omitted  | Apply 0023 move effects and append after all current destination cards. |

Same-column reorder preserves actual state (including non-default state in a
multi-state column), owner, content, waiting metadata, manual reason, dependencies
and Action updated_at. It also preserves whether placement was explicit or
inferred: recording order must not pin a previously inferred placement.

Reordering inside Blocked needs no manual reason and works for a card blocked
only by dependencies. Reject --reason on every same-column request, including
a reorder: it is not an alternative block-edit operation. Reject --waiting-for
on every same-column request as in 0023; reordering cannot edit Waiting context.

Cross-column moves retain all 0023 rules, including default destination state,
manual reason requirements on entering Blocked and dependency checks on leaving.
Preserve 0023's --waiting-for behavior, including validation against the effective
destination state and preservation, replacement or cleanup of the Waiting reason.
A position never bypasses those rules. Other instances may reroute due to shared
Action effects; they do not inherit the selected instance's destination or N.

A no-op writes no timestamps, events, placement pins or order normalization.
Actual reorder records a View organization event, not an Action state change.
Internal renumbering is not a series of user moves.

### Reading and reporting positions

owf show view VIEW_ID displays the current position beside each Action, restarting
at 1 in every column. Its JSON output exposes the corresponding numeric position
and returns members in that order. Empty columns remain visible.

Move output extends the 0023 result with evaluated source position (nullable for
outside-View Actions) and resulting destination position, plus changed.
Positions describe committed results, not immutable identifiers.
Retain existing output envelopes, error conventions and Workspace discovery.

CLI show, HTTP View evaluation and passive web cards use one shared ordered
evaluation. React must not sort these cards by ID, title or state after receiving
them. Existing refresh reveals changes; visible position badges in the browser
are not required. Default Kanban retains its existing behavior.

### Durable ordering and arrivals

Persist current ordering separately in meaning from explicit placement. Both
inferred and explicitly placed members can have an order entry without changing
their routing semantics. Store no copied Action state, historical position or
previous-column restoration data.

Preserve relative order among continuing members. Departure removes the old
position and closes the displayed gap. Arrival without an explicit position
appends; returning to a former column is a new arrival, never restoration of
the previous position. Position numbers of other cards may consequently change.

Order must survive process restart. Changing title, owner or other content
without changing evaluated membership must not reorder cards. A state/block
change that leaves a card eligible in the same evaluated column preserves order.
A change that routes it elsewhere discards the old order and appends at the
destination. Apply the same rules to directly affected dependents.

New View instances establish their initial member order in ascending Action ID
order as part of the instance-creation write. Thereafter supported writes that
introduce arrivals preserve existing members and append arrivals. Multiple
arrivals in one operation use ascending Action ID as their deterministic
tie-breaker; arrivals from successive committed operations keep commit order.
This tie-breaker is not an automatic sort of existing members.

Cover normal Action creation through CLI and HTTP as well as state, block,
dependency and placement writes. Newly created Actions must not jump ahead of
existing cards merely because their IDs compare lower. Initial order recording
does not materialize inferred membership as explicit placement.

### Reconciliation, pure reads and atomicity

Extend 0023's pre-change and post-change reconciliation to ordering. Use current
evaluated membership, not an obsolete stored column or a prior CLI rendering.
Within the transaction, reconcile relevant pre-change departures, apply the
candidate effects, evaluate resulting membership, preserve continuing order,
remove departed positions and insert arrivals or the explicit requested move.
Validate N against the final destination membership after effects, excluding
the moved Action. Keep unaffected cards in their existing relative order.

Action data, explicit placements, ordering and operational events commit together.
Invalid positions, rejected moves, persistence failures and event failures roll
back everything, including any attempted reconciliation or rank normalization.

Include instances with order data in the affected-data analysis even if they
have no explicit placements. A new arrival can require appending to an instance
where it previously had no entry. Do not examine only placement rows.

The broader arrival guarantee requires evaluating instances potentially affected
by membership-changing writes, including Action creation. If a needed definition
cannot be evaluated, reject that write with instance/definition context rather
than silently losing arrival order. A broken instance proven unaffected need
not block the operation. Instance inventory remains available. This expands
0023's affected-data check beyond explicit placement references and must be
documented as part of implementation.

Reads remain write-free. For external Markdown changes, ignore currently invalid
order logically, retain valid continuing entries and append currently unrecorded
members in ascending ID order after them. The next relevant successful write
records the evaluated order and reconciles departures. A read does not create
durable arrival history; multiple external arrivals between writes have no
recoverable chronology.

Inherit the explicit external-edit/read-purity resolution from 0023: changes
reverted before a supported write cannot be reconstructed. Do not claim that
read-only observation permanently discards a position. Removed column IDs still
referenced by order data are configuration errors, just as placement references
are in 0023; do not silently delete them.

Use current transaction facts and the existing bounded SQLite concurrency
behavior. A position is resolved when the command executes, not against a saved
screen revision. No new optimistic board revision or distributed locking system
is introduced. Preserve existing HTTP stale-edit protections.

### Persistence, boundaries and documentation

Physical sequence/rank representation is an implementation choice. Require
unique membership, deterministic total order and no exposed internal rank.
Reject contradictory persisted order explicitly rather than hiding corruption
by an arbitrary sort. Membership/routing remains authoritative over order data.

Plan schema 8 on top of the delivered schema 7; confirm the actual predecessor
during implementation. Follow the existing PoC no-migration policy: initialize the
supported version and reject older/unknown versions without mutation. Document
that older Workspaces cannot be opened by the new tool without a separately
designed migration; this increment does not provide one.

Keep ordering/eligibility rules in domain, coordination in application,
transactional storage in infrastructure and formatting in CLI/HTTP/web adapters.
Update architecture's delivered capabilities, README, help and the single-source
generated Workspace AGENTS.md template. Preserve existing user-edited guides.
Document position bounds, final-index semantics, append behavior, independent
instances, pure reads and the wider definition-validation impact on writes.

## Acceptance criteria

- **AC1 — Numeric insertion:** The examples and bounds above work, including
  upward/downward moves, first/last positions and an empty target. Invalid input
  fails without any persistent change.
- **AC2 — Same-column semantics:** Reorder preserves all Action data and inferred
  versus explicit placement. Multi-state and dependency-only Blocked cards can
  reorder without state reset or a new reason. --reason and --waiting-for are
  rejected for all same-column requests.
- **AC3 — Cross-column insertion:** Explicit N inserts at the final index; omission
  appends. Other cards retain relative order. 0023 state/blocking rules remain
  enforced, including --waiting-for behavior; rejected moves preserve source and
  destination order and Waiting metadata.
- **AC4 — Durability and independence:** Reopen the store and refresh the browser;
  order remains identical. Two instances can order the same Actions differently.
  A pure reorder changes no other instance.
- **AC5 — Arrivals and departures:** CLI/HTTP creation and membership-changing
  writes append new members, retain continuing order, remove departed positions
  and reconcile affected dependents/instances. A returning Action gets a new
  position. Simultaneous arrivals use ID order; successive writes preserve arrival
  order even when IDs would sort differently.
- **AC6 — Reads and output:** CLI and web agree; show and move expose correct
  one-based positions. Repeated reads do not mutate semantic data. External edits,
  broken references and read-purity limitations match the stated contract.
- **AC7 — Atomicity and no-op:** Failures after Action/order writes or at event
  insertion roll back the whole operation. Same position and omitted-position
  same-column requests create no writes/events. Reorder records only appropriate
  View organization changes.
- **AC8 — Integration and scope:** Schema rejection is nonmutating; help, README
  and generated guide agree with behavior. Passive Views remain passive. No
  automatic sorting, web move endpoint or priority semantics are introduced.

## Verification plan

Use focused tests for distinct risks, not a full matrix duplicated at every layer.

| Risk                                                    | Verification                                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Final-index insertion and bounds (AC1–AC3)              | Domain cases for both directions, first/last/empty, no-op and rejected inputs.                                                 |
| Persistent ordering and independent instances (AC4–AC5) | Real SQLite integration with reopen, two instances, inferred membership and arrivals whose IDs sort before existing members.   |
| Reconciliation and pure reads (AC5–AC6)                 | Supported CLI/HTTP writes, dependent changes, departure/return, definition edits and broken required references.               |
| Atomicity and events (AC7)                              | Inject failures after Action/order writes and at event insertion; compare semantic data before/after.                          |
| User contract (AC1, AC6, AC8)                           | Built CLI show/move flow, human/JSON positions, invalid options, descendant invocation, schema rejection and guide examples.   |
| Passive browser order (AC4, AC6, AC8)                   | One focused journey: CLI reorder and cross-column insertion, refresh and inspect order without introducing View drag controls. |

Canonical executable acceptance journeys for persistent same-column reorder and
cross-column insertion with departure/return:
[view-order.feature](../../tests/acceptance/features/view-order.feature).
The existing [view-move.feature](../../tests/acceptance/features/view-move.feature)
retains the 0023 placement and Blocked-exit journeys.

Human try-out: start with A, B, C, D in one column; move D to position 3,
then B to position 3. Verify A, D, B, C; move B to another column at position 1,
return without a position and verify A, D, C, B. Reopen CLI and refresh the web
View. Compare a second instance and verify it retained its own organization.

Run npm run verify for implementation handoff and record actual revision,
platform and results. Actual implementation evidence is recorded below.

## Open questions

- The external-edit/read-purity decision was resolved and implemented in 0023;
  this increment inherits that decision for ordering.
- The user approved rejection of membership-changing writes when a required
  instance definition is broken, including the wider affected-data scope needed
  to preserve arrival order. No blocking product questions remain.
- SQL layout and internal rank allocation are implementation choices.

## Implementation and review outcome

Implemented the approved scope on top of delivered 0023. Status remains
`in_progress` pending independent code review; no independent review is claimed.
No product-scope or behavioral deviations were needed.

CLI `move action --position N` uses final one-based destination indices, supports
same-column reorder and cross-column insertion, and retains the omitted-position
compatibility/append rules. Show exposes numeric member positions; move reports
`source_position` (nullable) and committed `destination_position`. All 0023 state,
completion, blocking and Waiting validation remains in effect.

Confirmed the predecessor was schema 7. Schema 8 stores current dense internal
ranks in `view_order`, separate from explicit `view_placements`, with unique
instance/Action and instance/column/rank constraints. A changed instance order is
persisted transactionally with one `view.order_changed` event, not individual
moves for renumbered cards. Initial instance creation records evaluated ID order
alongside its metadata and `view.created` event. No-op moves bypass reconciliation
and rank normalization entirely; reorder leaves Action data/events/timestamps and
inferred versus explicit placement untouched.

The ordered domain evaluator is shared by CLI, HTTP and existing passive React
cards; the web already preserves received member order and needed no renderer
change. The SQLite Action reader was extracted into an internal adapter module so
instance creation can read transaction-local Action facts without a module cycle.

Reconciliation retains continuing order, removes departures and appends arrivals,
including directly affected dependents and normal CLI/HTTP Action creation.
Multiple arrivals use ID order; successive writes retain commit order even for
lower new IDs. Bounds are validated after all resulting blocking projections,
including dependent arrivals into the destination. Order-only instances and empty
instances are included in affected-data analysis. Membership-changing writes
validate all potentially affected definitions, not only placement references;
a broken required definition rejects the full write with context (also through
HTTP creation). Content-only writes can skip instances proven unrelated by their
placement/order references. Pure reorder reconciles only its selected instance.

Reads remain pure and retain valid order ahead of ID-sorted unrecorded members.
Removed referenced columns and contradictory/orphaned order fail explicitly.
Temporary external edits reverted before a relevant supported write can restore
order; a read creates no arrival/departure history. The next relevant successful
write records evaluated order. Existing HTTP stale-edit guards and bounded SQLite
writer locking remain unchanged.

README, architecture, CLI help, the standalone definition example and single-source
generated Workspace AGENTS.md describe delivered behavior and schema 8. Existing
user-edited guides remain preserved. The generated examples include --position
and are exercised by the existing built-CLI guide runner.

Verification evidence will be finalized after the complete `npm run verify` run.
Focused domain/SQLite tests, the full integration suite, all 36 Cucumber scenarios,
built CLI position journeys and the browser order/refresh journey were exercised
during development. Final revision, totals and platform are recorded at handoff.

Limitations follow the approved scope: older Workspaces (including schema 7)
cannot be opened without a separately designed migration; none is provided.
External Markdown and SQLite are not a single snapshot, and external arrival
chronology between supported writes cannot be recovered. View web movement,
creation in a chosen column and state-choice controls remain deferred. Linux
verification and independent code review have not been performed.

Human try-out: use a fresh disposable schema 8 Workspace with `owf init`, copy
[work-board.md](../examples/work-board.md) into `_views/`, and create two instances
before creating Actions A, B, C and D in that order. Replace IDs in these commands
with returned UUIDs (or use `node <absolute-tools/owf>/dist/bootstrap/cli.js` in
place of `owf` when the CLI is not installed on PATH):

```sh
owf create view --title "First" --definition /_views/work-board.md --json
owf create view --title "Second" --definition /_views/work-board.md --json
owf create action --title A --json
owf create action --title B --json
owf create action --title C --json
owf create action --title D --json
owf move action D_ID --view FIRST_VIEW_ID --column new-actions --position 3
owf move action B_ID --view FIRST_VIEW_ID --column new-actions --position 3
owf show view FIRST_VIEW_ID --json
owf move action B_ID --view FIRST_VIEW_ID --column todo --position 1
owf move action B_ID --view FIRST_VIEW_ID --column new-actions
owf show view FIRST_VIEW_ID
owf show view SECOND_VIEW_ID
owf serve
```

The first intermediate order is A, D, B, C; after departure/return it is A, D, C, B.
The second instance retains A, B, C, D. Select each instance in the browser and
Refresh after further CLI ordering changes; order survives a page reload and
selection of that instance again.

## Decision changes and follow-up

- 2026-10-27: Rebased on completed 0023; retained its --waiting-for behavior and
  adopted its agreed external-edit/read-purity clarification.
- 2026-10-27: User requested same-column ordering and persistent insertion position
  across column moves, suggesting numeric position 3 inserts before the current
  third card. This draft adopts final one-based position semantics.
- Same-column omission retains 0023's no-op for compatibility; cross-column omission
  implements the profile's append default. Departure never retains a dormant rank.
- Web movement and reordering remain a later increment after CLI delivery.

- 2026-10-27: User approved the full design for implementation; document and index
  marked reviewed, including the stated broken-definition behavior for arrivals.

- 2026-10-28: Implemented approved 0024 scope and marked increment/index
  `in_progress`. Independent review is pending; no merge or release is included.
