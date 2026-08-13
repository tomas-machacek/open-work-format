# Open Work Format -- Design Principles

> Status: Living document

This document captures the architectural principles that guide OWF. Unlike the
Design Journal, it does not explain how ideas evolved. Unlike the Specification,
it is not normative. It provides a stable basis for evaluating design decisions.

## Goals

- Create an open representation of knowledge work.
- Keep the model understandable and maintainable by humans.
- Make the format naturally usable by AI agents.
- Remain independent of any specific application.

## Non-Goals

- Define a UI.
- Define a database schema.
- Standardize a query language.
- Replace existing project-management methodologies.
- Define identities, teams, roles, permissions, or approval policies.
- Provide workload management or management reporting.
- Become a collaborative project-management framework.

## Principles

### P1. Human-first

A human must be able to understand and maintain an OWF workspace without AI.

### P2. AI-native

AI should be able to reason about the workspace with minimal hidden state.

### P3. Documents as the Unit of Information

The primary unit of representation is a document, not a database row.

### P4. Explicit Semantics

The domain model should express concepts such as Action, Outcome, and View
directly instead of reducing everything to generic nodes.

### P5. Separation of Domain and Representation

The conceptual model must not depend on Markdown, YAML, directory layout, or any
specific serialization.

### P6. Knowledge and Work Are Different

Knowledge explains work. Work changes the world. Neither should absorb the
responsibilities of the other.

### P7. Views Organize Attention

Views do not own work. They organize perspectives over existing work.

### P8. Simplicity over Completeness

The standard should intentionally leave advanced behavior to extensions rather
than making the core model complex.

### P9. Tool Independence

Multiple implementations should be possible while remaining interoperable.

### P10. Prefer the Smallest Useful Core Model

New core concepts should be introduced only when they provide semantics that
cannot be expressed by existing concepts. OWF prefers recursive composition over
fixed hierarchy levels whenever the domain meaning remains unchanged.

### P11. Progressive Planning

The complete execution plan is not required before work begins. Work should
start as soon as the next meaningful Actions are known. Additional Actions or
child Outcomes may be discovered during execution without changing the intent
of the parent Outcome.

Consequences:

- Outcomes are result-oriented, not plan-oriented.
- Actions represent the currently known path toward an Outcome.
- Completing all known Actions does not necessarily complete an Outcome.
- Review may discover new Actions and further decomposition.

### P12. Distinguish Intrinsic State from Derived Observation

Core object state should represent properties intrinsic to the object itself.
Situations derived from the surrounding graph, the currently known plan, or a
particular methodology should normally be expressed through Views, Review,
relationships, or extensions rather than added as intrinsic states.

Consequences:

- Outcomes do not have an intrinsic `Blocked` state in Core v0.
- Signals such as "no executable Action is currently known" remain expressible
  without expanding the Outcome lifecycle.
- Action waiting semantics remain distinct from Outcome state.

### P13. Prefer Semantic Relationships over Derived States

When a planning situation can be explained by an explicit semantic relationship,
prefer modeling the relationship rather than introducing a new object state.
For example, an Action blocked by another Action is better explained by an
unresolved `depends-on` relationship than by an intrinsic `Blocked` state.

### P14. Prefer Meaningful Ownership

Every work item should be owned by the most specific work context that
meaningfully explains why it exists. Avoid artificial containers or
relationships created solely to satisfy the data model.

Examples:

- Standalone Actions belong to the Workspace.
- Early planning Actions may belong directly to a Project.
- Execution Actions belong to the most specific Outcome they advance.

### P15. Prefer Explicit Semantics, Allow Pragmatic Escape Hatches

Prefer semantic relationships such as `depends-on`. When the required structure
is not yet known, OWF may temporarily use explicit annotations, such as manual
blocking, that can later be refined. Review is the mechanism that keeps these
temporary annotations healthy.

### P16. Combine Reactive Maintenance with Periodic Recovery

