# OWF Operational Store Design Notes

> Status: Working, non-normative design notes; authority boundary and
> cross-representation references, minimum logical data model, and operation
> capabilities established

## 1. Purpose

These notes define the boundary between OWF's durable Markdown representation
and its high-frequency Operational Store. They constrain a future representation
profile without selecting a database, application, API style, or programming
language.

The separation exists because Inbox Items and Actions require low-friction
capture, direct state manipulation, compact projections, and equal human and
agent capabilities. Generic Markdown editing did not meet those operational UX
requirements.

## 2. Authority Boundary

| Object or artifact | Authoritative representation |
| --- | --- |
| Workspace | Markdown directory and documents |
| Project | Markdown directory and `README.md` |
| Outcome | Markdown directory and `README.md` |
| Knowledge Document | Markdown document |
| View definition and Curated membership | Markdown document |
| View Snapshot | Markdown document |
| Inbox Item | Operational Store |
| Action | Operational Store |
| Review Signal | derived, temporary observation |
| Markdown Event Log | Workspace-root `log.md` |
| Operational Event Log | Operational Store |

The Operational Store belongs to exactly one logical OWF Workspace and is
locally available with it. Its physical format and placement remain open.
An isolated cloud task system is not the authoritative Operational Store.

Implementations MAY index objects from the other representation for navigation,
search, and query evaluation. Such indexes are derived and rebuildable; they
MUST NOT become competing sources of truth.

## 3. Relationship Placement

A relationship is authoritative in the representation of the object that
declares it. A dependency is declared by the constrained `depends-on` source
object. An Action declares its owner in the Operational Store, while Project and
Outcome ownership is expressed by containment in the Markdown structure.

| Relationship | Authoritative representation |
| --- | --- |
| Outcome is owned by Project | Markdown structure |
| child Outcome is owned by Outcome | Markdown structure |
| Action is owned by Workspace, Project, or Outcome | Operational Store |
| Action depends on Action | Operational Store |
| Action depends on Outcome | Operational Store |
| Outcome depends on Action | Markdown Outcome |
| Outcome depends on Outcome | Markdown Outcome |
| Curated View contains or orders an Action | Markdown View |

A Project or Outcome MAY display its Actions as a derived projection, but its
Markdown files do not contain an authoritative owned-Action list. Blocked
remains derived from unresolved dependencies or a manual block.

## 4. Operational Object Identity

Every Action has a stable Workspace-unique ID assigned by the Operational Store.
Its canonical cross-representation URI is:

```text
owf:action:<id>
```

The URI resolves within the current Workspace. It remains unchanged through
rename, state change, ownership change, dependency change, and Archive. Its
exact ID format remains open.

A Markdown document may refer to an Action with a readable link:

```markdown
[Confirm API contract](owf:action:01K4ABC)
```

The link label is non-authoritative display text. A generic Markdown renderer
may display the link without being able to resolve it.

Inbox Items also have stable Workspace-unique store IDs. They are temporary and
MUST NOT become durable dependency targets.

## 5. Markdown Object Identity

Markdown objects use Workspace-relative path identity by default. A Markdown
object MAY additionally declare an immutable Workspace-unique `owf.id`.

For a Workspace, Project, or Outcome, `owf.id` is declared in the
canonical `README.md` and identifies the containing directory object, not the
`README.md` Concept. That Concept retains its path-based document identity. A
Knowledge Document, View, or View Snapshot declares its own `owf.id` in its
own frontmatter.

Supporting stable Markdown IDs is an optional tool capability. Baseline tools
continue to support path identity. A supporting tool MAY scan metadata and
maintain a rebuildable ID-to-path index; that index is not authoritative.

## 6. MarkdownObjectReference

All references from the Operational Store to Markdown use one conceptual value:

```text
MarkdownObjectReference
  url: required Workspace-rooted URL
  id: optional stable Markdown object ID
```

Example:

```yaml
owner:
  url: /_projects/open-work-format/operational-store/
  id: 01K4OUTCOME
```

The `url`:

- starts with `/`, whose root is the OWF Workspace;
- uses forward slashes on every operating system;
- MUST NOT contain a `..` segment;
- ends in `/` for Workspace, Project, and Outcome directory objects; and
- includes the physical `.md` suffix for document targets.

The optional `id` is stored only when the Markdown target declares a stable ID
and the tool supports it. The reference contains no duplicated object type; the
relationship constrains the permitted target.

Resolution rules:

1. With URL only, resolve by path.
2. With URL and ID, both MUST identify the same object.
3. If the URL is stale, a supporting tool MAY find the target by ID and repair
   the URL.
