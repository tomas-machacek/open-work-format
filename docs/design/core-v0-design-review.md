# Open Work Format -- Design Review

> Status: Core v0 conceptually closed (2026-08-07); representation design next

## Purpose

This is the primary working document during the OWF design phase. It records
accepted decisions, decision candidates, unresolved questions, and consistency
issues. Historical evolution and rationale may additionally be captured in the
Design Journal; normative rules ultimately belong in the Specification.

## Decision States

- Open Question
- Decision Candidate
- Accepted
- Rejected
- Superseded

## Accepted Decisions

### Decision 001 -- Recursive Outcome Hierarchy

**Status:** Accepted (Core v0)

The core planning model consists of Project, Outcome, and Action. A Project may
own Outcomes. An Outcome may recursively own child Outcomes and may also own
Actions. An Action is always a leaf and never owns work objects. Capability is
not a Core v0 concept and may later return as an extension or specialization.

Knowledge Documents may be owned by a Project or Outcome, but never by an
Action.

### Decision 002 -- Outcome Semantics

**Status:** Accepted (Core v0)

An Outcome represents a desired result that requires work and cannot be
completed by a single directly executable Action. It may be decomposed into
child Outcomes and/or Actions. It is achieved when its intended result becomes
true, not merely when all currently known Actions are complete.

Heuristic:

- Outcome: "What should become true?"
- Action: "What should I do next?"

### Decision 003 -- Outcome Refinement and Action Promotion

**Status:** Accepted (Core v0)

Refinement decomposes an Outcome only far enough to reveal meaningful executable
Actions; complete decomposition is not required. If an apparent Action is later
found to be non-atomic, it may be promoted to an Outcome. Promotion is a
refinement operation, not a lifecycle transition.

An active Outcome with no executable Action is a Review signal, not a validation
error.

### Decision 004 -- Outcome Lifecycle and Progress Observations

**Status:** Accepted (Core v0)

An Outcome has this intrinsic lifecycle:

- `Active`
- `Parked`
- `Achieved`
- `Abandoned`
- `Archived`

`In Progress`, `Refined`, and `Blocked` are not intrinsic Outcome states.
Actionability and progress may be observed or derived without changing the
Outcome lifecycle.

`Parked` means that the Outcome is still desired but is intentionally not being
actively pursued. Parking records a reason and may optionally define
`review-after`:

- Without `review-after`, the Outcome is considered by every Parked Review.
- With `review-after`, it is excluded until that date becomes due.
- Reaching the date does not automatically reactivate the Outcome; it makes the
  parking decision due for Review.

### Decision 005 -- Action Semantics

**Status:** Accepted (Core v0)

An Action is a concrete step that can be executed directly without further
decomposition. It represents work to perform, while an Outcome represents a
desired result. An Action discovered to be non-atomic is promoted to an Outcome
through refinement. Completing an Action never implies that an owning Outcome
has been achieved.

The earlier assumption that every Action must contribute to an Outcome was
superseded by Decision 007.

### Decision 006 -- Semantic Relationships

**Status:** Accepted (Core v0)

OWF distinguishes structural ownership from semantic relationships.

- `owns` expresses exclusive containment.
- `depends-on` expresses an execution dependency.

The source and target of `depends-on` may each be an Action or Outcome, in any
combination and across Project boundaries. Project dependencies are not part of
Core v0.

A dependency is satisfied when its target reaches its successful terminal
state: `Completed` for an Action and `Achieved` for an Outcome. An archived
target uses the terminal disposition preserved during archiving. `Cancelled`
or `Abandoned` does not satisfy a dependency automatically; it leaves a
situation requiring Review, removal, or redirection of the relationship.

Dependency cycles are representable and valid because they may honestly expose
weak or incomplete Refinement. A linter must detect and report them, normally as
a warning rather than structural invalidity. A blocked condition is derived
from unresolved dependencies, as refined by Decision 008.

### Decision 007 -- Action Ownership

**Status:** Accepted (Core v0)

