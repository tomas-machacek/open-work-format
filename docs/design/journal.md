# Open Work Format -- Design Journal

## Purpose and Rules

This append-only journal captures the evolution of OWF: rationale, alternatives,
trade-offs, and historical context. It is not a specification. Normative text
belongs in `spec/core-v0.md`; current decisions belong in
`docs/design/core-v0-design-review.md`.

## 2026-07-05 -- From a GTD Application to an Open Work Format

The work began as a design for a personal GTD-based tool. The more interesting
problem quickly emerged: defining an open, text-based, AI-friendly
representation of work, inspired by LLM-Wiki and Google's Open Knowledge Format.

Desired properties were human readability and editability, AI and Git
friendliness, no hidden database, and usability without AI. Markdown files were
envisioned as the source of truth, with one document per object, minimal
frontmatter, and relationships expressed through links and metadata.

An important separation emerged between a rich conceptual domain model and a
simple representation model. Early domain candidates were Project, Capability,
Outcome, Action, Waiting, Reference, and View.

### Why Outcome Appeared

Traditional GTD calls anything requiring more than one Action a project. That
conflicts with the much larger meaning of Project in corporate and software
contexts. The initial hierarchy therefore became:

`Project -> Capability -> Outcome -> Action`

Outcome filled the gap between a long-lived initiative and a small executable
Action. It became the natural result-oriented planning unit.

### Knowledge and Views

Reference documents were recognized as knowledge rather than work. ADRs, design
notes, documentation, and meeting notes could support work without becoming
Actions or Outcomes. The term later evolved into Knowledge Document.

Views were recognized as first-class documents rather than UI features. A View
could represent Today, This Week, Sprint, Review, Waiting, or another projection
over the same work objects. Ordering was consequently associated with Views,
especially global ordering, so that stable Action documents would not need to be
continually rewritten.

Kanban was initially considered a "View of Views" but was later understood as a
rendering of a grouped View. Lists, boards, tables, timelines, calendars, and
trees belong to presentation rather than the core data model.

### Consistency and Operations

Because editable Markdown permits inconsistencies, the format was expected to
define a lint contract covering structure, links, consistency, and severities.
The contract would define interoperable rules, not a particular implementation.

Attention also shifted from nouns to domain operations such as Capture,
Clarify, Organize, Review, and Engage. The standard should describe concepts,
relationships, invariants, operations, and consistency rules, but not prescribe
a programming language, database, UI, or runtime architecture.

## 2026-07-08 -- Simplifying the Planning Hierarchy

Design review showed that Capability mainly added another fixed decomposition
level rather than distinct essential semantics. Core v0 therefore moved to
recursive Outcomes:

`Project -> Outcome -> Outcome ... -> Action`

Outcome became explicitly result-oriented. Its success is determined by whether
the intended result became true, not by whether all currently known Actions were
completed. This enabled progressive planning: begin when meaningful next Actions
are known and refine later.

Action Promotion was introduced for cases where a supposedly atomic Action is
later discovered to require decomposition. Promotion changes the planning
structure; it is not a lifecycle transition.

## 2026-07-15 -- Intrinsic State and Semantic Relationships

Outcome lifecycle was deliberately kept small: Active, Achieved, Abandoned, and
Archived. In Progress, Refined, and Blocked were rejected as intrinsic Outcome
states because they describe activity, operations, or observations derived from
the surrounding graph.

This led to a broader principle: when a situation can be explained through a
semantic relationship, prefer the relationship over an additional lifecycle
state. Dependencies therefore use `depends-on`; an unresolved dependency can
make work blocked without changing its intrinsic state.

## 2026-07-16 -- Action Ownership

The assumption that every Action must belong to an Outcome proved too strict.
It would force artificial Outcomes for standalone tasks or early project setup.
The accepted model gives every Action exactly one meaningful owner:

- Workspace for standalone Actions.
- Project for project-related Actions not yet tied to a specific Outcome.
- Outcome for execution work advancing a specific result.

This removed the need for bootstrap Outcomes, synthetic non-project containers,
or a generic `related-to` relationship created only to satisfy the model.

## 2026-07-16 -- Blocking and Waiting

The Action lifecycle was settled as Open, In Progress, Waiting, Completed,
Cancelled, and Archived. Waiting is intrinsic when progress depends on another
actor or external system.

Blocked is not an intrinsic state. It may be derived from an unresolved
`depends-on` relationship or recorded explicitly with a reason when no useful
dependency object is known. Explicit blocking is a pragmatic escape hatch; it
avoids forcing users to invent prerequisite Actions. An Action may be both
Waiting and Blocked.

