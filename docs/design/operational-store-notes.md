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

The Operational Store belongs to exactly one logical OWF Workspace. Physical
co-location is recommended, not required. The Operational Store and screenshot
storage may independently be local or external, including cloud-hosted.
Workspace-root configuration identifies their locations; external storage must
still satisfy OWF identity, navigation, operation, and lifecycle requirements.
See Section 12 for discovery, portability, and availability rules.

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
Screenshot references follow Section 14. A complete Workspace backup must preserve
the screenshot data, not just references. Moving a Workspace with external
storage preserves its pointers but does not relocate the external data.

### 9.2 Action

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable Workspace-unique ID generated by the tool. |
| `title` | yes | Non-empty name of a directly executable step. |
| `state` | yes | Execution state; defaults to `open`. |
| `owner` | yes | MarkdownObjectReference to this Workspace, a Project, or an Outcome. |
| `description` | no | Additional context as Markdown text. |
| `screenshots` | no | References relative to the configured screenshot store, as for InboxItem. |
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
The human or agent performs the intended operations individually, and each
operation reports success or failure. Successful earlier operations remain saved
if a later one fails; the tool does not automatically roll them back. The caller
invokes Resolve only after the intended processing is complete. The Inbox Item
remains available until then. The MVP requires neither a multi-object conversion
operation nor automatic cross-store coordination, rollback, or recovery.

### 11.2 Action operations

| Operation | Meaning |
| --- | --- |
| Create | Create from a title, with optional explicit owner; default to Open. |
| Read / List / Filter | Find Actions, including by owner and state. |
| Update content | Change title, description, or screenshot references. |
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

### 11.5 Concurrency scope for the MVP

Concurrent editing, object revision tokens, conflict detection, and automatic
merging are deferred beyond the first tool version. Single-object atomicity
remains required, but does not by itself protect against lost updates from
concurrent writers. No parallel-editing safety guarantee is implied.

## 12. Storage Configuration and Discovery

Logical membership in a Workspace does not require physical containment in its
directory. Storing the Operational Store and managed screenshots inside the
Workspace root is RECOMMENDED because a directory move carries them together.
Either storage location MAY instead be external, including in the cloud.

### 12.1 Declaration in the root README

The Workspace declares storage locations in its existing root `README.md`,
under the `owf.storage` frontmatter mapping. No separate configuration file
is required.

```yaml
owf:
  version: "0.1"
  storage:
    operational:
      url: ./_store/
    screenshots:
      url: ./_screenshots/
```

These are illustrative directory names, not newly reserved or mandatory names.
The URL declarations locate storage; they do not select a database format,
communication protocol, or provider-specific connection contract.

- `owf.storage.operational.url` is required.
- `owf.storage.screenshots.url` is required when screenshot capture is supported.
- Relative storage URLs resolve against the Workspace root.
- External storage uses stable addresses in the same URL fields.
- Storage declaration URLs locate stores; they are not MarkdownObjectReference
  values. References from Actions to Markdown owners remain Workspace-rooted.
- Authentication secrets MUST NOT be embedded in portable Workspace
  configuration. Tools manage authentication; the mechanism remains open.

### 12.2 Move, copy, and backup

Moving a Workspace directory with internally stored data carries its Markdown,
configuration, Operational Store, and screenshots together. For external storage,
moving the directory carries only the configuration and local content; the
configuration continues to point to the same external locations.

Copying the directory is not automatically an independent Workspace clone:
a copied configuration may still point to the same Operational Store and
screenshots. Creating an independent clone requires separate handling of that
data and its configuration; the detailed procedure remains open.

A directory copy alone is not a complete backup when data is external. A complete
Workspace backup must also include an export or separately recoverable backup
of the external operational data and screenshots, as well as images copied next
to Markdown documents. For the MVP, a documented backup and restore procedure
with writes paused is sufficient. Online backup and a dedicated independent-clone
feature are not required. The storage-specific procedure remains to be defined.

### 12.3 Unavailable storage

A tool MUST distinguish an unavailable declared Operational Store from an empty
Inbox or Action collection. It MUST report unavailability and MUST NOT silently
initialize a replacement store. An inability to access work is not evidence
that no work exists.

Local-first and offline-capable operation remain recommended, not a prerequisite
for compatibility. External storage changes availability and backup obligations,
not the logical authority boundary.

## 13. Minimum Query Capabilities

The MVP requires these capabilities, not a general query language:

| Capability | Purpose |
| --- | --- |
| Read Action or InboxItem by ID | Details, references, and edits. |
| List current Inbox | Processing and age inspection. |
| List Actions | Retrieve the current operational work set. |
| Filter Actions by state | Working lists and simple Kanban projections. |
| Filter Actions by direct owner | Project/Outcome-to-Action navigation. |
| Combine direct owner and state filters | For example, Open Actions of an Outcome. |

A state filter may contain multiple states. State alternatives use OR; different
filters use AND. Owner filtering means direct ownership, not recursive subtree
membership. Archived Actions are excluded by default and must be explicitly
requested when needed.

The Inbox can be presented oldest first using captured_at. Action result order
does not express priority; intentional ordering remains the responsibility of
Views.

Blocked, executable, reverse dependencies, and complete Project subtrees are not
required store-side queries for the MVP. An OWF-aware tool or agent may derive
them from loaded Actions and Markdown objects. In particular, the Operational
Store need not independently maintain Outcome state or the Markdown ownership
hierarchy. These minimum filters do not define the Computed View query language.

## 14. Screenshots and Markdown Images

### 14.1 Managed screenshot capture

Capture copies screenshots into the configured screenshot storage. A temporary
file or clipboard reference is not sufficient. Capture with a screenshot MUST
be confirmed successful only after both the screenshot data and the Inbox Item
have been saved. A failure must be reported without claiming successful capture;
this does not require a distributed transaction mechanism.

InboxItem and Action use the same optional screenshots field containing
references relative to the configured screenshot storage root, for example:

```yaml
screenshots:
  - capture-123.png
```

Changing the location of the entire screenshot store requires updating its
configuration, not each relative reference, provided its internal paths are
preserved. Processing an Inbox Item into an Action can reuse the references
without copying or moving screenshot files.

Consuming an Inbox Item MUST NOT automatically delete its screenshots: an Action
or document may still use them. Automatic cleanup of unused screenshots is not
required for the MVP.

### 14.2 Images incorporated into Markdown

When a captured screenshot is incorporated into a Markdown document, it is
copied into the same directory as that document. No special image subdirectory
or new URI scheme is introduced. The document embeds its local copy using a
standard relative Markdown image reference:

```markdown
![Screen proposal](screen-proposal.png)
```

The original screenshot remains in the configured screenshot store, preserving
existing Inbox and Action references. If the destination filename already exists,
the tool MUST choose an available filename and MUST NOT overwrite the existing
file.

The copied image is supporting document content, not a separate OWF work object.
It remains usable in generic Markdown tools without knowledge of OWF storage
configuration. Moving a document must preserve working relative image references;
the tool must not assume that no other document uses the image.

## 15. Deferred Work

The following remain open:

- physical store format and provider-specific connection details;
- Action and Inbox Item ID format;
- physical serialization, schema versioning, and migrations;
- supported screenshot encodings and storage-specific transfer details;
- backup, restore, export, and migration;
- concrete command/API syntax and query capabilities beyond the MVP minimum;
- human GUI and agent CLI/API design;
- concurrent editing and conflict handling (not required for the MVP);
- automated multi-object processing and cross-representation recovery (not required for the MVP);
- Operational Event Log schema and retention;
- exact Markdown Event Log grammar; and
- detailed conformance and validation diagnostics.