Every Action has exactly one owner: Workspace, Project, or Outcome.

- Workspace ownership covers standalone Actions.
- Project ownership covers Actions that belong to a Project but not yet to a
  specific Outcome, including initialization and early planning.
- Outcome ownership covers Actions that directly advance a specific Outcome.

Ownership is exclusive. No artificial bootstrap Outcome, non-project container,
or generic `related-to` relationship is required merely to satisfy ownership.

### Decision 008 -- Action Blocking and Waiting

**Status:** Accepted (Core v0)

Action execution states are:

- `Open`
- `In Progress`
- `Waiting`
- `Completed`
- `Cancelled`
- `Archived`

`Blocked` is not an intrinsic Action state. An Action is blocked when it has an
unresolved `depends-on` relationship or is explicitly marked blocked with a
human-readable reason. `Waiting` is intrinsic and means that progress currently
depends on another actor or external system. An Action may therefore be both
Waiting and Blocked.

Manual blocking avoids artificial prerequisite Actions. Review should identify
stale manual blocks and replace them with richer semantic relationships whenever
appropriate.

### Decision 009 -- Review Purpose and Modes

**Status:** Accepted (Core v0)

Review restores trust in the workspace by identifying work whose current
representation no longer reflects reality and deciding what should happen next.

Review may operate in three modes:

- **Event-driven Review** reacts to a change or new information and examines the
  affected part of the workspace.
- **Periodic Review** deliberately examines a broader scope and protects the
  workspace from silent decay, including work that produced no triggering event.
- **Parked Review** reconsiders intentionally parked work. Parked Projects and
  Outcomes with no `review-after` participate in every Parked Review; those with
  a date participate only when the date is due.

Refinement is a separate operation available at any time. It may be
just-in-time, when insufficient decomposition is discovered during execution,
or Review-driven, when Review detects that the representation is no longer a
trustworthy basis for action.

Planning is a separate workflow. Review restores trust in represented work;
Planning decides which trusted work should receive attention and effort next.

### Decision 010 -- Review Scope and Inbox Boundary

**Status:** Accepted (Core v0)

All persistent OWF objects may be reviewed, but every Review run has an explicit
scope. The Review mode determines how that scope is selected:

- Event-driven Review examines the objects and relationships affected by a
  change or new information.
- Periodic Review examines active work in a deliberately selected broader scope.
- Parked Review examines parked Projects and Outcomes whose review condition is
  due.
- Specialized Review may focus on Knowledge Documents, Views, or another
  coherent subset.

Project, Outcome, and Action are the primary work objects of Review. Workspace
normally defines the boundary of a Review rather than being a work item to
inspect. Knowledge Documents and Views are reviewable, but need not be included
in every Review run.

Review detects the presence of unprocessed Inbox Items but does not itself
clarify them. It emits a signal that the Inbox contains unresolved input and may
lead into the relevant processing workflow. Review may
continue with that signal unresolved; an unprocessed Inbox limits confidence in
workspace completeness but is not a Review failure.

`Clarify` and `Organize` are logical stages of the single Inbox Processing
workflow defined by Decision 021. They are not separate Core v0 workflows.

### Decision 011 -- Review Signal Model

**Status:** Accepted (Core v0)

A Review policy evaluates conditions within a scope. A condition that may
require conscious attention produces a Review signal. The signal is evaluated
and receives a disposition, which may lead to one or more OWF operations:

`condition -> signal -> disposition -> operation(s)`

A Review signal:

- is a derived and temporary observation, not a persistent OWF object;
- references one or more relevant workspace objects;
- explains why attention may be needed;
- does not necessarily represent an error;
- does not prescribe a particular resolution; and
- receives a disposition during Review, recorded in the Event Log.

Core v0 does not define a universal catalogue of signal types, detection
algorithms, time thresholds, or methodology-specific Review rules. Review
policies and implementations may define, combine, or ignore concrete signals.
Structural invalidity such as a missing owner or broken reference remains a lint
or validation finding rather than a Review signal.

