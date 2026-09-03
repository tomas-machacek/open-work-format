# Open Work Format Core v0 Specification

> Status: Normative conceptual specification; concrete representation pending

## 1. Purpose

Open Work Format (OWF) Core v0 defines a lightweight, tool-independent model for
personal knowledge work. It standardizes the meaning of work, captured input,
knowledge, projections, review, and planning so that humans, AI agents, and
independent tools can operate on the same workspace without relying on hidden
application state.

This document is normative. Design rationale and historical alternatives belong
in the Design Journal and Design Review.

### 1.1 Influences and Attribution

OWF was informed by three earlier bodies of work:

- David Allen's [Getting Things Done (GTD)](https://gettingthingsdone.com/what-is-gtd/)
  methodology influenced Capture, Inbox processing, Clarify, Organize, and the
  emphasis on regular Review as a way to maintain a trusted system. In
  particular, the names **Capture**, **Clarify**, and **Organize** are adapted
  from GTD's five-step workflow.
- Andrej Karpathy's [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
  pattern influenced the use of persistent, interlinked Markdown artifacts that
  humans can inspect and AI agents can incrementally maintain, together with
  indexing, logging, and linting practices.
- Google's [Open Knowledge Format (OKF)](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
  influenced the goal of a portable, vendor-neutral bundle that combines
  human-readable Markdown with machine-readable semantics and supports both
  human and agent consumers.

These sources are influences, not normative dependencies. OWF changes or
rejects their concepts where required by its own goals. Core v0 does not itself
claim a concrete serialization relationship with those sources; an OWF
representation profile MAY define compatibility with a specific external format.
OWF does not claim affiliation with GTD, LLM Wiki, or OKF.

## 2. Conformance Language

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are
to be interpreted as normative requirements.

- **MUST** and **MUST NOT** define Core v0 conformance.
- **SHOULD** and **SHOULD NOT** define recommended behavior that may be omitted
  only for a documented reason.
- **MAY** identifies permitted optional behavior.

### 2.1 Terminology Overview

The following terms are used across multiple sections:

- **Intrinsic state** is persisted current state belonging to an object itself.
  Project and Outcome intrinsic states are **lifecycle states**; Action
  intrinsic states are **execution states**.
- **Terminal disposition** is the successful or unsuccessful semantic result
  that precedes optional archiving: `Completed` or `Cancelled` for an Action,
  `Achieved` or `Abandoned` for an Outcome, and `Completed` or `Abandoned` for a
  Project.
- **Blocked** and **executable** are derived observations about an Action, as
  defined in Section 7.3; neither is an intrinsic state.
- A **Review Signal** is a temporary observation defined in Section 14.2. Its
  **disposition** records the conscious decision about how that Signal was
  handled.
- **Current truth** means the current persistent Workspace objects and their
  relationships, not reconstruction from the Event Log.

## 3. Scope

Core v0 defines:

- the roles and semantics of Core objects and artifacts;
- structural ownership and semantic dependencies;
- intrinsic lifecycle states and derived observations;
- Capture, Inbox Processing, Refinement, Review, Closure Review, and Planning;
- Views, View Snapshots, and Event Logs; and
- conceptual consistency requirements.

Core v0 does not define:

- Markdown or YAML syntax;
- frontmatter, schemas, or directory layout;
- a Computed View query language;
- rendering, user interface, or storage architecture;
- identities of people or agents, assignments, permissions, or collaboration;
- scheduling, calendar behavior, or a `Deferred` lifecycle;
- methodology-specific policies, capacity rules, or signal catalogues; or
- knowledge taxonomies, knowledge graphs, or external artifact integrations.

## 4. Core Roles

An OWF Workspace distinguishes the following roles:

| Role | Core concept | Meaning |
| --- | --- | --- |
| Root context | Workspace | Boundary of one OWF bundle |
| Work objects | Project, Outcome, Action | Commitments and desired change |
| Captured input | Inbox Item | Unresolved temporary input |
| Knowledge | Knowledge Document | Durable context, evidence, or rationale |
| Live projection | View | A current perspective over Workspace objects |
| Historical artifacts | View Snapshot, Event Logs | Explicitly captured or explanatory history |

