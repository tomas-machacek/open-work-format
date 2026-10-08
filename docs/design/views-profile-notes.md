# OWF Views Profile Design Notes

> Status: Agreed design direction, 2026-10-08; non-normative representation
> contract prepared in increment 0017. No View runtime is implemented yet.

## 1. Purpose and authority

This document owns the detailed reusable View definition and first Kanban
profile contract. [Core](../../spec/core-v0.md#12-views) owns View and Planning
semantics. [Representation notes](representation-profile-notes.md#12-views)
own document placement and envelope. [Operational Store notes](operational-store-notes.md)
own persistent instance data, references, logs, and transactions.
[Architecture](../../tools/owf/docs/architecture.md) owns implementation boundaries.

Requirements below express the agreed design, not a claim that today's CLI or
board already supports it. Function names in examples illustrate capability
contracts, not an implemented function catalogue.

## 2. Definitions and instances

A **View definition** is reusable Markdown configuration. It defines the
renderer, columns, selectors, ordering policies, optional planning columns, and
permitted transition operations. It does not contain authoritative Action lists,
current computed results, or manually maintained card positions.

A **View instance** is the concrete live View. It has a stable Workspace-unique
store ID, a definition reference, a title, optional parameters and planning
window, and independent explicit selection, placements, and ordering.

The usual case is one instance of a definition. Multiple instances are allowed,
for example Sprint 42 and Sprint 43 using the same sprint definition.
Instance creation does not copy Actions or copy the definition.

A definition reference uses the existing `MarkdownObjectReference`. Path identity
remains required; optional `owf.id` identifies the definition document only.
Instances do not require a new Markdown document or a public URI scheme.
An independent new instance gets a new instance ID. Duplicate document stable
IDs, when present, remain errors under the normal reference rules.

### 2.1 Current shared definition

All instances use the current referenced definition. Changing labels, column
order, selectors, or permitted transitions affects all its instances on their
next evaluation. Changed operations apply to future commands; editing a
definition never replays past transitions or mutates Actions by itself.

There are no automatically copied or pinned definition versions. For an
incompatible evolution, create a new independent definition and namespace;
existing instances keep referencing the original definition. Moving instances
between definitions would be an explicit operation, not an implicit migration.

Deleting or changing a column ID referenced by explicit instance data can
invalidate an instance. Report the mismatch and preserve its data rather than
silently moving or deleting work. Explicit repair must resolve it.
Renaming a column title does not change its identity.

Old instances are live projections, not frozen history. Use an immutable
Snapshot for reliable historical state.

## 3. Markdown definition envelope

Definitions live under `_views/` and use `type: OWF View Definition`, a title,
one corresponding H1, and optional descriptive prose. Machine-readable
definition properties belong under `owf`; field keys use `snake_case`.
Headings, prose links, and their order do not define membership or placement.

| Field | Meaning |
| --- | --- |
| `namespace` | Stable capability namespace, independent of document title and instance ID. |
| `purpose` | Optional open-vocabulary purpose, for example `planning` or `focus`. |
| `renderer` | Presentation choice; this first profile specifies `kanban`. |
| `columns` | Ordered column definitions; sequence determines left-to-right order. |
| `transitions` | Permitted directed column pairs and their operation capabilities. |

Each column has a definition-local stable `id`, a `title`, `population`,
and `ordering`. IDs must be unique within the definition. The optional
`planning: true` marks a column as part of the selected-plan presentation;
omission means false. This is independent of population mode.

`population.mode: manual` uses explicit instance placements.
`population.mode: computed` requires `selector` and optionally `params`.
`ordering.mode: manual` supports instance-local card ordering.
Computed ordering can reference an ordering capability, with its concrete
catalogue to be defined when implemented. Population and ordering are separate
properties; a computed column may be ordered manually.

Each transition has `from`, `to`, `operation`, and optional `params`.
Column references must resolve, and a directed pair has at most one operation.
Unlisted cross-column moves are forbidden. Same-column reordering is governed
by ordering policy and never invokes a transition operation.

Purpose is descriptive. It does not silently create a planning selection,
Action state, lifecycle, or special subtype.

## 4. Registered capabilities and namespaces

Selectors, ordering capabilities, and operations are resolved from a registry
by their fully qualified names, such as `general.actions-by-state`,
`sprint.green-actions`, or `sprint.complete-action`.

- `general` is reserved for standard capabilities.
- Each definition declares a stable namespace, unique among definitions in
  the Workspace. It is not derived from the visible title or instance title.
- The full name is the lookup key in the relevant capability category.
- Parameters are separate structured values, validated for that capability.
- A missing or wrong-category capability is an error, not a fallback to a
  similarly named function or an empty result.
- A namespace identifies the origin of a capability, not an access restriction.
  Another definition may explicitly reuse that capability.

All instances of one definition use the same registered capabilities. Invocation
receives the current instance context, including its ID, parameters, optional
window, explicit placements and planning selection, and the relevant Workspace
facts. A sprint-specific function is not separately registered for every sprint.

Selectors and ordering capabilities are read-only. They return member identities
or ordering information, not authoritative copies of Actions. They must not
write state, trigger transitions, or append events during evaluation.
Named rules and parameters are the declarative envelope; their implementation
may be application code without introducing a general query language.

Operations use the shared application/domain rules and participate in the
store transaction described in Section 7. The first contract excludes effects
outside that rollback boundary. Registry wiring belongs in application/bootstrap
composition, not UI components or arbitrary code embedded in frontmatter.

The first implementation can supply a small built-in registry. Runtime loading,
installation, source-code locations, and packaging of custom capabilities are
deferred. A portable definition that uses custom capabilities depends on those
implementations being available in the destination environment; missing code must
be reported. Documented backup or transfer must identify this dependency.
Namespaces alone do not ship executable code.

## 5. Membership and runtime validation

For the first Kanban profile, an Action appears in at most one column of one
instance. The same Action may appear in several instances, in different columns
and orders. Other future renderers need not inherit this uniqueness rule.

Manual columns use explicit placements. Computed columns derive their results
from the current definition and instance context. An automatic result never
becomes an authoritative stored membership row merely because it was displayed.

Selectors must express any intended exclusions. For example, a candidate
selector can exclude Actions explicitly placed in manual columns of this
instance. The renderer must not silently give manual columns precedence or
choose the first computed column when results overlap.

Validate actual results at runtime: referenced Actions belong to the Workspace,
columns resolve, capabilities succeed, and cross-column membership is unique.
Definitions can be structurally valid while particular Workspace data causes
a conflict. Validate the complete evaluated instance before applying temporary
display filters; filtering must not conceal an invalid View.

### 5.1 Overlap and other evaluation failures

An overlap fails the evaluation of the whole instance. Report every detected
conflict with the Action ID and title, the involved column IDs and titles, and
the instance identity. `VIEW_MEMBERSHIP_CONFLICT` is the proposed diagnostic
name; final transport details belong to the implementation increment.

CLI returns a nonzero exit status and structured diagnostic data.
GUI displays the error; if it retains the last successful board, that board is
clearly marked stale and its moves and ordering writes are disabled.
On first-load failure, no successful empty board is fabricated.

Unknown capabilities, invalid definitions, missing definitions, and unavailable
store data likewise cannot be interpreted as successful empty results.
Neither partial success nor silently dropping duplicate cards satisfies this
contract. Runtime validation is read-only.

## 6. Optional planning selection

Planning is an optional use of a View. Its definition may identify no planning
columns, one, or several. A View can display candidate Actions without selecting
them into a plan.

An instance with planning behavior keeps an explicit planning selection.
A deliberate selection operation, such as a move from Candidates into a marked
planning column, adds the Action. Moving between planning columns preserves
selection. An explicit removal from the plan removes it. The defined operation
must make that intent clear; a selector's result alone never enrolls candidates.

Completion alone does not remove selection. Temporary invisibility likewise
does not erase the intentional choice. Selection is not stored Action priority
or a new execution state.

Planning presentation is independent of population mode. A computed Done column
may select completed Actions from this instance's explicit planning selection.
It must not include every completed Workspace Action or overlap a manual column.
A manually populated Done column is also valid.

Review of the plan uses the explicit selection. A whole-View Review can include
candidates when that wider scope is explicitly chosen. Snapshots identify their
instance and capture scope: whole View or planning selection. Snapshot runtime
and serialization remain deferred.

Definition edits do not silently enroll or discard planned work. Incompatible
changes to planning interpretation must be handled explicitly, as other
definition/state mismatches are. No universal meaning is assigned to column
titles such as Today, This Week, or Done.

## 7. Cross-column moves

A move names the instance, Action, source and target columns, and optional target
position. The server checks the current definition, source membership, and
permitted transition, then executes the registered operation.

| Source and target | Placement behavior |
| --- | --- |
| Manual to manual | Replace the explicit placement and establish target order. |
| Computed to manual | Create the target placement; the source selector must then exclude the Action. |
| Manual to computed | Remove the source placement; the operation must make the target selector select the Action. |
| Computed to computed | No explicit membership override; the operation must make the Action match the target and leave the source. |

An operation may also change Action state or other supported operational data,
and maintain explicit planning selection as appropriate. All Action changes
still obey the same domain rules as outside Views. Moving a card is not authority
to bypass dependency, ownership, Waiting, or terminal-state rules.

Before committing, evaluate the resulting instance. The Action must occur in
the requested target and nowhere else, and the whole View must remain valid.
If evaluation fails, all related store changes and event entries roll back.
No position or selection change may remain after an Action change fails,
and no Action change may remain after destination validation fails.

The transaction includes placements, selection, ordering, Action changes, and
Operational Event Log entries. It does not include editable Markdown, networks,
or external side effects. No cross-store snapshot guarantee is implied.
Temporary display filters do not determine the validity of the destination.

Return the accepted result; the UI must not claim success from a speculative
move. An uncertain transport outcome is checked by rereading rather than
blindly repeating a potentially completed operation. Detailed concurrency
preconditions are to be specified in the implementation increment.

## 8. Manual ordering without previous-position memory

Order belongs to the instance and column, never to the Action.
Reordering within a column only changes local order; it invokes no transition
and changes no Action content, state, owner, or Action update timestamp.

Members without explicit current positions follow manually ordered members in
a deterministic default order. The exact default comparator is an implementation
decision; normal Action list order is not an intrinsic priority.

A cross-column move removes the source position and uses the requested target
position. Without one, insert at the target column's end. This end insertion
must follow all current target members, including members without saved positions.

There is no previous-position history, dormant rank, TTL, or terminal-state
retention policy. Once an Action leaves a column, its position there is discarded.
A deliberate return uses the new drop position. A return caused by a change
outside the View is treated as a new arrival, not restored to an old position.

Reads and selector evaluation do not mutate the store. Supported write paths
must reconcile obsolete order entries; any residue left by an external change
must not be treated as a saved return position after departure is detected.
Physical invalidation and reconciliation without read side effects must be
specified with the first ordering implementation. The contract does not require
reconstruction of membership changes that were never observed.

Deleting an instance removes all its local ordering, selection, and placement
data, while preserving Actions and the shared definition. Previous-position
memory may be reconsidered only if actual use demonstrates a need.

## 9. Example definition

This is a definition fragment intended for `_views/sprint.md` in a Workspace.
It does not define an executable capability catalogue or create an instance.

```markdown
---
type: OWF View Definition
title: Sprint board
description: Candidate discovery and explicitly selected sprint work.
owf:
  namespace: sprint
  purpose: planning
  renderer: kanban
  columns:
    - id: candidates
      title: Candidates
      population:
        mode: computed
        selector: general.actions-by-state
        params:
          states: [open, in_progress]
          exclude_manual_members_of_view: true
      ordering:
        mode: manual
    - id: this-sprint
      title: This sprint
      planning: true
      population:
        mode: manual
      ordering:
        mode: manual
    - id: today
      title: Today
      planning: true
      population:
        mode: manual
      ordering:
        mode: manual
    - id: done
      title: Done
      planning: true
      population:
        mode: manual
      ordering:
        mode: manual
  transitions:
    - from: candidates
      to: this-sprint
      operation: general.move-in-view
    - from: this-sprint
      to: today
      operation: general.move-in-view
    - from: today
      to: this-sprint
      operation: general.move-in-view
    - from: this-sprint
      to: candidates
      operation: general.move-in-view
    - from: this-sprint
      to: done
      operation: sprint.complete-action
    - from: today
      to: done
      operation: sprint.complete-action
---

# Sprint board

Candidates are possibilities, not selected sprint work.
Moving into This sprint selects an Action without starting it.
Moving into Done explicitly completes the Action.
```

In this example, `general.move-in-view` updates placement, planning selection
when crossing the planning boundary, and target position without changing the
Action. Returning from This sprint to Candidates removes placement and planning
selection and succeeds only if the candidate rule accepts the Action.

`sprint.complete-action` completes the Action and places it in Done in the same
transaction, retaining its planning selection. This manual Done column avoids
any assumption that completion performed elsewhere automatically moves a card.

The generic selector's example `states` parameter uses the representation's
canonical state spelling `in_progress`; adapters may map to the tool's existing
CLI spelling. The exclusion parameter consults this instance's current manual
placements, not every instance of the definition.

A custom computed column could instead use `selector: sprint.green-actions`.
For computed Done, a `sprint.completed-selection` capability would inspect the
instance's explicit selection and must coordinate with the other column rules
to satisfy uniqueness.

Illustrative instance data uses the existing definition reference model:

```yaml
id: example-instance-42
definition:
  url: /_views/sprint.md
title: Sprint 42
parameters:
  sprint_number: 42
window:
  start: "2026-10-12"
  end: "2026-10-23"
```

The ID is illustrative, not a prescribed encoding. Window boundaries and
parameters belong to the instance, not repeated copies of the shared definition.
Another instance has its own ID and independent operational data.

## 10. Deferred implementation details

The semantic decisions above are closed for this documentation increment.
Later implementation increments must specify physical schema/version changes,
exact instance ID encoding, command/API shapes, capability interfaces and
parameter validation, default comparator, ordering reconciliation, concurrency
preconditions, and proportional verification.

Custom capability packaging, a general graphical definition editor,
Snapshot implementation, and automated Review or Planning remain deferred.
These notes do not authorize adding all those features to the next code increment.