Useful non-normative heuristics include active work without an executable next
step, Waiting or manually blocked work requiring attention, stale work, unclear
or possibly achieved results, lifecycle tension, duplicated work, outdated
relationships or knowledge, and Views that may no longer reflect their intent.

An Action is executable when it is `Open` or `In Progress`, is not `Waiting`,
and is not blocked by an unresolved dependency or explicit manual block.
Follow-up and escalation may remain within the same Waiting Action while the
expected result remains unchanged; a separate or replacement Action is also
allowed.

### Decision 012 -- Project Lifecycle

**Status:** Accepted (Core v0)

A Project has the lifecycle `Active`, `Parked`, `Completed`, `Abandoned`, and
`Archived`. `Completed` is used instead of `Achieved` because a Project is an
initiative container rather than a desired result.

A Parked Project remains relevant but is intentionally not being pursued. It
records a reason and may optionally define `review-after`. Without the date it
participates in every Parked Review; with the date it is excluded until due.
Becoming due triggers Review, not automatic reactivation.

### Decision 013 -- Closure Review and Lifecycle Propagation

**Status:** Accepted (Core v0)

Terminal lifecycle transitions do not cascade automatically. Before a Project
or Outcome enters a terminal state, its non-terminal owned work undergoes
Closure Review. Each descendant is consciously:

- moved to an appropriate terminal state;
- moved to another valid owner; or
- represented by a new Inbox Item for possible future clarification.

The parent enters its terminal state only after this work is dispositioned.
Archiving follows semantic completion or abandonment and is not a shortcut for
unresolved work. Because `Archived` must not erase whether closure was
successful, an archived work object preserves its preceding terminal
disposition: `Completed` or `Cancelled` for an Action, `Achieved` or `Abandoned`
for an Outcome, and `Completed` or `Abandoned` for a Project. Exact
representation is deferred.

Parking is different: it suspends a work subtree without terminating or
rewriting descendant states. Descendant Actions may remain technically
executable, but attention-oriented Views and ordinary Review scopes normally
exclude them through their parked ancestor. A user may still select one
intentionally, including in a Curated Planning View. In Progress Actions should
be consciously checked when parking a parent.

### Decision 014 -- Event Log and Review History

**Status:** Accepted (Core v0)

OWF defines one logical append-only Event Log. OWF objects remain the source of
current truth; the Event Log records how that truth changed and why. OWF does
not require event sourcing or reconstruction of current state by replaying the
log.

The log records semantic object changes and Review activity, including Review
start, mode, scope, detected signals, dispositions, resulting operations,
rationale, and completion or interruption. Each signal in a completed Review
run has a recorded disposition such as resolved, confirmed, deferred,
redirected, or dismissed.

Review Signals remain derived observations rather than persistent domain
objects. A logical log may be physically split by an implementation. OWF-aware
operations record semantic events; changes made outside an OWF-aware tool may be
recorded retrospectively with reduced context. Git may complement the Event Log
but is not required.

The Event Log does not guarantee a complete history of workspace state. It
cannot substitute for an explicit snapshot when reliable historical evidence is
required.

### Decision 015 -- Review Workflow, Views, and Runs

**Status:** Accepted (Core v0)

Review is a workflow, not a View. A Review View is an optional projection used
to select and present candidates; it owns neither the reviewed work nor the
Review process. Different Views may support Periodic, Parked, Waiting, Project,
or specialized Reviews. Event-driven Review may operate directly on affected
objects without a View.

A Review run is represented by correlated Event Log entries rather than a
persistent work object. It may be completed, interrupted and later resumed, or
abandoned. A run is complete when every detected signal in scope has a recorded
disposition. Because the workspace may change during Review, a signal should be
re-evaluated before acting when its underlying information may have changed.

### Decision 016 -- Personal Scope and Actor Independence

**Status:** Accepted (Core v0)