Event-driven mechanisms keep the workspace current when relevant signals arrive.
They are not sufficient to detect silent decay, missing signals, or work that
has received no attention. Periodic Review provides the recovery mechanism that
restores trust across a broader scope.

Intentionally parked work may be reviewed on a separate cadence. Deferral must
remain explicit: a parked Outcome records a reason and may optionally specify a
date after which its parking decision should be reviewed.

### P17. Learn from Methodologies without Encoding Them

OWF should draw on proven practices from methodologies such as GTD without
copying their complete terminology, object model, or prescribed workflow.
Methodologies are sources of design evidence and reusable practices, not the
definition of the OWF core.

A practice belongs in the core only when it addresses a general knowledge-work
problem and remains useful independently of the methodology that inspired it.

### P18. Review Signals Express Attention, Not Error

A Review signal identifies a situation that may need conscious attention. It
does not by itself declare the workspace invalid or prescribe a resolution.
Core standardizes the signal mechanism, not a universal catalogue of reasons
why work may deserve attention. Detection rules, signal vocabularies,
thresholds, and methodology-specific policies belong to implementations,
extensions, or non-normative guidance.

### P19. Close Work Semantically, Suspend It Structurally

Terminal transitions must not blindly cascade through owned work. Remaining
work is consciously completed, cancelled or abandoned, moved to a valid owner,
or recaptured in the Inbox for future clarification. Parking instead suspends a
subtree while preserving its internal structure for later resumption.

### P20. Separate Current Truth from Historical Explanation

OWF objects express the current state of the workspace. An append-only Event Log
records semantic changes, decisions, Review activity, and rationale. History
improves auditability and future reasoning but does not replace current objects
as the source of truth.

### P21. Personal Knowledge Work First

OWF is optimized first for an individual organizing personal knowledge work.
The core models work and its meaning, not the identity or authority of the
person, agent, or tool making a change. Collaboration, permissions, assignments,
and team-management concerns belong to implementations or extensions and must
not complicate the lightweight core.

### P22. Express Plans through Views, Not Work States

Planning selects existing work for intentional focus, optionally within a
defined window. That selection belongs to a Curated View and must not introduce
a new intrinsic state such as `Planned`. The same work may participate in
different plans and horizons without changing its identity, ownership, or
lifecycle.

### P23. Snapshot Explicitly When Historical State Matters

Live Views and current objects must not be treated as reliable records of past
state, and the Event Log is not guaranteed to be complete. When a trustworthy
historical projection is required, an immutable View Snapshot explicitly
captures membership and the selected item state at that time.

### P24. Keep View Purpose Open and Window Names Conventional

A View may expose an optional machine-readable purpose without turning purposes
into a closed set of View types. When a Planning View has structured temporal
boundaries, implementations should use `window.start` and `window.end` as the
conventional property names. Omitting them remains valid and supports rolling
or unbounded plans.

### P25. Resolve Captured Input Explicitly

An Inbox Item is temporary unresolved input, not work or durable knowledge.
Processing interprets it, applies the necessary OWF operations or explicitly
discards it, and consumes it only after that result succeeds. Content worth
retaining must move into durable OWF objects. Aging is derived from the original
capture time and exposed through Views rather than modeled as lifecycle state.

### P26. Separate Executability from Attention

Whether an Action can technically be executed is different from whether it
should currently receive attention. Parking an ancestor does not rewrite the
Action or make it intrinsically blocked; ordinary Views and Review scopes may
exclude it while intentional selection remains possible.

### P27. Preserve Honest Dependency Structure

Dependencies may cross Project and abstraction boundaries when that reflects
real work. A cycle may reveal weak or incomplete Refinement and should be made
visible by linting rather than forbidden from representation. OWF prefers an
honest imperfect graph over artificial placeholder Actions.

## Decision Test

When evaluating a proposal, ask:

1. Does it simplify or complicate the conceptual model?
2. Does it preserve human readability?
3. Does it introduce hidden state?
4. Does it belong in the core or should it be an extension?
5. Is it solving a real domain problem or merely an implementation concern?