A Review Signal is a temporary derived observation and MUST NOT be treated as a
persistent Core object. A Review run is a workflow execution and MUST NOT
require a separate persistent work object. Requirements for recording a
completed run are defined in Sections 14.3 and 16.

> **Non-normative rationale:** A Review Signal interprets current Workspace
> state and can be re-evaluated from that state. Persisting it as another source
> of current truth could leave a stale Signal after its underlying condition has
> changed or disappeared. The Event Log may preserve that a Signal was observed
> and how it was dispositioned without turning the observation into a durable
> domain object. A Review run is an execution of a workflow rather than work to
> be organized, so it likewise does not need its own work lifecycle.

## 5. Workspace and Identity

The Workspace is the root context and boundary of an OWF bundle. It is not a
work item and MUST NOT have a work lifecycle.

Every persistent document object MUST have a machine-readable identity. In Core
v0, identity is a logical absolute bundle-relative path that begins with `/` and
does not include a serialization extension. Ownership and other
machine-readable references MUST use the same identity form.

Moving or renaming an object changes its identity. All affected references MUST
be updated. Whether physical directory containment also expresses logical
ownership is defined by the applicable representation profile. The mapping
between logical identity and concrete files is defined by a future
representation profile.

## 6. Work Model

### 6.1 Project

A Project is a top-level initiative container within a Workspace. It MAY own
Outcomes, Actions, and Knowledge Documents.

A Project MUST have exactly one intrinsic lifecycle state:

- `Active`
- `Parked`
- `Completed`
- `Abandoned`
- `Archived`

`Active` means the Project remains relevant and is not intentionally suspended
or terminal. `Parked` means the Project remains relevant but its active pursuit
and ordinary attention are intentionally suspended, subject to Section 6.4.
`Completed` means the initiative has been completed. `Abandoned` means it is no
longer being pursued. `Archived` follows one of those terminal dispositions and
MUST preserve which disposition preceded archiving.

### 6.2 Outcome

An Outcome represents a desired result that requires work and cannot be
completed by one directly executable Action. It MAY own child Outcomes,
Actions, and Knowledge Documents.

Every Outcome MUST have exactly one structural owner: a Project or another
Outcome. Its ownership chain MUST ultimately lead to a Project.

> **Non-normative rationale:** A standalone Action can represent useful work
> without the overhead of an initiative. An Outcome represents a larger desired
> result that requires such context; allowing it directly under the Workspace
> would bypass the organizing role of Project.

An Outcome MUST have exactly one intrinsic lifecycle state:

- `Active`
- `Parked`
- `Achieved`
- `Abandoned`
- `Archived`

An Outcome is `Achieved` when its intended result has become true. Completion of
all currently known Actions MUST NOT imply that the Outcome is achieved.
`Archived` follows `Achieved` or `Abandoned` and MUST preserve which disposition
preceded archiving.

> **Non-normative rationale:** Actions represent only the currently known path
> toward an Outcome. The plan may be incomplete, and performing it may reveal
> additional work or show that the desired result is still not true. Achievement
> is therefore evaluated against the result itself, not inferred from exhaustion
> of its current Actions.

`In Progress`, `Refined`, and `Blocked` MUST NOT be intrinsic Outcome states.
Progress and actionability MAY be derived from the surrounding work graph. An
unresolved dependency constrains achievement as defined in Section 7.2 but does
not make the Outcome blocked or prevent work within it from continuing.

### 6.3 Action

An Action is a concrete step that can be executed directly without further
decomposition. It is always a leaf and MUST NOT own work objects.

Every Action MUST have exactly one owner:

- Workspace, for a standalone Action;
- Project, for work related to an initiative but not to a specific Outcome; or
- Outcome, for work that directly advances that result.

An Action MUST have exactly one intrinsic execution state:

- `Open`
- `In Progress`
- `Waiting`
- `Completed`
- `Cancelled`
- `Archived`