OWF is designed primarily for organizing an individual's knowledge work. It is
not a collaboration, identity, authorization, or team project-management
framework. Teams, roles, permissions, approval policies, assignments, workload
management, and management reporting are outside Core v0.

OWF does not distinguish between changes performed by a human, AI agent, tool,
or integration. The Event Log records the semantic change, its rationale, and
Review dispositions, but does not require an actor identity. Implementations
may add identity or authorization metadata as extensions without changing Core
semantics.

### Decision 017 -- Planning as Intentional Work Projection

**Status:** Accepted (Core v0)

Planning is the activity of selecting existing work items for intentional
focus, optionally within a defined planning window. Its result is a Curated
View representing the selected work.

The selected items may be Projects, Outcomes, or Actions. The appropriate level
depends on the horizon and purpose of the plan. A short execution window will
usually select Actions, while a longer horizon may select Outcomes or Projects.
Core v0 does not prescribe a mapping between horizon length and item type, and a
Planning View may mix item types when useful.

Planning View membership expresses intended focus, not intrinsic state,
priority, or guaranteed completion. Planning therefore does not introduce a
`Planned` state. Membership, optional ordering, and optional grouping belong to
the View.

Planning operates on already defined work. It does not perform Review,
Refinement, Inbox processing, ownership changes, or lifecycle decisions. If
planning exposes a need for one of those activities, that activity remains a
separate workflow.

Blocked work may be selected. OWF does not require all blocking prerequisites or
transitive dependencies to appear in the same Planning View. A Planning policy
or supporting View may expose selected work whose prerequisites lie outside the
plan, but this does not invalidate the plan.

Computed Views may help discover candidates, but the Planning result is curated
because it records an intentional selection. Projects and Outcomes may also
provide derived context for selected Actions without becoming members of the
View. Policies may recommend limiting parallel Projects or Outcomes, but Core
v0 does not prescribe work-in-progress limits.

#### Non-normative examples

**Quarterly focus:** a Curated View selecting Outcomes intended to receive
attention during the quarter.

**Current iteration:** a Curated View selecting Actions intended for the next
sprint or week, including an Action currently blocked by another Action expected
to finish during the window.

**Mixed monthly plan:** a Curated View containing one larger Outcome together
with standalone Actions that do not belong to that Outcome.

### Decision 018 -- View Snapshots

**Status:** Accepted (Core v0)

A View may be materialized as an immutable View Snapshot. The snapshot records
the View membership and a user-selected projection of item state at a specific
point in time. It is a historical artifact, not a work item, live View, or
lifecycle state.

A snapshot records at least:

- its source View;
- the capture time;
- the selected snapshot projection; and
- the items contained in the View at that time.

Even a membership-only snapshot should preserve each item's captured identity,
type, and human-readable title so that it remains understandable after a later
rename, move, or deletion.

The selected projection may contain particular properties, such as lifecycle
state, owner, Waiting, or blocking information, or the complete represented
state of each selected item. A full item snapshot copies the selected items but
does not recursively copy owners, descendants, dependencies, Knowledge
Documents, or other related objects unless they are explicitly included.

Snapshots are immutable. A later capture creates a new snapshot rather than
updating the old one. Current OWF objects remain the source of present truth;
the snapshot is the reliable record of the projection explicitly captured at
its timestamp. This guarantee is independent of the non-guaranteed Event Log.

For Planning, non-normative practice may create a snapshot after initial
selection and another after the end-of-window Review. Comparing them can support
analysis of completion, carry-over, and unplanned work entering the View. Core
v0 defines neither these metrics nor automatic rollover behavior.

### Decision 019 -- View Purpose and Optional Planning Window

**Status:** Accepted (Core v0)

A View may declare an optional, machine-readable `purpose`. The value is an
open vocabulary rather than a closed enum. It communicates the intended use of
the View without creating a View subtype, lifecycle, or additional work state.
The View description remains the place for a human-readable explanation of its
specific intent.

Non-normative purpose values include `planning`, `review`, `focus`, `waiting`,
and `dashboard`. Implementations may introduce other values when needed.