4. If a valid URL and ID identify different objects, the reference is
   inconsistent and MUST NOT be resolved silently.
5. After resolution, validate that the target type is permitted by the
   relationship.

The same value is used for Action ownership, Action-to-Outcome dependencies,
Action-to-Knowledge references, and any other Operational-to-Markdown
relationship.

## 7. Reference Matrix

| Direction | Representation |
| --- | --- |
| Operational to Markdown | `MarkdownObjectReference { url, id? }` |
| Operational to Action | `owf:action:<id>` |
| Markdown to Action | `owf:action:<id>` |
| Markdown to Markdown | standard Workspace-rooted Markdown path or link |

## 8. Event Logs

OWF uses two independent logs aligned with the authority boundary.

The Markdown Event Log is the Workspace-root `log.md`. It records semantic
changes to Markdown-authoritative objects, Workspace decisions, and durable
workflow history such as Review summaries.

The Operational Event Log belongs to the Operational Store. It records semantic
changes to Inbox Items, Actions, and their outgoing relationships. Current
operational objects, not this history, remain authoritative.

Cross-representation events MAY reference objects in the other representation
using normal OWF references. OWF does not require:

- correlation identifiers;
- global ordering across logs;
- cross-log transactions;
- a unified materialized history; or
- event-sourced reconstruction of current state.

Logs record completed changes. They do not coordinate operations, provide
transaction recovery, or replace current objects. A tool MAY present a combined
timeline as a non-authoritative convenience.

A completed Review has its durable summary in the Markdown Event Log. Semantic
changes that it performs on operational objects MAY independently appear in the
Operational Event Log.

## 9. Minimum Logical Data Model

These are agreed logical fields, not a choice of database, wire format, or
physical serialization. YAML examples below are illustrative only.

### 9.1 InboxItem

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable Workspace-unique ID generated by the tool. |
| `captured_at` | yes | Original capture time supplied by the tool. |
| `text` | conditional | Captured thought or short description. |
| `url` | no | Captured web URL. |
| `screenshots` | no | References to screenshots preserved with the Workspace. |

At least one of `text`, `url`, or `screenshots` MUST contain input.
Text-only, URL-only, and screenshot-only capture are supported. The most common
capture requires only a sentence; the tool supplies identity and capture time.

InboxItem has no separate title, owner, capture-context relationship, work state,
`processed_at`, or `archived_from`. A display title may be derived from input.
Locations of emails or documents may be described in text without introducing
structured external-document integrations.

Editing content MUST preserve `id` and `captured_at`; an edit does not reset
the item's age. After successful processing the item is consumed, not archived.
It MUST remain available if intended processing operations fail. Valuable input,
including screenshots, MUST be preserved in suitable resulting objects when it
needs to outlive processing; the Event Log is not durable content storage.
Screenshot representation remains open, but transfer and backup of the Workspace
must preserve the screenshots.

### 9.2 Action

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable Workspace-unique ID generated by the tool. |
| `title` | yes | Non-empty name of a directly executable step. |
| `state` | yes | Execution state; defaults to `open`. |
| `owner` | yes | MarkdownObjectReference to this Workspace, a Project, or an Outcome. |
| `description` | no | Additional context as Markdown text. |
| `waiting_for` | no | Human-readable explanation of waiting. |
| `manual_block` | no | Non-empty human-readable blocking reason. |
| `depends_on` | no | Set of references to prerequisite Actions or Outcomes. |
| `archived_from` | conditional | Preserved terminal disposition when archived. |
| `created_at` | yes | Tool-managed creation time. |
| `updated_at` | yes | Tool-managed time of the latest persisted data change. |

The user need only supply a title. The tool supplies identity, timestamps,
initial `open` state, and an owner according to Section 11.3.
`updated_at` is not evidence of actual progress: even a title or description
edit changes stored data. Review must not equate data changes with work progress.

Allowed states are `open`, `in_progress`, `waiting`, `completed`,
`cancelled`, and `archived`.

- `waiting_for` is optional and allowed only in `waiting`.
- `manual_block` is allowed only in `open`, `in_progress`, or `waiting`.
- `archived_from` is required only in `archived`, is forbidden otherwise,
  and must be `completed` or `cancelled`.
- Blocked remains derived; it is not a stored state.
- Rename, ownership change, state change, dependency change, and Archive
  preserve Action identity.
- Successful terminal transitions must satisfy Core dependency rules.

## 10. Dependencies as Reference Values