`Waiting` means that progress currently depends on another actor or external
system. It does not require an actor identity in Core v0. `Archived` follows
`Completed` or `Cancelled` and MUST preserve which disposition preceded
archiving.

> **Non-normative rationale:** `Cancelled` ends execution of a concrete step;
> `Abandoned` ends pursuit of a Project or desired Outcome. They have parallel
> structural roles as unsuccessful terminal dispositions but retain distinct
> names because the commitments being ended are different.

Because blocking is derived rather than an execution state, an Action MAY be
both `Waiting` and blocked.

Completing an Action MUST NOT imply that its owning Outcome is achieved.

> **Non-normative rationale:** Completing an Action records that one step was
> performed. The step may be insufficient, may fail to produce the expected
> effect, or may reveal further work. The owning Outcome must therefore be
> evaluated independently against its desired result.

### 6.4 Parking

A `Parked` Project or Outcome remains relevant but is intentionally not being
actively pursued. Parking MUST record a human-readable reason and MAY define a
`review-after` condition.

- Without `review-after`, the object MUST be eligible for every Parked Review.
- With `review-after`, it MUST be excluded from Parked Review until the
  condition is due.
- Becoming due MUST NOT reactivate the object automatically; it makes the
  parking decision eligible for Review.

Parking MUST NOT rewrite descendant states or dependencies. Descendant Actions
may remain technically executable. Ordinary attention-oriented Views and Review
scopes SHOULD exclude descendants through their parked ancestor, while an
intentional Curated View MAY still include them.

## 7. Ownership and Relationships

### 7.1 Structural Ownership

`owns` expresses exclusive structural containment. A work object MUST NOT have
more than one structural owner.

Ownership MUST be unambiguous under the applicable representation profile. A
profile MAY assign ownership semantics to directory structure, explicit
metadata, or another normative mechanism. An implementation MUST NOT infer
ownership from incidental physical placement to which the applicable profile
assigns no ownership meaning.

### 7.2 Execution Dependencies

`depends-on` expresses an execution dependency. Its source and target MAY each
be an Action or Outcome in any combination and MAY belong to different
Projects. Project dependencies are not part of Core v0.

A dependency is satisfied when its target reaches its successful terminal
disposition:

- an Action target is satisfied by `Completed`;
- an Outcome target is satisfied by `Achieved`; and
- an archived target is evaluated using its preserved terminal disposition.

An unresolved dependency MUST prevent its source from entering its successful
terminal disposition. For an Action source, it also affects blocking and
executability as defined in Section 7.3. For an Outcome source, it MUST NOT by
itself prevent Refinement or execution of work within that Outcome.

`Cancelled` and `Abandoned` MUST NOT satisfy a dependency automatically. Such a
relationship remains unresolved until Review removes, redirects, or otherwise
resolves it.

Dependency cycles are valid representations. A conforming linter MUST detect
and report them. A cycle SHOULD normally be reported as a warning because it may
honestly expose weak or incomplete Refinement rather than structural
corruption.

### 7.3 Blocking and Executability

`Blocked` MUST NOT be an intrinsic state. Core v0 applies the derived
observation only to Actions; an Outcome with an unresolved dependency is
constrained from becoming `Achieved` but is not thereby blocked.

An Action is blocked when:

- it has an unresolved `depends-on` relationship; or
- it has an explicit manual block with a human-readable reason.

Manual blocking MAY be used when no useful prerequisite object is known. Review
SHOULD identify stale manual blocks and replace them with richer semantic
relationships when appropriate.

An Action is executable when it is `Open` or `In Progress`, is not `Waiting`,
and is not blocked. Executability is distinct from whether the Action should
currently receive attention. An Action MAY therefore remain executable beneath
a parked ancestor.

## 8. Refinement and Promotion

Refinement decomposes an Outcome only far enough to reveal meaningful
executable Actions. Complete decomposition MUST NOT be required before work
begins. Further Actions or child Outcomes MAY be discovered during execution or
Review.