A View used for Planning may declare an optional structured `window`. For
interoperability, implementations SHOULD use the canonical property names
`window.start` and `window.end` rather than synonymous names. Either boundary
may be present independently. If neither is present, the plan may be rolling or
otherwise unbounded, such as a Kanban queue containing just enough upcoming
work. The exact date-time representation and timezone rules are deferred to the
representation design.

Reaching `window.start` or `window.end` is a condition, not a state transition.
A tool may use it to signal that the View starts or ends, suggest a scoped
Review, offer a snapshot, or help create a subsequent View. It must not
automatically mutate the View or its items as a Core semantic.

A Planning View may change during its window, and the same item may belong to
multiple Views, including multiple Planning Views. Core v0 does not prescribe
capacity rules or a condition that declares Planning complete.

#### Non-normative representation example

```yaml
kind: curated
purpose: planning
description: Work selected for the next product iteration
window:
  start: 2026-08-10
  end: 2026-08-21
```

### Decision 020 -- Inbox Item and Capture Semantics

**Status:** Accepted (Core v0)

Capture creates a persistent Inbox Item from unresolved input. An Inbox Item is
not work, knowledge, or a commitment. Its existence means that the captured
input has not yet received a completed disposition; it has no separate
lifecycle states.

Every Inbox Item records its original capture time. The semantic property is
named `captured-at`; its exact date-time representation and timezone rules are
deferred to representation design. The original captured content is the item's
primary content. Source and additional context are optional. An item may be
enriched while unresolved, but this does not change its original `captured-at`.

Inbox Items do not own work and do not participate in the work dependency
graph. They are intentionally temporary and must not be used as the durable
home of valuable knowledge or as a durable dependency target.

Views may project Inbox Items because a general View may project any persistent
OWF object. This does not expand the narrower Planning workflow, whose subjects
remain Projects, Outcomes, and Actions. Age and similar observations are
derived from `captured-at` and may be exposed by Computed Views; they are not
Inbox lifecycle states.

### Decision 021 -- Inbox Processing and Consumption

**Status:** Accepted (Core v0)

Inbox Processing transforms unresolved captured input into an explicit result:

`Inbox Item -> interpretation -> operation(s) -> consumption`

`Clarify` determines what the input means. `Organize` represents that meaning
through OWF operations. They are useful logical stages of one workflow rather
than separate Core workflows. One Inbox Item may produce one or more operations
and one or more resulting objects. Core v0 does not define a closed catalogue
of targets or dispositions.

Successful processing has two forms:

- **Resolved:** the meaning is represented by completed OWF operations.
- **Discarded:** an explicit decision establishes that nothing should be
  retained or created.

In either case, the Inbox Item is consumed and removed from the current
workspace. Consumption occurs only after all intended resulting operations
succeed. If interpretation remains incomplete or an operation fails, the Inbox
Item remains unresolved in the Inbox; leaving it there is not a third
disposition.

If original captured content must remain available, processing preserves it in
an appropriate resulting object, such as a Knowledge Document. Neither the
consumed Inbox Item nor the non-guaranteed Event Log is durable storage for
valuable content. The Event Log may record the interpretation, operations,
resulting objects, discard decision, and consumption, but current objects remain
the source of present truth.

### Decision 022 -- Core Object Roles, Workspace, and Ownership

**Status:** Accepted (Core v0)

Workspace is the root context and boundary of an OWF bundle. It is not a work
item and has no work lifecycle. Projects are top-level initiative containers
within the Workspace.

Core v0 distinguishes these roles:

- **work objects:** Project, Outcome, and Action;
- **captured input:** Inbox Item;
- **knowledge:** Knowledge Document;
- **live projection:** View;
- **historical artifacts:** View Snapshot and Event Log; and
- **root context:** Workspace.

Review Signals are temporary derived observations and are not persistent Core
objects. A Review run is represented by Event Log entries rather than by a
separate persistent object.