Review was identified as the mechanism for finding stale manual blocks and, when
appropriate, refining them into richer semantic relationships. Designing Review
was selected as the next topic.

## 2026-07-18 -- Review, Parking, and Silent Decay

Review was defined as the activity of restoring trust in the workspace. Two
complementary forms first emerged: event-driven Review reacts continuously to
new information, while periodic Review deliberately searches for silent decay
and sleeping work that emitted no signal. A third form, Parked Review, handles
work that was intentionally deferred.

Introducing a separate `attention: parked` dimension was considered and
rejected as unnecessary. `Parked` instead became an intrinsic Outcome state:
the result is still desired but is not being actively pursued. Parking records a
reason. It may optionally record `review-after`; without a date the Outcome is
included in every Parked Review, while a dated Outcome remains excluded until
the date is due. The date triggers reconsideration, not automatic reactivation.

Refinement remains an independent operation with two common triggers:
just-in-time discovery during execution and systematic discovery during Review.

Planning also emerged as a distinct OWF workflow. Review restores trust in the
representation; Planning decides which trusted work should receive attention
next and may update Views. Planning was deliberately deferred until Review is
designed further.

## 2026-07-18 -- Review Scope and Methodology Boundary

Review scope was made explicit rather than assuming that every run examines the
whole Workspace. Projects, Outcomes, and Actions are the primary work objects;
Knowledge Documents and Views remain reviewable through relevant or specialized
reviews. Workspace normally supplies the boundary. Event-driven, periodic, and
parked modes select their scopes differently.

Inbox processing was kept outside Review. Review only signals the presence of
unprocessed Inbox Items and may lead into the appropriate processing workflow.
The precise distinction between `Clarify` and `Organize` was deliberately left
open; they may remain separate workflows or become stages of one broader
workflow.

GTD was reaffirmed as inspiration rather than a template. Its practices provide
design evidence, but OWF should adopt only those that solve general
knowledge-work problems independently of GTD terminology and structure.

## 2026-08-01 -- Review Signals, Closure, and History

Review signals were separated from lint errors and methodology rules. A signal
means that a situation may need attention; it is not necessarily invalid. Core
v0 records a compact catalogue for Outcomes, Actions, Projects, and
cross-cutting concerns while leaving detection algorithms and time thresholds
to Review policies and implementations. An executable Action was defined as
Open or In Progress, neither Waiting nor blocked.

Waiting follow-up was deliberately kept simple. Follow-up or escalation may
remain within the same Waiting Action while the expected result is unchanged.
Creating a separate or replacement Action remains allowed. Multiple detection
mechanisms were consolidated into one `Waiting Requires Attention` signal.

Project lifecycle was defined as Active, Parked, Completed, Abandoned, and
Archived. Project parking follows the same optional `review-after` semantics as
Outcome parking.

Lifecycle changes do not automatically cascade. Closing a Project or Outcome
triggers Closure Review of non-terminal descendants. Each item is terminated,
moved to another valid owner, or recaptured as an Inbox Item representing
possible future work. Parking instead suspends the subtree without rewriting
descendant states.

The design introduced a logical append-only Event Log. Objects remain the source
of current truth; the log records semantic changes and their rationale. Review
runs, detected signals, dispositions, operations, actors, and completion are
logged. Signals remain derived observations rather than persistent work
objects.

Review was confirmed as a workflow rather than a View. Review Views optionally
select and present candidates, while event-driven Review may operate directly
on affected objects. A Review run is correlated through Event Log entries and
is complete when each detected signal has a disposition. The next open topic is
the authority boundary between humans and AI agents during Review.

## 2026-08-01 -- Rejecting Identity and Authorization from Core

Exploration of human-versus-agent Review initially produced a possible model of
observation, proposal, decision, execution, delegation, and authorization. This
was recognized as a drift away from a lightweight work format into an agent
authorization framework.

Even retaining only an Event Log actor was rejected because it would introduce
identity semantics and invite roles, permissions, and collaborative governance.
The original motivation was reaffirmed: OWF primarily supports an individual's
knowledge work rather than team project management.

Core v0 therefore treats human-, agent-, tool-, and integration-performed
changes identically. The Event Log records what changed, why, and how Review
signals were dispositioned, without requiring who performed the change.
Identity, authorization, confirmation, collaboration, assignments, workload
management, and management reporting remain implementation or extension
concerns. This decision deliberately preserves simplicity rather than adding a
new mechanism.

## 2026-08-01 -- Simplifying Review Signals

