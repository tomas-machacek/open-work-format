# 0023 — Move Actions between View columns through CLI

> Status: draft
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
owf move action ACTION_ID --view VIEW_ID --column COLUMN_ID [--reason TEXT] [--json]
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
option that suggests a semantic change. Waiting keeps the existing optional
waiting-reason contract; this command adds no waiting-reason option.

### Move effects

| Evaluated source and target | Result |
| --- | --- |
| Different column or outside View → ordinary column | Set target default_status (or first listed status) and persist target placement. |
| Different column or outside View → Blocked | Preserve execution state, set the supplied manual reason or reuse an existing valid one, and persist placement. |
| Blocked → ordinary column | Require no unresolved dependency block, clear manual block, set target default state and persist placement. |
| Already displayed in target column | Successful no-op; no default-state reset, block change, placement pinning, timestamp or event. |

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
A same-state organizational move must not change the Action's updated_at or
produce a fake Action state-change event.

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

There is a boundary requiring explicit clarification before implementation:
a definition can be edited so that a placement becomes ineligible, observed by
a read, then restored before any write. A fresh CLI process cannot remember that
observation without durable writes or additional history. The existing profile
says residue must not be reused "after departure is detected" while also requiring
pure reads and forbidding reconstruction of unobserved history.

Proposed clarification: durable departure tracking is guaranteed for supported
writes; read-only observations of external edits are not durable history.
Current external invalidity is reconciled on the next relevant successful write.
External changes reverted before that write cannot be reconstructed. Do not add
hidden writes, process-local membership caches or copied definitions to imply a
stronger guarantee. Record the agreed clarification in shared design documents
before marking the detailed design ready for implementation.

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
Provide copyable same-state and Blocked examples using real command syntax.

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
- **AC9 — External-edit boundary:** Tests and documentation match the explicit
  resolution of the clarification above; no durable observation guarantee is
  claimed unless the design actually provides it.

## Verification plan

Use focused cases with distinct failure reasons, not the full matrix at every
layer.

| Risk | Verification |
| --- | --- |
| Move effects, eligibility, no-op (AC3–AC4) | Focused domain cases for ordinary/multi-state/Blocked columns and outside-View source. |
| Persistence and isolation (AC2, AC6) | Real SQLite integration with two instances, process reopen, state/block changes and direct dependents. |
| Atomicity (AC5) | Inject failure after Action write and during event write; compare semantic data before/after. |
| External edits and errors (AC7, AC9) | Definition default/title/support changes, removed column, broken affected/unrelated definition, pre-change residue and pure reads. |
| User contract (AC1, AC8) | Built-CLI flow, JSON/human output, descendant invocation, errors, unsupported schema and generated guide examples. |
| Passive web integration (AC6–AC8) | Small existing-style browser journey: CLI placement → refresh View → detail block edit → refresh; retain passive controls and Default behavior. |

Add a small executable acceptance journey for independent organization and one
for rejected Blocked exit. Link the canonical feature file at implementation.

Human try-out: create a fresh Workspace, two instances and Open Actions; move one
to Todo in only one instance; compare CLI and browser; move it to Blocked with a
reason; reject exit while a prerequisite remains unresolved; resolve that
prerequisite, move out and verify state, placement and refresh.

Run required npm run verify for implementation handoff and record actual revision,
platform and results. This document-only proposal does not claim runtime tests.

## Open questions

- Confirm the proposed external-edit/read-purity clarification before implementation.
  The detailed design remains draft until this is resolved and reviewed.
- SQL layout, result field names and narrow module extraction are implementation
  choices within this contract.

## Implementation and review outcome

Not implemented. This PR prepares the increment document and index only.
No implementation tests or independent code review have been performed.

## Decision changes and follow-up

- 2026-10-26: User agreed to CLI-first column moves as the next increment;
  detailed proposal prepared for review.
- Manual ordering is a separate future CLI increment; web movement follows CLI.
- The initial conversation mentioned filters, but the agreed simplified profile
  has no arbitrary filters. This document follows its state/blocking eligibility.