Every Outcome has exactly one structural owner: a Project or another Outcome.
Its ownership chain must ultimately lead to a Project. Every Action has exactly
one owner as defined by Decision 007. A Workspace-level Knowledge Document has
no Project or Outcome owner; otherwise a Knowledge Document may have one
Project or Outcome owner. Views and historical artifacts reference objects but
do not own work.

### Decision 023 -- Knowledge, Views, and Identity Foundations

**Status:** Accepted (Core v0)

A Knowledge Document preserves context, rationale, evidence, or other durable
knowledge. It is not a work commitment and does not participate in the work
execution lifecycle. It may be Workspace-level or owned by a Project or
Outcome. An Action may reference a Knowledge Document but never own one.

A View is a first-class live projection over persistent Workspace objects. It
does not own its members. A Curated View explicitly maintains membership and
may maintain ordering or grouping. A Computed View derives membership from a
declarative rule. Core v0 does not standardize a query language or renderer;
lists, boards, tables, calendars, timelines, and trees are presentations of
Views.

Every persistent document object has a machine-readable identity. In Core v0,
that identity is its bundle-relative path without `.md`, beginning with `/`;
ownership and other machine-readable references use the same form. Moving or
renaming an object changes this ID and requires references to be updated.
Logical ownership remains independent of physical directory containment.

### Decision 024 -- Explicit Core v0 Deferrals

**Status:** Accepted (Core v0)

Core v0 deliberately does not define delegation, assignments, actor identity,
or team authorization. `Waiting` remains meaningful without identifying a
delegate in Core.

`Scheduled` and `Deferred` are not Core v0 lifecycle states or relationships.
Implementations may express scheduling, calendars, deferral policies, and
related dates through extensions and Views.

Knowledge categories, knowledge lifecycles, knowledge graphs, external artifact
integrations, and methodology-specific taxonomies are extensions. Their absence
does not prevent a Knowledge Document from preserving durable information.

## Review Design Closure

> Status: Conceptually complete for Core v0 (2026-08-06)

Review is closed as a design topic at the conceptual level. Core v0 now defines:

- its purpose as restoring trust in the workspace;
- event-driven, periodic, and parked modes;
- explicit scope selection;
- the general `condition -> signal -> disposition -> operation(s)` model;
- the boundary between Review and Inbox processing, Refinement, and Planning;
- Closure Review for terminal parent transitions;
- Review Views as optional projections rather than the workflow itself; and
- Event Log history for Review runs, dispositions, rationale, and resulting
  semantic changes.

The following details are intentionally deferred and do not block conceptual
closure:

- concrete Review policies, signal catalogues, and time thresholds;
- file and metadata representation of Review runs, signals, dispositions, and
  the Event Log;
- scheduling and triggering mechanisms;
- UI and renderer behavior; and
- identity, authorization, confirmation, and collaboration concerns.

Future work may refine representation or reveal a genuine semantic gap, but
should not reopen the Review model merely to add implementation detail or a new
catalogue of best practices.

## Planning Design Closure

> Status: Conceptually complete for Core v0 (2026-08-06)

Planning is closed as a design topic at the conceptual level. Core v0 now
defines:

- Planning as intentional selection over already defined work;
- a Curated View as the result, without introducing a `Planned` state;
- Projects, Outcomes, and Actions as valid planning subjects;
- mutable plan membership, including blocked work and membership in multiple
  Views;
- optional open-ended View `purpose` and optional planning boundaries using
  `window.start` and `window.end`;
- separation from Review, Refinement, Inbox processing, ownership changes, and
  lifecycle decisions;
- scoped Review as the reusable end-of-window trust-restoration workflow; and
- immutable View Snapshots when reliable historical state is required.

The following details are intentionally deferred and do not block conceptual
closure:

- concrete file syntax, date-time formats, and timezone rules;
- planning policies, capacity rules, work-in-progress limits, and completion
  criteria;
- renderer behavior and supporting Computed Views;
- metrics derived from snapshots; and
- automatic assistance with reminders, rollover, or creating a subsequent
  Planning View.

