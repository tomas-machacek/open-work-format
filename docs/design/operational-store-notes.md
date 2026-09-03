# OWF Operational Store Design Notes

> Status: Working, non-normative design notes; authority boundary and
> cross-representation reference model established

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

A property or outgoing relationship is authoritative with its source object.

| Relationship | Authoritative representation |
| --- | --- |
| Project owns Outcome | Markdown structure |
| Outcome owns child Outcome | Markdown structure |
| Action owned by Workspace, Project, or Outcome | Operational Store |
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

## 9. Deferred Work

The following remain open:

- physical store format and placement;
- Action and Inbox Item ID format;
- data schema and versioning;
- backup, restore, export, and migration;
- operation and query contracts;
- human GUI and agent CLI/API capability surfaces;
- concurrent access by a human interface and agents;
- Operational Event Log schema and retention;
- exact Markdown Event Log grammar; and
- conformance and validation rules.