`Action.depends_on` contains references, not independently identified
ActionDependency entities. Dependencies have no separate ID, state, or lifecycle.

| Target | Reference |
| --- | --- |
| Action | `owf:action:<id>` |
| Outcome | `MarkdownObjectReference { url, id? }` |

Illustrative representation:

```yaml
depends_on:
  - owf:action:a456
  - url: /_projects/api/contract-approved/
    id: outcome-contract-approved
```

No additional type field is needed: the URI identifies an Action reference;
a Markdown reference must resolve to an Outcome for this relationship.

- The list has set semantics: order is not priority, and duplicate targets
  are forbidden.
- An absent or empty set means no dependencies.
- Targets must exist in the same Workspace; cross-Project dependencies are
  permitted.
- An unresolvable reference is an error, not a satisfied dependency.
- Cycles remain lint findings, normally warnings, rather than structural errors.

A dependency is satisfied by a Completed Action or an Achieved Outcome.
Archived targets are evaluated using their preserved successful or unsuccessful
terminal disposition. Cancelled Actions and Abandoned Outcomes do not
automatically satisfy dependencies; obsolete prerequisites must be consciously
removed or changed.

`resolved`, `blocked`, and reverse `dependents` lists are derived, not
authoritative stored properties. Implementations may maintain rebuildable
indexes for queries. The same semantics apply to Outcome-source dependencies,
whose authoritative declaration remains in Markdown metadata.

## 11. Minimum Operation Contract

These are capabilities, not prescribed API endpoints, CLI commands, or separate
calls. Humans and agents must have equivalent capabilities and shared semantics
and validation, while their interfaces and interaction counts may differ.

### 11.1 Inbox operations

| Operation | Meaning |
| --- | --- |
| Capture | Create from text, URL, or screenshot; supply ID and capture time. |
| Read / List | Retrieve an item or the current Inbox. |
| Update | Edit input without changing ID or original capture time. |
| Resolve | Consume an item after successful processing. |
| Discard | Consciously consume an item without producing a resulting object. |

Resolve is not restricted to Inbox-to-Action conversion. Processing may produce
one or more Actions, update Knowledge, or perform other applicable operations.
Consumption follows success of all intended processing operations. Failure must
not silently lose the input. This does not prescribe cross-store transactions
or a particular retry/recovery mechanism.

### 11.2 Action operations

| Operation | Meaning |
| --- | --- |
| Create | Create from a title, with optional explicit owner; default to Open. |
| Read / List / Filter | Find Actions, including by owner and state. |
| Update content | Change title or description. |
| Change state | Apply a transition under Core rules. |
| Change owner | Set a valid Workspace, Project, or Outcome owner without changing ID. |
| Set / Clear waiting reason | Manage waiting_for consistently with state. |
| Set / Clear manual block | Manage the human-readable blocking reason. |
| Add / Remove dependency | Change the set of prerequisites. |
| Archive | Archive a terminal Action and preserve its preceding disposition. |

These capabilities may be combined in one operation. Entering Waiting and
supplying its reason, or completing an Action while clearing an obsolete waiting
reason or manual block, must not require persisting an invalid intermediate
object.

### 11.3 Owner selection during Create

Create accepts an explicit `owner` using MarkdownObjectReference. It may
identify any valid owner in the same Workspace, regardless of the user's current
working context.

Owner selection follows this precedence:

1. An explicitly supplied owner always wins.
2. If omitted, contextual creation may prefill the current Project or Outcome.
3. Otherwise, the owner is the Workspace (`url: /`).

In a human interface, a prefilled owner must be visible and quickly changeable.
An agent may supply the owner directly in the creation operation. Current
context is a default, never a restriction: work in Project A may directly
create an Action in Project B.

### 11.4 Single-object change consistency

A change to one operational object MUST either persist completely as a valid
object or not persist at all. A rejected change leaves the original object
unchanged, and the interface explains the reason.

This guarantee does not require transactions spanning Markdown and the
Operational Store, or coordination through Event Logs. Logs explain completed
changes; they do not coordinate them.

## 12. Deferred Work

The following remain open:

- physical store format, placement, and Workspace discovery;
- Action and Inbox Item ID format;
- physical serialization, schema versioning, and migrations;
- screenshot storage and reference representation;
- backup, restore, export, and migration;
- concrete command/API contracts, query syntax, and detailed filter capabilities;
- human GUI and agent CLI/API design;
- concurrent access by a human interface and agents;
- cross-representation processing recovery and retry behavior;
- Operational Event Log schema and retention;
- exact Markdown Event Log grammar; and
- detailed conformance and validation diagnostics.