The growing catalogue of Outcome, Action, Project, and cross-cutting signals was
recognized as another possible source of Core complexity. Enumerating concrete
signals had been valuable as a design exercise: it exposed executable Action
semantics, parking, Project lifecycle, Waiting follow-up, Closure Review, and the
Event Log. The catalogue itself, however, was not needed as a normative Core
construct.

Core v0 now defines only the general flow `condition -> signal -> disposition ->
operation(s)`. Signals are derived, temporary observations that direct conscious
attention without declaring an error or prescribing a solution. Concrete rules,
thresholds, and vocabularies belong to Review policies and implementations.
Representative signals remain as non-normative heuristics and design examples,
not as a closed or mandatory registry.

## 2026-08-06 -- Review Design Closed for Core v0

A final consistency audit found no unresolved contradiction in the conceptual
Review model. Two editorial inconsistencies were corrected: Parked Review now
explicitly covers both Projects and Outcomes, and Inbox processing no longer
distinguishes between a human and an agent.

Decisions 009 through 016 were promoted from design direction to accepted Core
v0 decisions. Review is now conceptually complete: it restores trust through
scoped event-driven, periodic, or parked runs; policies turn conditions into
temporary signals; signals receive dispositions that may lead to operations;
Closure Review resolves descendant work before terminal parent transitions;
Review Views remain optional projections; and the Event Log preserves Review
history and rationale.

Concrete policies, signal catalogues, thresholds, scheduling, UI, file syntax,
and Event Log representation remain deliberately deferred. They are
implementation or representation work and should not reopen the conceptual
model unless they reveal a genuine missing semantic.

## 2026-08-06 -- Planning as a Curated Projection

Planning was initially described narrowly as selecting Actions for the nearest
execution window. Longer-horizon examples, such as choosing Outcomes for a
quarter, showed that the same activity applies at different levels of the work
graph. The model was generalized without introducing separate short- and
long-term Planning workflows.

At an abstract level, Planning is a function over existing work items that
produces a projection. To keep OWF understandable in domain language, it is
defined as selecting Projects, Outcomes, or Actions for intentional focus,
optionally within a planning window, with a Curated View as the result.

Short horizons commonly select Actions; longer horizons commonly select
Outcomes or Projects. Mixed Views remain allowed. Membership expresses intent,
not a new `Planned` state or guaranteed completion. Blocked work may be selected
without forcing all prerequisites into the same View. Computed Views may supply
candidates, and methodology-specific policies may recommend work-in-progress
limits, but neither becomes a Core constraint.

Planning deliberately operates on already defined work. Review, Refinement,
Inbox processing, ownership changes, and lifecycle decisions remain separate
activities even when Planning reveals that one of them is needed.

## 2026-08-06 -- View Snapshots for Reliable Planning History

End-of-window Review naturally reuses Review with the Planning View as its
scope. The View may remain as a historical expression of intended work, while a
new Curated View represents the next planning window. This raised a separate
need: preserving membership and item state at a precise point in time for later
planning analysis.

The Event Log was judged insufficient for this purpose. It is useful explanatory
history but is not guaranteed to be complete, especially when files are edited
outside OWF-aware tools. A live historical View also preserves membership intent
but not the past state of referenced objects.

View Snapshot was therefore introduced as an immutable materialization of a View
and a user-selected projection of its items. The projection may preserve only
identity, type, and title; selected fields such as lifecycle state; or the full
represented state of each selected item. Full capture is limited to selected
items and does not recursively copy related objects unless explicitly requested.

Planning may use start and end snapshots to support later comparison of planned,
completed, carried-over, and unplanned work. These analytics and any automatic
rollover remain implementation or methodology concerns rather than Core rules.

## 2026-08-06 -- Open View Purpose and Optional Planning Windows

Discussion of a "Planning View" raised the question of whether OWF needed View
types. A closed type enum was rejected because Views can serve new purposes
without requiring changes to Core. A description alone, however, would make it
hard for tools to recognize intent. Views may therefore carry an optional,
machine-readable `purpose` from an open vocabulary, while their description
explains the particular intent to a person. Values such as `planning`, `review`,
and `focus` are recommendations rather than an exhaustive registry.

Planning does not always have a fixed window. Iterations and quarters have
explicit boundaries, while a Kanban-style queue may simply hold enough upcoming
work. A Planning View may therefore carry an optional structured `window`. To
avoid needless divergence between implementations, `window.start` and
`window.end` are the recommended canonical property names; either may be
omitted. Precise date-time representation remains a later representation
decision.

