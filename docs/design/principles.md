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
This does not require every operation to be convenient in a generic text editor;
high-frequency operational work may rely on purpose-built OWF-aware tooling.

### P2. AI-native

AI should be able to reason about the workspace with minimal hidden state. Human
and agent interfaces may differ, but both must expose the same OWF capabilities
over the same authoritative Workspace.

### P3. Documents for Durable Context

Documents are the natural representation for durable context, explanation, and
knowledge. OWF does not require every object to be a document: high-frequency
operational objects such as Actions and Inbox Items may use another open,
interoperable representation when that materially improves everyday usability.

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

### P9. Tool Independence through Interoperability

OWF must not depend on one specific application. Multiple implementations should
be possible while remaining interoperable. Tool independence does not mean that
all operations must be conveniently available through generic Markdown or file
editors; purpose-built tools may be necessary for effective operational work.

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

OWF objects express the current state of the workspace. Append-only Event Logs
record semantic changes, decisions, Review activity, and rationale. History
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
state, and Event Logs are not guaranteed to be complete. When a trustworthy
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

## Operational UX Principles

These principles apply especially to the high-frequency handling of Inbox Items
and Actions. They define required qualities without prescribing a particular UI,
storage engine, or implementation.

### O1. Capture before classification

An unresolved thought must be capturable from text alone, without first
classifying, organizing, or assigning it. A first operational profile should
also support an optional URL or screenshot without turning the Inbox into a
general document store.

### O2. Direct creation of known work

OWF must not require a known Action to pass through the Inbox. When the user
already recognizes an executable step, it should be creatable directly from its
title. Its initial state may default to Open, and its owner may be selected
explicitly or supplied by the current Project or Outcome context.

### O3. Minimal interruption

Creating an Inbox Item or simple Action should require minimal interaction,
avoid navigation through the Workspace hierarchy, and let the user immediately
resume the preceding activity. Inbox capture is the most frequent and most
friction-sensitive case.

### O4. Strong Action-context navigation

An Action's owner is its meaningful work context, not merely filter metadata.
Implementations should make navigation from an Action to its Workspace, Project,
or Outcome owner, and from that owner to its Actions, direct and obvious.
Creating an Action within an owner context should reuse that context; global
creation should provide fast owner selection.

Inbox Items have no owner or capture-context relationship. If a meaningful work
context is already known, direct Action creation is normally the better path.

### O5. One Workspace, one operational source of truth

Inbox Items and Actions belong to the same logical OWF Workspace as Projects,
Outcomes, and Knowledge. Their technical representation and physical location
may differ, but they must not form an isolated system with unrelated identity,
navigation, access, or lifecycle. Local storage inside the Workspace is
recommended for portability; external and cloud storage are permitted when
identified by configuration in the Workspace. Unavailable operational storage
must never be presented as an empty Inbox or Action collection.

### O6. Equal human and agent capabilities

Humans and agents must be able to perform the same OWF operations over the same
authoritative state. Their interfaces are expected to differ: a human may use a
graphical interface while an agent uses a CLI or structured API.

### O7. Immediate and durable feedback

Capture and common Action operations should respond immediately, confirm
accepted changes, and never silently lose input. Routine use must not depend on
an AI agent being available. Local-first and offline-capable implementations are
preferred for keeping operational work available with the rest of the
Workspace.

### O8. Actions are title-first

A simple Action must be creatable from its title alone. The implementation
supplies stable identity and an initial Open state. The owner may come from the
current Project or Outcome context or from fast explicit selection. Description,
Waiting detail, dependencies, manual blocking, and other enrichment must not be
prerequisites for creation.

### O9. Frequent Action operations are direct

The most frequent Action operations must be available directly from compact
Action presentations. Creation, starting, completion, cancellation, entering
Waiting, and leaving Waiting should not require navigation into a detailed
editor. Changes should be immediately visible across Views and easy to reverse.

Less frequent operations such as changing owner, adding dependencies, manual
blocking, Promotion, or Archive may remain behind progressive disclosure.

### O10. Actions use progressive enrichment

Additional Action structure should be introduced only when the work requires
it. A simple Action remains simple; description, Waiting detail, dependencies,
manual blocking, and extensions are added as needed.

Once present, Waiting, Blocked, and their causes must remain visible,
understandable, and navigable. Advanced capabilities must not burden creation
and execution of simple Actions.

### O11. Action identity survives operational change

Ordinary Action changes must preserve stable identity and references. Renaming,
state changes, ownership changes, dependency changes, and archiving must not
create a replacement Action or break Views, links, and relationships.

A semantic transformation such as Promotion to Outcome may create a different
object identity, but the operation must define the resulting identity and the
handling of existing references and relationships explicitly.

## Decision Test

When evaluating a proposal, ask:

1. Does it simplify or complicate the conceptual model?
2. Does it preserve human readability?
3. Does it introduce hidden state?
4. Does it belong in the core or should it be an extension?
5. Is it solving a real domain problem or merely an implementation concern?
6. Does it keep frequent Inbox and Action operations fast enough for everyday
   use?