If an apparent Action is discovered to require decomposition, it MAY be
promoted to an Outcome. Promotion is a Refinement operation and MUST NOT be
treated as a lifecycle transition. The resulting Outcome MUST receive a valid
Project or Outcome owner. Promotion of a Workspace-owned Action therefore MUST
select a new structural owner.

Promotion MUST assign a valid Outcome lifecycle state and MUST NOT assume a
general one-to-one mapping from Action execution states. `Active` is the common
result when the newly recognized Outcome remains in pursuit, but the operation
MAY select another state when its semantics require one.

An active Outcome with no executable Action MUST NOT be structurally invalid.
It MAY produce a Review Signal.

## 9. Closure and Archiving

Terminal transitions MUST NOT cascade blindly through owned work.

Before a Project or Outcome enters a successful or abandoned terminal state,
its non-terminal descendants MUST undergo Closure Review. Each remaining item
MUST be consciously:

- moved to an appropriate terminal state;
- moved to another valid owner; or
- represented by a new Inbox Item for possible future clarification.

The parent MUST NOT enter its terminal state until this work is dispositioned.

Archiving MUST follow semantic completion, achievement, cancellation, or
abandonment and MUST NOT be used to bypass unresolved work. Because the Event
Log is not guaranteed to be complete, an archived work object MUST preserve its
preceding terminal disposition in current state.

## 10. Inbox and Capture

### 10.1 Inbox Item

Capturing unresolved input creates a persistent Inbox Item. An Inbox Item is
not work, knowledge, or a commitment. Its existence means that processing is
incomplete; it MUST NOT require a separate lifecycle state.

Known executable work MAY be created directly as an Action. Core v0 MUST NOT
require a known Action to pass through the Inbox or Inbox Processing.

Every Inbox Item MUST record its original `captured-at` time. Its primary
content is the original captured input. Enrichment MUST NOT change the original
`captured-at` value.

An Inbox Item MUST NOT own work or participate in the work dependency graph. It
MUST NOT be used as durable storage for valuable knowledge or as a durable
dependency target.

### 10.2 Inbox Processing

Inbox Processing is one workflow with two logical stages:

- **Clarify** determines what the captured input means.
- **Organize** represents that interpretation through OWF operations.

One Inbox Item MAY produce one or more operations and one or more resulting
objects. Core v0 MUST NOT require a closed catalogue of processing targets.

Successful processing has two forms:

- **Resolved:** intended OWF operations completed successfully.
- **Discarded:** an explicit decision established that nothing should be
  retained or created.

The Inbox Item MUST be consumed only after either successful result. Consumption
removes it from the current Inbox and current persistent object set; it is an
operation, not an Inbox lifecycle state. A representation MAY retain historical
evidence of the consumed item, but MUST NOT expose that evidence as a current
Inbox Item. If interpretation remains incomplete or an intended operation
fails, the item MUST remain unresolved in the Inbox. Remaining in the Inbox is
not a disposition.

Content that must survive processing MUST be preserved in an appropriate
durable object, such as a Knowledge Document. The Event Log MAY record
interpretation, operations, resulting objects, discard, and consumption, but it
MUST NOT substitute for retained content.

Age and similar observations MUST be derived from `captured-at`; they MUST NOT
be modeled as Inbox lifecycle states. Computed Views MAY expose aging or
otherwise noteworthy Inbox Items.

## 11. Knowledge Documents

A Knowledge Document preserves durable context, rationale, evidence, or
supporting information. It is not a work commitment and MUST NOT participate in
the work execution lifecycle.

A Knowledge Document MAY be Workspace-level or owned by one Project or Outcome.
An Action MAY reference a Knowledge Document but MUST NOT own one.

Core v0 does not define Knowledge Document categories, lifecycle, graphs, or
external artifact semantics.

## 12. Views

### 12.1 General Semantics

A View is a first-class live projection over persistent Workspace objects. It
MUST NOT own its members or alter their intrinsic lifecycle merely through
membership.

A View is one of:

- **Curated View:** explicitly maintains membership and MAY maintain ordering
  or grouping.
- **Computed View:** derives membership from a declarative rule.

A View MAY expose an optional machine-readable `purpose` from an open
vocabulary. Purpose MUST NOT create a closed View subtype or lifecycle. Common
non-normative values include `planning`, `review`, `focus`, `waiting`, and
`dashboard`.

Core v0 does not define a query language. Lists, boards, tables, calendars,
timelines, and trees are renderer concerns rather than distinct Core objects.

### 12.2 Optional Planning Window

A View used for Planning MAY declare a structured temporal window. Where such
metadata is represented, implementations SHOULD use the canonical semantic
names `window.start` and `window.end`. Either boundary MAY be absent. Omitting
both permits rolling or unbounded planning.

Reaching a window boundary MUST NOT mutate the View or its members. It MAY
produce a signal, suggest Review, offer a Snapshot, or assist with creating a
subsequent View.

## 13. View Snapshots

A View Snapshot is an immutable historical materialization of a View at a
specific time. It is not a work item, live View, or lifecycle state.

A Snapshot MUST record:

- its source View;
- capture time;
- selected snapshot projection; and
- the items contained in the View at capture time.

At minimum, captured membership MUST preserve each item's identity, type, and
human-readable title. A Snapshot MAY additionally preserve selected properties
or the complete represented state of each selected item.

A full item snapshot MUST NOT recursively copy owners, descendants,
dependencies, Knowledge Documents, or other related objects unless they are
explicitly included in the selected projection.

A Snapshot MUST be immutable. A later capture MUST create another Snapshot.
Current objects remain the source of present truth; the Snapshot is the reliable
record of the projection explicitly captured at its timestamp.

## 14. Review

### 14.1 Purpose and Modes

Review restores trust in the Workspace by identifying representations that may
no longer reflect reality and deciding what should happen next.

Review supports these modes:

- **Event-driven Review:** examines objects and relationships affected by a
  change or new information.
- **Periodic Review:** deliberately examines a broader selected scope and
  protects against silent decay.
- **Parked Review:** reconsiders parked Projects and Outcomes whose review
  condition is due.

Every Review run MUST have an explicit scope. Project, Outcome, and Action are
the primary work objects of Review. Knowledge Documents and Views MAY be
reviewed without participating in every run. A Review scope MAY specialize in
one coherent subset without introducing another Review mode. Review detects
unresolved Inbox Items but MUST NOT process them; it MAY lead into Inbox
Processing.

### 14.2 Signals and Dispositions

A Review policy evaluates conditions within a scope:

`condition -> signal -> disposition -> operation(s)`

A Review Signal:

- MUST be a derived temporary observation;
- MUST reference relevant Workspace objects;
- MUST explain why attention may be required;
- MUST NOT be treated as structural invalidity solely because it exists;
- MUST NOT prescribe one mandatory resolution; and
- MUST receive a disposition during a completed Review run.

Core v0 does not define a universal catalogue of signal types, thresholds,
detection algorithms, or methodology rules. A missing owner, broken reference,
or other structural invalidity is a lint or validation finding rather than a
Review Signal.

Follow-up and escalation MAY remain within the same `Waiting` Action while its
expected result remains unchanged. A separate or replacement Action is also
permitted.

### 14.3 Review Views and Runs

Review is a workflow, not a View. A Review View MAY select and present
candidates but MUST NOT own the work or the Review process.

A Review run MAY be completed, interrupted and resumed, or abandoned. A run is
complete when every detected signal in scope has a recorded disposition.
Section 16 defines the recording requirements for completed, interrupted, and
abandoned runs. A signal SHOULD be re-evaluated before acting if its underlying
information may have changed.

> **Non-normative rationale:** Recording a completed Review distinguishes
> "examined and dispositioned" from "never examined" and supports the claim
> that trust was consciously restored. It does not make the Event Log a complete
> history of the Workspace.

## 15. Planning

Planning selects existing work for intentional focus. It operates on already
defined Projects, Outcomes, and Actions and produces a Curated View.