A boundary only supplies a condition that a tool can surface. It does not close
the View, create a snapshot, roll work forward, or mutate item state
automatically. Planning Views remain mutable, items may appear in several Views
or plans, and the user or implementation decides when Planning is complete.

## 2026-08-06 -- Planning Design Closed for Core v0

A final consistency audit found no unresolved conceptual contradiction in the
Planning model. One older journal sentence was corrected because it still
implied that every plan requires a fixed window. Decisions 017 through 019 were
promoted from design direction to accepted Core v0 decisions.

Planning is now conceptually complete: it selects already defined Projects,
Outcomes, or Actions into a Curated View; membership expresses intent rather
than lifecycle state; fixed temporal boundaries are optional; plans may change
and overlap; and blocked work remains valid plan content. Review, Refinement,
Inbox processing, and lifecycle changes remain separate workflows. Scoped
Review restores trust at the end of a window when applicable, while an explicit
View Snapshot preserves reliable historical state when needed.

File syntax, date-time representation, planning policies, capacity and WIP
rules, renderers, metrics, reminders, and rollover automation remain deferred.
They are representation, methodology, or implementation work and should not
reopen the conceptual Planning model unless they expose a genuine missing
semantic.

## 2026-08-07 -- Inbox Processing as Resolution and Consumption

The earlier open question about `Clarify` and `Organize` was resolved in favor
of one Inbox Processing workflow. Clarify determines what captured input means;
Organize expresses that interpretation through OWF operations. The distinction
remains useful for explanation without forcing two separately managed Core
workflows.

Capture creates an Inbox Item containing unresolved input and its original
`captured-at` time. The item is neither work nor durable knowledge, and its
existence is sufficient to express that it remains unresolved. It therefore
needs no lifecycle state. Source and context may be added, but enrichment does
not reset the capture time.

Processing may perform one or more operations and produce one or more objects,
or it may explicitly discard the input. The Inbox Item is consumed only after
the intended operations succeed. An incomplete interpretation or failed
operation leaves it in the Inbox. Content that must survive is transferred into
a durable resulting object rather than retained through the temporary Inbox
Item or the non-guaranteed Event Log.

General Views were confirmed to range over persistent OWF objects, not only
Projects, Outcomes, and Actions. Computed Views may therefore expose aging Inbox
Items using `captured-at`. This avoids a `Stale` state and keeps concrete age
thresholds in policies or implementations. The narrower Project/Outcome/Action
scope remains specific to Planning.

## 2026-08-07 -- Inbox Processing Design Closed for Core v0

A consistency audit found no conflict with the established Review, Planning,
View, or Event Log models. The older Clarify/Organize question was removed from
the open-question list, Inbox Item semantics were made explicit, and View scope
was clarified.

Inbox Processing is now conceptually complete: Capture creates temporary
unresolved input with a stable capture time; a single processing workflow
interprets and organizes it; successful operations or explicit discard consume
it; and Views expose aging or otherwise noteworthy items. Capture integrations,
file syntax, date-time representation, thresholds, recovery mechanics, and log
representation remain implementation or representation work.

## 2026-08-07 -- Core v0 Cross-cutting Consistency Audit

The first whole-Core audit found no need to redesign the established workflows,
but it exposed several foundational decisions that had remained implicit or
provisional. Action Semantics was promoted from candidate to accepted without a
semantic change.

The apparent conflict between executable Actions and parked ancestors was
resolved by distinguishing executability from attention. Parking preserves all
descendant states and dependencies. A descendant Action may remain executable,
while ordinary attention-oriented Views and Review scopes normally omit the
parked subtree. Curated selection remains possible and is not prohibited by
Core.

Semantic dependencies now support Action and Outcome endpoints in any
combination and across Project boundaries. A target Action satisfies a
dependency through `Completed`; a target Outcome through `Achieved`. Cancellation
or abandonment requires Review rather than silently satisfying the relationship.
Cycles remain valid representations because they can expose incomplete
Refinement, but linting must report them, normally as warnings. This preserves
the real graph without forcing placeholder Actions.

The audit also made the root and object inventory explicit. Workspace is the
bundle boundary; Projects are top-level initiative containers; Outcomes have
exactly one Project or Outcome owner and ultimately belong to a Project. Work,
captured input, knowledge, live projections, historical artifacts, and temporary
Review observations now have distinct roles.

Knowledge Documents, Views, and path-based identity were promoted from design
directions to accepted Core foundations because accepted workflows already
depend on them. Delegation and actor identity, Scheduled and Deferred behavior,
advanced knowledge models, and methodology-specific structures were explicitly
deferred beyond Core v0.