Future work may refine representation or reveal a genuine semantic gap, but
should not reopen Planning merely to encode a particular methodology or tool
workflow in Core.

## Inbox Processing Design Closure

> Status: Conceptually complete for Core v0 (2026-08-07)

Inbox Processing is closed as a design topic at the conceptual level. Core v0
now defines:

- Capture as creation of an unresolved Inbox Item;
- `captured-at` as the stable semantic basis for age-related observations;
- an Inbox Item as temporary input rather than work, knowledge, or commitment;
- one Inbox Processing workflow with Clarify and Organize as logical stages;
- operations or explicit discard as the two successful forms of resolution;
- consumption only after successful completion of intended operations;
- preservation of valuable original content in resulting durable objects;
- optional Event Log history without treating it as source of truth; and
- general Views, including Computed Views, as the mechanism for exposing aging
  or otherwise noteworthy Inbox Items.

The following details are intentionally deferred and do not block conceptual
closure:

- capture channels, integrations, and user interface;
- exact file syntax, date-time format, timezone rules, and optional source
  metadata;
- concrete aging thresholds, reminder policies, and Inbox Views;
- transactional and failure-recovery mechanisms; and
- Event Log representation.

Future work may refine representation or reveal a genuine semantic gap, but
should not reopen Inbox Processing merely to add a capture channel, target
catalogue, or productivity-methodology rule.

## Core v0 Design Closure

> Status: Conceptually complete (2026-08-07)

The conceptual design of OWF Core v0 is closed. Decisions 001 through 024 are
accepted and the final cross-cutting audit found no unresolved semantic
contradiction or missing concept required to begin normative specification.

Core v0 now defines:

- Workspace as the root context and Project, Outcome, and Action as its work
  model;
- recursive Outcome decomposition, progressive Refinement, and Action
  promotion;
- explicit ownership and semantic dependencies, including cross-Project and
  mixed Action/Outcome dependencies;
- intrinsic lifecycles, Waiting, derived and manual blocking, parking, closure,
  and preserved terminal disposition during archiving;
- Inbox Item capture, Inbox Processing, and consumption;
- Review as trust restoration and Planning as intentional projection;
- Knowledge Documents, Views, View Snapshots, and the logical Event Log in
  distinct supporting roles;
- path-based identity and machine-readable references; and
- the personal, actor-independent, methodology-neutral boundary of the Core.

Core v0 intentionally leaves delegation, scheduling, deferral, advanced
knowledge models, collaboration, methodology policies, rendering, integrations,
and automation to extensions or implementations.

Closure freezes the conceptual baseline, not the concrete file format. The next
phase may define Markdown/YAML representation, schemas, directory conventions,
query envelopes, ordering, extension points, and the normative lint contract.
That work may clarify wording and reveal representation constraints, but it
should reopen Core decisions only when it demonstrates a genuine semantic gap
or contradiction. A preference of one tool or methodology is not sufficient.

## Accepted Supporting Foundations

### Knowledge Documents

- Accepted as Core v0 by Decision 023. Remaining questions concern optional
  extensions and representation.

### Views

- Accepted as Core v0 by Decisions 018, 019, 020, and 023. Remaining questions
  concern query, ordering, and file representation.

### Identity and Paths

- Accepted as Core v0 by Decision 023. Remaining questions concern concrete
  frontmatter and directory conventions.

## Post-Closure Representation Questions

### Representation

- Minimum required frontmatter for each document type.
- Required, recommended, or optional directory layout.
- Exact representation of ownership, links, and explicit manual blocking.
- Query envelope for Computed Views without standardizing a query language.
- Representation of ordered collections and global ordering.
- Extension mechanism.

### Linting

- Normative lint rules, severities, and the role of autofix.

## Decision Log Template

### Decision XXX -- Title

**Status:** Open Question | Decision Candidate | Accepted | Rejected | Superseded

#### Context

#### Alternatives

#### Discussion

#### Decision

#### Consequences

#### Follow-up Questions
