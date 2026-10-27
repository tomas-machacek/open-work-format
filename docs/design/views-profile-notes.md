# OWF Views Profile Design Notes

> Status: Agreed simplified design direction, 2026-10-11; non-normative
> representation contract reviewed through the specification/design PR #22.
> Configurable Views and the blocking interactions below are not delivered yet.

## 1. Purpose and authority

This document owns the reusable View definition and first Kanban profile.
[Core](../../spec/core-v0.md#12-views) owns View and Action semantics.
[Representation notes](representation-profile-notes.md#12-views) own the document
envelope. [Operational Store notes](operational-store-notes.md) own instance
data, references, logs, and transactions.
[Architecture](../../tools/owf/docs/architecture.md) owns implementation boundaries.

The first profile maps Action execution states to columns, supports a special
Blocked column, and uses manual card order. Fixed application rules determine
placement, movement, and creation. There are no registered selectors, arbitrary
filters, automatic sorting policies, or configurable transition functions.
These are design requirements for later implementation, not current CLI syntax
or a claim that the existing five-state board implements configurable Views.

## 2. Definitions and instances

A View definition is reusable Markdown configuration of columns and defaults.
It contains no authoritative Action lists or card positions. A View instance
has a stable Workspace-unique store ID, a definition reference, a title, an
optional window, and its own current placements and manual ordering.

One definition may have several independent instances. Creating an instance
copies neither Actions nor the definition. Actions retain shared identity and
state: changing an Action can affect its presentation in other instances, while
placements and order remain instance-local.

References use MarkdownObjectReference: a Workspace-rooted URL and optional
document ID. Optional `owf.id` identifies the definition, never an instance.
No capability namespace or generic instance parameters are needed in this profile.

All instances use the current shared definition, without pinned copies.
An incompatible evolution can use a new independent definition. Changing labels,
column order, or routing defaults affects subsequent evaluation; editing a
definition does not execute state changes or replay past moves.
A renamed title preserves column identity. A missing definition or removed
column ID still referenced by instance data is an actionable configuration
error, requiring explicit repair rather than silent data deletion.
A known column that no longer accepts an Action uses normal rerouting below.

Old instances remain live projections. Use Snapshots for historical state.
Deleting an instance removes its local data, not Actions or the definition.

## 3. Markdown definition envelope

Definitions live under `_views/`, with `type: OWF View Definition`, title,
one corresponding H1, and optional prose. Machine-readable configuration
belongs under `owf`. Body links and headings do not define membership or order.

| Definition field | Meaning |
| --- | --- |
| `purpose` | Optional descriptive, open-vocabulary purpose. |
| `renderer` | `kanban` for this first profile. |
| `columns` | Ordered definitions; sequence is the displayed column order. |
| `defaults` | Optional mapping from execution state to default ordinary column ID. |

Each column has a unique, stable definition-local `id` and a `title`.

| Column field | Meaning |
| --- | --- |
| `type` | `status` by default, or the special `blocked` type. |
| `status` | Required for ordinary columns: one state or a non-empty, duplicate-free list of states. |
| `default_status` | Optional target state for an ordinary column; must be in `status`. Defaults to the first listed state. |
| `include_blocked` | Ordinary columns only; defaults to `false`. `true` permits blocked as well as unblocked Actions. |

State values are `open`, `in_progress`, `waiting`, `completed`, and
`cancelled`. `status` maps to Action execution state; it is not a new Action
property. `blocked` is not a state value. At most one `type: blocked` column
is allowed per definition. It has no `status`, `default_status`, or
`include_blocked`; it shows blocked non-terminal Actions regardless of their
execution state.

Several ordinary columns may accept the same state. This is intentional, not
a membership conflict. Every represented state has a default ordinary column:
use `defaults[state]` when specified, otherwise the first column supporting
that state. An explicit default must reference a supporting ordinary column.
There is no per-column population mode, ordering mode, capability namespace,
`transitions`, `filter`, `on_enter`, or `on_leave` configuration.

Purpose and titles introduce no special sprint, Today, planning-selection,
or WIP semantics. All card order is manual.

## 4. Eligibility and unique placement

An ordinary column accepts an Action if its current state is supported and it
is either unblocked or the column has `include_blocked: true`.
The special Blocked column accepts blocked non-terminal Actions.
Blocking is derived using Core: unresolved dependencies or a manual blocking
reason. The View neither stores a separate blocked flag nor overrides this rule.

Evaluate each non-archived Action in the Workspace as follows:

1. Retain its current instance placement if the column still accepts it.
2. Otherwise discard that placement logically. For a blocked non-terminal
   Action, prefer the special Blocked column if configured.
3. Otherwise choose an eligible ordinary column for its current state:
   the configured/default column if eligible, then the first eligible column
   in definition order.
4. If none is eligible, the Action is outside this View. A definition may omit
   states or exclude blocked Actions without being invalid.

This gives at most one displayed occurrence per Action per instance, even when
several columns support its state. An unplaced blocked Action prefers Blocked;
an Action already in an ordinary column with `include_blocked: true` stays
there when blocked. Entering that ordinary column does not itself set a block.

A new unplaced Open Action goes to the Open default, such as New to organize.
Changing state outside the View retains placement only if still eligible;
otherwise the same routing rules apply. Automatic routing never changes Action
state or manual block, and never runs a move operation.

There is no remembered earlier organizational column. If an Action moves from
Todo to Blocked, its previous Todo placement is discarded. A manual move out
chooses the new destination. If it is unblocked elsewhere, normal default
routing applies; the View does not restore its former Todo placement.

Reads evaluate routing without writing. Supported write paths must reconcile
invalid placements and departed positions against pre-change and post-change
facts, atomically with Action changes and events. This includes Action operations
outside a View and affected dependent Actions across instances. Eligible
placements survive; discarded placements are not restored by later state changes.
A required broken definition or removed referenced column rejects the operation;
an unrelated broken View without affected placement does not.

Clarified on 2026-10-27: durable departure tracking applies to supported writes,
not read-only observations of external edits. A temporarily incompatible
definition reverted before a relevant successful write may make the stored
placement eligible again, even if a read observed the intermediate definition.
Current invalidity is reconciled on the next relevant successful write.
Reads never repair definitions or persist cleanup/observation markers; no
unobserved membership history is reconstructed.

## 5. Fixed movement and creation rules

All cross-column moves use the following application behavior. Column titles
do not define effects and definitions cannot supply executable functions.

| Move | Effects |
| --- | --- |
| To an ordinary column | Set the target's `default_status`, even if the existing state is another supported state; establish target placement and drop position. |
| To Blocked | Preserve execution state; set a manual block with a human-readable reason; establish Blocked placement and drop position. |
| From Blocked to an ordinary column | Clear the manual block, require no remaining dependency block, then apply the target state and placement. |
| Within the same column | Reorder only; do not reset state or change blocking. |

A move to Blocked is allowed only when manual blocking is valid for the current
state. Core/profile permit manual blocking in Open, In Progress, or Waiting;
terminal Actions cannot be blocked by a drop. Obtain a non-empty reason or reuse
an existing valid manual-block reason. UI/input mechanics belong to the code
increment; no fabricated reason or silent relaxation of Core is allowed.

Leaving Blocked is rejected while any dependency block remains, even when the
target has `include_blocked: true`. Rejection preserves the manual reason,
state, placement, order, and events. A move between ordinary columns does not
implicitly clear manual blocking. A blocked Action can move between accepting
ordinary columns only if the final Action satisfies the target and domain rules.

Evaluate the candidate after all proposed effects. Validate shared Action
rules, required state-related data, destination acceptance, and unique placement.
For example, Waiting uses the existing optional waiting-reason contract;
this profile introduces no requirement to supply a waiting reason on a drop.
Missing required input or failed validation leaves the entire operation unchanged.
Moving cards never removes dependencies to manufacture eligibility.

Action changes, placement, ordering, and Operational Event Log entries commit
together in one store transaction. No partial success, Markdown writes, network
effects, or stronger cross-representation snapshot guarantee is implied.
GUI and CLI use the same application rules. Drag feedback can show acceptance
and rejection reasons, but final validation always runs at commit time.

Creation in an ordinary column uses its default state and saves placement and
initial position with the new Action. Creation in Blocked uses Open plus a
required manual-block reason. Normal creation and ownership rules still apply;
all data must validate and commit atomically. Creation outside a chosen column
uses the normal Action default state and View routing upon evaluation.
A newly created Action is not duplicated into every column supporting its state.

## 6. Snapshot capture scope

A Snapshot captures the whole concrete instance or explicitly selected column
IDs. Scope is chosen per capture without planning flags or a separate persistent
planning-selection set. A board may support continuous flow or optional planning
periods; neither a sprint nor start/end captures are mandatory.

Validate the complete instance before applying capture scope. Unknown column
IDs are errors, not a fallback to whole-View capture. The immutable artifact
records source instance identity, capture time and scope, column IDs and titles
including empty selected columns, column order, card order, and every included
Action's ID, type, title, and selected property projection.

Capture materializes the evaluated placement at that time. It does not change
live membership or Action data. Later Action or definition changes cannot alter
the artifact. Review can likewise use a whole View or explicit subset without
a persisted planning set. Snapshot serialization and runtime remain deferred.

## 7. Manual ordering

Each instance and column has its own manual order. Reordering changes no Action
content, state, owner, block reason, or Action update timestamp.
A drop uses the requested position; without one, append after all current cards.
New automatically routed members appear at the end. Simultaneous arrivals need
a fixed deterministic tie-breaker, chosen in implementation; this is not a
user-configurable sort or automatic reordering of existing members.

Departure discards the old position. A deliberate return uses its new drop
position; an outside change that returns an Action makes it a new arrival.
There is no position history, dormant rank, TTL, or restoration policy.
Read-only routing and write-side reconciliation follow Section 4.

## 8. Validation and errors

Validate unique column IDs, supported states, non-empty state sets, defaults,
field/type combinations, and at most one Blocked column. Unknown or removed
generic-model fields are configuration errors, not silently ignored extensions.
Missing definitions, invalid references, unavailable store data, or contradictory
instance placements fail the whole evaluation with instance, Action, and column
identities where applicable. Multiple eligible columns are resolved by Section 4
and are not errors.

CLI returns nonzero status and structured diagnostics. GUI may retain a clearly
stale last successful board with movement and ordering disabled; first-load
failure must not fabricate an empty successful result. Validate before temporary
display filters so they cannot conceal broken instance data.
Exact error codes and concurrency preconditions belong to implementation.

## 9. Example definition

This reusable definition for `_views/work-board.md` models the user's board.
The Sprint backlog label is local intent, not a framework requirement.

```markdown
---
type: OWF View Definition
title: Work board
description: Organize new Actions, current work, and backlog.
owf:
  purpose: focus
  renderer: kanban
  defaults:
    open: new-actions
  columns:
    - id: new-actions
      title: New to organize
      status: open
    - id: todo
      title: Todo
      status: open
    - id: blocked
      title: Blocked
      type: blocked
    - id: in-progress
      title: In progress
      status: in_progress
    - id: done
      title: Done
      status: completed
    - id: sprint-backlog
      title: Sprint backlog
      status: open
    - id: backlog
      title: Backlog
      status: open
---

# Work board

Place Open Actions in Todo, Sprint backlog, or Backlog.
New Open Actions without placement appear in New to organize.
Blocked Actions use the dedicated column unless their current ordinary column
explicitly permits them.
```

Adding `include_blocked: true` to Sprint backlog would allow its current cards
to remain there when blocked. It would not create another occurrence in Blocked.
This example omits Waiting and Cancelled ordinary columns: unblocked Actions in
those states are outside the View. A blocked Waiting Action can appear in Blocked.

An alternative ordinary column can support several states:

```yaml
id: active
title: Active
status: [open, in_progress]
default_status: open
include_blocked: true
```

Entering Active sets Open; an Action already there that changes externally to
In Progress remains eligible. Reordering within Active preserves its state.
Without `default_status`, the first state in the list is the target state.

Illustrative instance data:

```yaml
id: example-instance-1
definition:
  url: /_views/work-board.md
title: My work board
```

Window boundaries are optional instance data. Another instance may reference
the same definition while keeping independent placement and order.

An illustrative capture choice, not final CLI/API or Snapshot serialization:

```yaml
instance_id: example-instance-1
scope:
  columns: [todo, blocked, in-progress, done, sprint-backlog]
```

It captures those columns and excludes New to organize and Backlog.
A later capture creates a new immutable Snapshot.

## 10. Deferred generalization and implementation

The earlier design explored registered, namespaced capabilities for selecting
column members, filtering, automatic ordering, and custom transition operations,
for example `general.actions-by-state` and `my-view.green-actions`.
It separated manual/computed population from manual/computed ordering.

On 2026-10-11, the user chose the smaller state-and-blocking model because the
generic solution introduced too much configuration and implementation complexity
for the actual board use case. The registry, namespaces, arbitrary filters,
automatic ordering, and custom operations are deferred. Revisit them if a concrete
need justifies their cost; they are not prerequisites or hidden extension hooks
to build now. An aging board or age-based coloring is a possible later need,
not part of this profile.

Core remains broad enough for other representations. This profile deliberately
implements a smaller subset; no generic feature is required merely because Core
permits derived membership or ordering. Decision 027 in the
[design review](core-v0-design-review.md) records this change.

A possible future move interaction could let the user choose a state supported
by a multi-state destination column. For example, a column titled Closed with
`status: [completed, cancelled]` could offer Done (`completed`) and Cancelled
(`cancelled`) when an Action is dropped into it. Any chosen state would still
have to satisfy the shared Action and blocking rules. This is a deferred option,
not part of the current move contract: moves currently use the target column's
`default_status` (or its first listed state), without a state-choice prompt.

Physical schema/version changes, exact commands, endpoints, concurrency,
write-side reconciliation, newcomer tie-breaking, and required-input UI remain
for separately agreed implementation increments. Manual blocking and dependency
support must be delivered and validated before claiming the full Blocked workflow.
A graphical definition editor, Snapshot runtime, and automated Review or Planning
remain deferred. This specification and design change delivers no runtime features.