Finally, the audit noted that archiving must not erase the preceding terminal
disposition. This is necessary for dependencies and current-state interpretation
because the Event Log is not guaranteed. Exact representation remains deferred.

## 2026-08-07 -- Core v0 Design Closed

After the cross-cutting audit, all 24 design decisions were accepted and no
unresolved conceptual blocker remained. The audit covered object roles,
ownership, lifecycles, dependencies, workflow boundaries, projections,
historical artifacts, identity, and explicit exclusions from Core.

OWF Core v0 is therefore conceptually closed. Its baseline combines a small
recursive work model with temporary captured input, durable knowledge, Views,
Snapshots, Review, Planning, and a non-event-sourced Event Log. Derived
observations remain separate from intrinsic state, and methodology-specific or
collaborative behavior remains outside the personal lightweight Core.

Closure does not claim that the concrete format is finished. Markdown/YAML
syntax, frontmatter, directory conventions, reference representation, Computed
View query envelopes, ordering, extension points, and normative lint behavior
form the next design phase. Representation work may expose a genuine semantic
gap, but implementation preference alone should not reopen the closed Core
model.

## 2026-08-27 -- Operational UX Reopens the File-Based Assumption

Detailed Markdown designs for Actions and Inbox Items exposed a usability
problem rather than merely a syntax problem. These objects change frequently and
are handled mainly through short operational interactions: capture, state
change, filtering, completion, and contextual navigation. Requiring generic
file editing made these interactions substantially heavier than the board and
capture tools OWF is intended to match.

The design therefore no longer assumes that every OWF object must be stored as a
Markdown document or nested Markdown record. Markdown remains the natural medium
for durable Project, Outcome, and Knowledge context. Actions and Inbox Items may
instead use a purpose-built operational store with a graphical interface for
humans and a CLI or structured API for agents.

This weakens the earlier interpretation of tool independence but preserves its
intent. OWF remains independent of any one application through interoperable
semantics and interfaces; it no longer requires every frequent operation to be
convenient through generic file or Markdown tools. Usability takes precedence
where the two conflict.

The operational store is not a separate work system. Actions and Inbox Items
must remain part of the same logical and locally available Workspace, share its
identity and navigation model, and be equally operable by humans and agents.
Projects and Outcomes must expose their Actions, and every Action must navigate
directly to its Workspace, Project, or Outcome owner.

Quick Capture was separated from the Inbox object type. Unresolved input may be
captured as an Inbox Item from text alone, optionally with a URL or screenshot.
Known executable work may be created directly as an Action without passing
through Inbox Processing. An Action may be created from its title, defaults to
Open, and may obtain its owner from the current context or a fast explicit
selection. Inbox Items do not retain an owner or capture-context relationship.

Critical scenarios remain design and conformance evidence rather than part of
the compact Core specification. Seven Operational UX Principles record the
resulting requirements without prescribing a specific tool, UI, database, or
serialization.

## 2026-09-02 -- Action Operational UX Principles

Ten critical Action scenarios were reviewed: title-only creation, contextual
creation, selecting work through Views, common state transitions, Waiting,
dependencies and manual blocking, navigation to ownership context, occasional
reorganization and Promotion, agent-driven creation and change, and terminal
cleanup and Archive.

The highest-frequency scenarios are creation, contextual creation, selecting
work, and changing state. Their interaction cost must not be increased merely
to expose less frequent dependency, Promotion, ownership-change, or Archive
operations. This frequency distinction reinforces progressive disclosure as a
design requirement.

Four additional Operational UX Principles were accepted. Simple Actions are
title-first and begin Open; frequent transitions are available directly from
compact presentations; richer structure is added progressively; and ordinary
operational changes preserve Action identity and references. The last principle
includes ownership change and Archive, removing the identity instability of the
earlier path-based Markdown Action candidate.

The existing principles continue to cover direct creation without Inbox
Processing, minimal interruption, strong Action-owner navigation, one logical
and locally available Workspace, equal human and agent capabilities, and
immediate durable feedback. Views remain responsible for organizing attention;
the operational store supplies authoritative Actions and suitable filtering
without becoming a competing planning model.

Critical scenarios remain non-normative design and conformance evidence. The
principles constrain the future operational representation without prescribing
Kanban, a database, or a specific graphical interface.

## Historical Open Questions

The original exploration deferred representation of dynamic Views, ordered
collections, minimum frontmatter, queries, external synchronization, and the
exact role of Waiting. Some of these have since been resolved; remaining current
questions are tracked in `docs/design/core-v0-design-review.md`.