Planning MUST NOT introduce a `Planned` lifecycle state. View membership
expresses intended focus, not intrinsic priority or guaranteed completion.
Membership, ordering, and grouping belong to the View.

A Planning View MAY:

- contain Projects, Outcomes, Actions, or a mixture;
- contain blocked work;
- omit prerequisites and transitive dependencies;
- change while the plan is active;
- overlap other Planning Views; and
- use or omit a fixed planning window.

Planning MUST remain separate from Review, Refinement, Inbox Processing,
ownership changes, and lifecycle decisions. Discovering the need for one of
those activities does not make it part of Planning.

Computed Views MAY help discover candidates, but the result of intentional
Planning MUST be a Curated View. Core v0 does not prescribe capacity, work in
progress, completion, rollover, or methodology rules.

Review MAY use a Planning View as its scope at the end of a planning period. A
Snapshot MAY preserve a reliable historical projection before or after such a
Review.

## 16. Event Logs

Event Logs explain semantic changes, decisions, Review activity, and rationale.
Current OWF objects remain the source of present truth. An Event Log MUST NOT be
used as an event-sourced authority for reconstructing current state.

A representation profile MAY define multiple independent Event Logs aligned
with its authoritative representations. It MUST define which events belong to
each log. OWF does not require correlation identifiers, global ordering,
cross-log transactions, or a unified materialized history.

OWF-aware operations SHOULD record a semantic event in the log responsible for
the changed source object. Events involving another representation MAY reference
objects there using the applicable OWF reference mechanism.

A Review run represented as completed MUST have a durable Event Log record that
identifies its mode and scope and records a disposition for every detected
Signal in that scope. It SHOULD record resulting operations and supplied
rationale. Interrupted or abandoned Review runs MAY be recorded with the
information available at that time.

Event Logs do not guarantee a complete history of Workspace state. They MUST NOT
substitute for a View Snapshot when reliable historical evidence is required,
or for a durable current object when content must remain available. Logs record
completed changes; they do not coordinate operations or provide transaction
recovery.

Core v0 does not require actor identity in Event Log entries and does not
distinguish changes made by a human, AI agent, tool, or integration.

## 17. Conceptual Validation

A conforming validator MUST report structural violations including:

- a work object with missing or invalid ownership;
- an Outcome ownership chain that does not lead to a Project;
- ownership multiplicity where exclusive ownership is required;
- a broken machine-readable reference;
- an unsupported dependency endpoint such as a Project; and
- an archived work object whose preceding terminal disposition is unavailable.

A conforming linter MUST detect dependency cycles but MUST NOT reject an
otherwise representable Workspace solely because a cycle exists.

The normative lint catalogue, diagnostic identifiers, severity system, and
autofix behavior are defined by a future lint contract.

## 18. Extensions and Conformance

An implementation MAY add extensions for behavior outside Core v0, including
scheduling, deferral, collaboration, identities, advanced knowledge models, or
methodology policies.

An extension MUST NOT silently change the meaning of Core objects, lifecycle
states, ownership, relationships, or workflows. Extension data SHOULD remain
distinguishable from Core semantics.

An OWF Workspace conforms to this conceptual specification when its objects,
relationships, and current semantics satisfy all applicable MUST and MUST NOT
requirements in this document. An implementation claiming Core v0 conceptual
conformance MUST preserve those semantics when reading or changing a conforming
Workspace. Concrete serialization conformance will be defined by a future
representation profile.

## 19. Deferred Representation Work

The following work is deliberately deferred:

- Markdown document structure and YAML frontmatter;
- required and optional properties for each serialized document type;
- file and directory conventions;
- date-time and timezone encoding;
- concrete reference and ownership syntax;
- Computed View query envelope;
- ordering and grouping representation;
- extension namespacing and compatibility rules;
- Event Log and Review-run serialization; and
- the complete lint contract.

Representation design MAY clarify this specification but SHOULD NOT reopen Core
semantics unless it reveals a genuine contradiction or missing domain concept.
