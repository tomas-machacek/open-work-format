# OWF Representation Profile Design Notes

> Status: Working, non-normative design notes; durable Markdown baseline and Operational Store authority boundary established

## 1. Purpose

These notes capture the representation decisions made after closing the OWF Core
v0 conceptual model. They are an input to a future normative representation
profile and do not yet define serialization conformance.

The representation should remain:

- readable through open, documented representations and interfaces;
- usable by humans without requiring an AI agent;
- equally operable by humans and AI agents through suitable interfaces;
- independent of any one application;
- part of one logical Workspace with explicit storage locations; and
- structurally simple even where the Core semantics are richer.

Generic file and Markdown editability remains desirable for durable context, but
is no longer required for every frequent Inbox and Action operation.

The profile targets bundle-level conformance with
[Open Knowledge Format (OKF) v0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md).
OWF specializes OKF for personal work without requiring every OWF object to be a
separate OKF Concept.

### 1.1 Markdown and operational work

Markdown remains the primary medium for durable Project, Outcome, Knowledge,
View, and navigation content. YAML frontmatter carries document-level metadata;
Markdown bodies carry prose, headings, ordering, grouping, and links.

Actions and Inbox Items have different usability characteristics. They are
short-lived, change frequently, and are handled mainly through capture, state
changes, filtering, completion, and contextual navigation. A generic Markdown
editor does not provide sufficiently low-friction interaction for those
operations.

The profile therefore no longer assumes that Actions and Inbox Items are
authoritative nested records in Markdown collections. A conforming operational
representation may use another open store, provided that it:

- belongs to the same logical Workspace, with local storage recommended;
- provides strong bidirectional navigation between Actions and their owners;
- exposes equivalent operations to humans and agents through suitable
  interfaces;
- provides stable identity and interoperable access; and
- does not make routine operation depend on an AI agent.

The _actions.md and _inbox.md designs later in this document are retained as
fully described historical experiments. They are superseded by the accepted
Operational Store authority boundary and are not part of the external-structure
baseline. The detailed store contract remains under design in
docs/design/operational-store-notes.md.

### 1.2 Operational UX baseline

The representation is evaluated against the Operational UX Principles in
docs/design/principles.md. In particular:

- unresolved input is capturable from text alone, with an optional URL or
  screenshot in the first operational profile;
- known work may be created directly as an Action without passing through the
  Inbox;
- a simple Action may be created from its title and defaults to Open;
- Action creation in a Project or Outcome context may reuse that owner, while
  global creation must make owner selection fast;
- Inbox Items have no owner or capture-context relationship; and
- accepted capture must provide immediate, durable feedback;
- a simple Action is title-first and receives stable identity and an initial
  Open state from the implementation;
- frequent Action transitions are available directly from compact
  presentations and update all Views immediately;
- Waiting, dependencies, manual blocking, and other structure are introduced
  progressively without burdening simple Actions; and
- renaming, state change, ownership change, dependency change, and Archive
  preserve Action identity and references.

Critical interaction scenarios remain non-normative design and conformance
evidence rather than part of the compact Core specification.

## 2. General Model

The durable contextual part of an OWF Workspace is represented by an
OKF-compatible directory tree of Markdown documents. The Workspace directory is
the bundle root. The authoritative operational representation for Actions and
Inbox Items remains profile-defined but MUST belong to this same logical
Workspace.

For example:

```text
my-workspace/
├── README.md
├── index.md
├── log.md
├── _notes.md
├── _knowledge/
│   ├── index.md
│   ├── general-note.md
│   └── technologies/
│       ├── index.md
│       └── oauth.md
├── _projects/
│   ├── index.md
│   └── open-work-format/
│       ├── README.md
│       ├── index.md
│       ├── _notes.md
│       ├── design-background.md
│       ├── representation-profile/
│       │   ├── README.md
│       │   ├── index.md
│       │   └── okf-notes.md
│       └── _archive/
│           ├── index.md
│           └── obsolete-outcome/
│               ├── README.md
│               └── index.md
└── _views/
    ├── index.md
    ├── next-actions.md
    ├── planning/
    │   ├── index.md
    │   └── sprints/
    │       ├── index.md
    │       └── sprint-42.md
    └── review/
        ├── index.md
        └── weekly-review.md
```

Optional files and directories are omitted when empty unless a later normative
rule says otherwise. The Operational Store belongs to this Workspace but its
physical format remains open and its configured local or external location is
not shown in the directory example.

## 3. Reserved Names

Names beginning with `_` are reserved for files and directories defined by the
representation profile. User-defined object names MUST NOT begin with `_`.

Current OWF-reserved names are:

- `_projects/`
- `_notes.md`
- `_knowledge/`
- `_views/`
- `_archive/`

The leading underscore keeps structural entries visible, sorts them before most
user content in file explorers, and avoids hidden dot-files.

OWF also assigns profile semantics to `README.md`. OKF reserves `index.md`
and `log.md`; OWF retains their OKF names and structures.

## 4. Object and Document Mapping

Projects and Outcomes are OWF directory objects. Their Markdown documents are
OKF Concepts that represent or describe those objects but are not identical to
them.

| Representation | OWF meaning | OKF meaning |
| --- | --- | --- |
| Workspace root | Workspace | Knowledge Bundle root |
| User-named directory directly under `_projects/` | Project | grouping directory |
| User-named directory directly under a Project or Outcome | child Outcome | grouping directory |
| Workspace, Project, or Outcome `README.md` | canonical overview and metadata representation | Concept document |
| `index.md` | navigation for its directory | reserved OKF index |
| Root `log.md` | Markdown Event Log | reserved OKF update log |
| Profile-defined Operational Store | Inbox Items, Actions, their outgoing relationships, and Operational Event Log | outside the OKF document model |
| Owner-local `_notes.md` | conventional aggregated Knowledge Document | Concept document |
| Ordinary `.md` directly under a Project or Outcome | owned Knowledge Document | Concept document |
| Ordinary `.md` below root `_knowledge/` | Workspace Knowledge Document | Concept document |
| Ordinary `.md` below `_views/` | View | Concept document |

Location is authoritative for the OWF role. A document's required `type`
frontmatter provides OKF conformance and redundant validation; it MUST agree
with the role implied by location.

## 5. Common Document Envelope

Every non-reserved Markdown document is an OKF Concept and begins with a
parseable YAML frontmatter mapping. The reserved OKF `index.md` and `log.md`
files follow their own profiles and are excluded from this common envelope.

The minimum envelope is:

```yaml
---
type: <required canonical document type>
title: <required human-readable title>
description: <recommended one-sentence summary>
owf:
  <type-specific OWF metadata>
---
```

### 5.1 Common fields

- `type` is required by both OKF conformance and this profile.
- `title` is required by this profile. It is particularly important for
  generic filenames such as `README.md` and `_notes.md`.
- `description` is recommended as a concise summary suitable for generated
  indexes, search results, and previews. It does not replace fuller body
  content.
- `owf` contains document-level fields defined by OWF and is omitted when
  empty.

A document MAY contain additional fields defined by the targeted OKF version.
OWF neither requires nor prohibits those fields unless a document-type profile
explicitly says otherwise. Their semantics remain those defined by OKF.

OWF-aware tools MUST preserve supported OKF fields and SHOULD preserve unknown
frontmatter fields when round-tripping. Optional OKF metadata MUST NOT introduce
corresponding semantics into OWF Core.

All document-level metadata defined by OWF belongs under the `owf` namespace.
Concrete YAML keys use `snake_case`. An implementation MUST NOT duplicate
path-derived ownership using `owner` or equivalent frontmatter fields. A
stable optional Markdown object ID, when used, is expressed as `owf.id` under
the rules in Section 8.2.

### 5.2 Canonical type values

The profile defines these canonical values:

| Document role | `type` |
| --- | --- |
| Workspace `README.md` | `OWF Workspace` |
| Project `README.md` | `OWF Project` |
| Outcome `README.md` | `OWF Outcome` |
| Knowledge Document, including `_notes.md` | `OWF Knowledge Document` |
| View | `OWF View` |
| View Snapshot | `OWF View Snapshot` |

Canonical type values use the `OWF` prefix and Title Case. They do not encode
the representation version, lifecycle state, archive status, View mode, or View
purpose. For example, an archived Outcome remains `type: OWF Outcome`.

Extensions MAY introduce additional type values. OWF-aware tools MUST tolerate
unknown values as permitted OKF Concepts, while applying OWF semantics only to
types they understand.

### 5.3 Body and YAML conventions

A Concept body:

- is UTF-8 Markdown;
- contains exactly one H1 heading;
- uses an H1 that semantically corresponds to `title`, without requiring exact
  string equality; and
- has no universal required body sections beyond those defined by its
  document-type profile.

Frontmatter is the first content in the file. Duplicate YAML keys and custom
YAML tags are invalid. Optional empty properties are omitted rather than
written as `null`. Anchors and aliases SHOULD NOT be used.

Dates and date-times use quoted ISO 8601-compatible strings so that YAML
libraries do not silently assign inconsistent native types.

Field ordering has no semantic meaning. For readable diffs, documents SHOULD
place `type`, `title`, and `description` first, followed by other OKF
fields and finally `owf`.

## 6. Workspace, Project, and Outcome README Files

The Workspace, every Project, and every Outcome are directory-based OWF
objects. Each contains exactly one canonical `README.md` that acts as its
human-facing landing page and stores the machine-readable metadata required by
OWF.

A `README.md` does not duplicate navigation from `index.md`, authoritative
Action data from the Operational Store, Event Log content, derived statistics,
identity, or ownership.
It MAY link to the directory index but is not required to do so.

### 6.1 Workspace README

The root `README.md` represents the Workspace and declares the targeted OWF
Representation Profile version:

```markdown
---
type: OWF Workspace
title: My Workspace
description: Personal workspace for software architecture and related work.
owf:
  version: "0.1"
  storage:
    operational:
      url: ./_store/
    screenshots:
      url: ./_screenshots/
---

# My Workspace

This Workspace contains my current work, outcomes, supporting knowledge, and
working Views.
```

`owf.version` identifies the Representation Profile version, not a content or
object version. The profile version determines its supported Core version. The
Workspace MUST NOT declare an `owf.state` because it is not a work item.

The root `index.md` MAY separately declare its targeted `okf_version` as
permitted by OKF.

The root README also declares storage locations under `owf.storage`.
`operational.url` is required; `screenshots.url` is required when screenshot
capture is supported. Relative URLs resolve against the Workspace root.
The illustrated directory names are examples, not reserved names. Local storage
is recommended for portability, but either store may use an external address,
including a cloud location. Portable configuration must not contain
authentication secrets.

An unavailable declared Operational Store must be reported, never interpreted
as empty or silently replaced. Moving external-store configuration preserves
its targets; copying it does not create an independent store or a complete
backup. See [storage configuration and discovery](operational-store-notes.md#12-storage-configuration-and-discovery)
for the shared rules.

### 6.2 Project README

A Project `README.md` requires `owf.state`:

```yaml
owf:
  state: active
```

Canonical Project states are:

```text
active
parked
completed
abandoned
archived
```

When `state` is `parked`, `parking_reason` is required and
`review_after` is optional:

```yaml
owf:
  state: parked
  parking_reason: Waiting for the next budgeting cycle.
  review_after: "2026-10-01"
```

When `state` is `archived`, `archived_from` is required and is either
`completed` or `abandoned`:

```yaml
owf:
  state: archived
  archived_from: completed
```

`parking_reason`, `review_after`, and `archived_from` remain flat members
of `owf`. State-specific fields MUST NOT appear when their corresponding state
does not apply.

A Project body MAY contain any useful explanatory sections. The following
sections are recommended:

- `## Status`: a short human-readable description of current reality,
  progress, relevant changes, and significant concerns;
- `## Next Steps`: a short, non-authoritative summary of likely near-term
  directions that may require future Refinement.

Review covering a Project SHOULD verify that its Status and Next Steps remain
current. It need not rewrite text that remains accurate.

### 6.3 Outcome README

An Outcome `README.md` also requires `owf.state`. Canonical Outcome states
are:

```text
active
parked
achieved
abandoned
archived
```

Parking uses the same flat `parking_reason` and optional `review_after`
fields as a Project. An archived Outcome requires `archived_from` with either
`achieved` or `abandoned`.

Every Outcome body MUST contain an explicit `## Expected Result` section. It
states the desired result against which Achievement is evaluated.

`## Status` and `## Next Steps` are recommended with the same meaning as for
a Project. Their recommended order is:

```text
# Title
introductory context, optional

## Expected Result
required

## Status
recommended

## Next Steps
recommended

other user-defined sections
```

The Expected Result describes the target reality and should normally remain
stable. Status describes current reality and the remaining gap. Next Steps
summarize likely near-term directions.

### 6.4 Status and Next Steps boundaries

The Markdown `## Status` section is distinct from both OKF `status` and OWF
`owf.state`:

| Representation | Meaning |
| --- | --- |
| OKF `status` | maturity of the Concept document |
| `owf.state` | intrinsic lifecycle state of the OWF object |
| `## Status` | human-readable summary of current reality |

A Next Steps entry is not an Action or Outcome. It has no OWF identity, state,
ownership, or dependencies and is not a Planning View commitment. It may later
be refined into one or more Actions or Outcomes, or removed as unnecessary.

When a Next Steps entry becomes a concrete executable commitment, it SHOULD be
represented as an Action and removed or rewritten in the summary. Next Steps
use ordinary bullets rather than task-list checkboxes and SHOULD remain short,
current, deliberately non-exhaustive, and oriented toward the near future.

## 7. OKF Index Files

OWF retains the OKF `index.md` convention without renaming it. An `index.md`
is a navigation artifact rather than an OWF object or OKF Concept.

An `index.md`:

- follows the applicable OKF structure;
- contains no frontmatter except the OKF-permitted `okf_version` declaration
  in the bundle-root index;
- lists user-defined entries at the next physical level;
- may group entries by role;
- uses Markdown links; and
- does not establish object existence or ownership.

Filesystem structure and object data remain authoritative. A missing or stale
entry in an index is a lint finding rather than evidence that an unlisted object
does not exist. Indexes MAY be maintained by hand or generated.

An index does not need to repeat mandatory profile infrastructure such as
`_archive/` unless surfacing it improves navigation.

## 8. Identity and References

### 8.1 Markdown path identities

Every Markdown object has a baseline identity derived from an absolute
Workspace-relative logical path without a serialization extension. Workspace,
Project, and Outcome identities are directory paths and MUST end in `/`. The
trailing slash distinguishes a directory object from a document with the same
stem.

Examples:

```text
/
/_projects/open-work-format/
/_projects/open-work-format/representation-profile/
```

A Markdown Concept document uses the OKF Concept ID: its absolute
Workspace-relative file path with the `.md` suffix removed.

```text
File: /_projects/open-work-format/design-background.md
ID:   /_projects/open-work-format/design-background
```

The `README.md` Concept and its containing Project or Outcome remain different
objects with a profile-defined representation relationship.

### 8.2 Optional stable Markdown IDs

A Markdown object MAY additionally declare an immutable Workspace-unique
`owf.id`. Path identity remains mandatory and is sufficient for baseline OWF
support. Stable Markdown ID support is an optional tool capability.

For a Workspace, Project, or Outcome, `owf.id` is declared in the
canonical `README.md` and identifies the containing directory object, not the
`README.md` Concept. That Concept retains its path-based document identity. A
Knowledge Document, View, or View Snapshot declares its own `owf.id` in its
own frontmatter.

A supporting implementation MAY build a derived ID-to-path index by scanning
Markdown metadata. Such an index is rebuildable and MUST NOT become another
authoritative representation of Markdown objects.

### 8.3 Operational identities

Every Action has a stable Workspace-unique ID assigned by the Operational Store.
Its canonical cross-representation URI is:

```text
owf:action:<id>
```

The URI is resolved within the current Workspace and remains unchanged through
Action rename, state change, ownership change, dependency change, and Archive.
The exact Action ID format remains open. Inbox Items also have stable
Workspace-unique store IDs but are not durable dependency targets.

### 8.4 Cross-representation references

A Markdown reference to an Action uses a readable Markdown link whose target is
the Action URI:

```markdown
[Confirm API contract](owf:action:01K4ABC)
```

All references from the Operational Store to Markdown use one conceptual value:

```text
MarkdownObjectReference
  url: required Workspace-rooted URL
  id: optional stable Markdown object ID
```

The `url` starts with `/`, uses forward slashes, contains no `..` segment,
and uses a trailing slash for Workspace, Project, and Outcome directory objects.
The relationship using the reference constrains the permitted target type, so
the reference does not duplicate a type field.

If only URL is present, resolution uses the path. If both fields are present,
they MUST identify the same object. A supporting tool MAY use the ID to relocate
an object and repair a stale URL. If a valid URL and ID identify different
objects, the reference is inconsistent and MUST NOT be resolved silently.

Consequently:

| Direction | Representation |
| --- | --- |
| Operational to Markdown | `MarkdownObjectReference { url, id? }` |
| Operational to Action | `owf:action:<id>` |
| Markdown to Action | `owf:action:<id>` |
| Markdown to Markdown | standard Workspace-rooted Markdown path or link |

## 9. Knowledge Documents

Knowledge Documents owned by a Project or Outcome are stored directly in the
owner directory as ordinary Markdown files. They MUST NOT introduce additional
Knowledge grouping directories there: the Project and recursive Outcome
hierarchy already provides the relevant organization.

Workspace-owned Knowledge Documents are stored under the optional reserved
`_knowledge/` directory. They MAY be organized using arbitrarily nested,
user-named grouping directories.

A Knowledge grouping directory:

- is a transparent representation container, not a Core object;
- does not change ownership: all documents in the subtree remain Workspace
  owned;
- contains `index.md`; and
- may contain Knowledge Documents and further grouping directories.

A Knowledge Document may contain original documentation, a local synthesis, or
a durable reference to material in another format or external system. External
documentation does not need to be copied into the Workspace.

### 9.1 Conventional Notes document

A Knowledge owner MAY contain one reserved `_notes.md` for short,
scope-specific working notes that do not warrant separate Knowledge Documents.
It is itself an `OWF Knowledge Document`; individual entries are not Core
objects and do not require stable identities, states, ownership, or
dependencies.

`_notes.md` MAY occur at Workspace, Project, or Outcome scope. It uses the
common envelope:

```yaml
---
type: OWF Knowledge Document
title: Notes
description: Chronological working notes related to this Project.
---
```

Entries SHOULD use H2 headings with an ISO date and short title, newest first:

```markdown
# Notes

## 2026-08-18 — Representation discussion

Agreed that Project and Outcome README files will contain recommended Status
and Next Steps sections.
```

A note is understood scope-specific context. Unresolved captured input belongs
in the Inbox; executable commitments belong in Actions; a coherent or
long-lived topic SHOULD become a named Knowledge Document; current canonical
summary belongs in `README.md`; and semantic history belongs in `log.md`.

Unlike the Event Log, `_notes.md` is not append-only. Entries may be edited,
removed, consolidated, or promoted into more durable artifacts.

## 10. Superseded Experiment: Markdown Action Collections

> This section preserves the previously completed Markdown experiment for
> rationale. Actions are now authoritative in the Operational Store; this is not
> part of the accepted profile baseline.

Actions are normally short, have relatively short lifetimes, and cannot own
other objects. Creating one Markdown file and frontmatter block for every Action
would be disproportionate. At the same time, placing Actions only in YAML would
make them invisible to generic OKF consumers.

Each possible Action owner MAY therefore contain one active `_actions.md`:

- the Workspace file contains standalone Actions;
- a Project file contains Project-owned Actions; and
- an Outcome file contains Outcome-owned Actions.

Absence of `_actions.md` means the owner has no non-archived Actions. An empty
Action Collection SHOULD be removed. The document uses the common envelope:

```yaml
---
type: OWF Action Collection
title: Actions
description: Actions owned by the Representation Profile Outcome.
---
```

The collection itself does not require `owf` frontmatter. Action order in the
document has no Core meaning; intentional priority, execution order, focus, or
planning belongs to Views.

### 10.1 Action sections

Each Action is one H2 section. It ends before the next Action H2 or the end of
the file. An Action body MAY use H3 and deeper headings but MUST NOT contain
another H2.

```markdown
## Prepare OWF internal structure

- id: prepare-internal-structure
- state: in_progress

Prepare a coherent draft of the internal representation.
```

The H2 is the human-readable Action title. It SHOULD describe a directly
executable step, normally beginning with a verb. The title MAY change without
changing the Action identity.

The first top-level unordered list immediately following the H2 is the
machine-readable property block. Every property uses:

```text
- property_name: value
```

The parser separates the key and value at the first colon. Nested unordered
lists represent multi-valued properties. Property keys use `snake_case`.

Every property block MUST begin with exactly one `id` followed immediately by
exactly one `state`. Both properties are required. Other properties are
optional and follow the state-specific rules below.

### 10.2 Identity and references

`id` is an owner-local stable identifier:

```markdown
- id: prepare-internal-structure
```

It MUST match:

```regex
[a-z][a-z0-9-]*
```

An ID MUST be unique across the owner's active and archived Action Collections
together. Changing the title MUST NOT implicitly change the ID. Moving the
Action to another owner or archive changes the collection path and therefore
the complete identity, although the local ID SHOULD be retained when possible.

The complete logical identity is the collection Concept ID plus the Action ID
as a fragment:

```text
/_projects/open-work-format/_actions#prepare-internal-structure
```

References to Actions MUST use standard Markdown links. The physical link adds
the collection's `.md` suffix, and its fragment MUST equal the target
Action's `id`:

```markdown
[Prepare OWF internal structure](
  /_projects/open-work-format/_actions.md#prepare-internal-structure
)
```

A relative link or same-document fragment MAY be used where permitted by OKF.
For OWF resolution, the path identifies the Action Collection and the fragment
selects the nested Action by its `id`. A generic renderer need not understand
this OWF fragment semantics.

A matching HTML anchor is recommended but not required:

```html
<a id="prepare-internal-structure" name="prepare-internal-structure"></a>
```

When present, it occurs immediately before the Action H2 and both attributes
MUST equal the Action `id`. The anchor is only a best-effort navigation aid
for renderers such as GitHub and compatible Markdown previews; it is not the
source of identity. OWF does not use renderer-specific block-reference syntax
such as Obsidian `^block-id`.

### 10.3 State

Every Action has one required `state`:

```markdown
- state: open
```

Canonical serialized values are:

```text
open
in_progress
waiting
completed
cancelled
archived
```

An active `_actions.md` MAY contain `open`, `in_progress`, `waiting`,
`completed`, or `cancelled` Actions. `completed` and `cancelled`
Actions remain there until an explicit Archive operation. `archived` is
permitted only in `_archive/_actions.md`.

### 10.4 Waiting

`waiting_for` is an optional human-readable explanation permitted only when
`state` is `waiting`:

```markdown
- id: request-okf-feedback
- state: waiting
- waiting_for: Feedback about the proposed index and identity conventions.
```

It is optional because the expected external result may already be clear from
the title or Action description. It does not require or imply an actor identity.

A Waiting Action MAY simultaneously have unresolved dependencies or a manual
block.

### 10.5 Dependencies

`depends_on` is an optional nested list of standard Markdown links to Action
or Outcome targets:

```markdown
- depends_on:
  - [Define the document envelope](#define-document-envelope)
  - [Approve the security model](../security/_actions.md#approve-security-model)
  - [Authentication approach agreed](../authentication/)
```

The list MUST NOT be empty. Links may be same-document, relative, or absolute
bundle-relative. OWF validation resolves the link according to the target type:
an Action link selects a nested Action by fragment, while an Outcome link names
its directory identity ending in `/`.

A `completed` Action MUST NOT have an unresolved dependency. A `cancelled`
Action may retain one. Dependency cycles remain representable and are lint
warnings rather than structural errors.

### 10.6 Manual blocking

`manual_block` is an optional, non-empty human-readable reason:

```markdown
- manual_block: The required prerequisite is not understood well enough to model.
```

Its presence creates the explicit manual block defined by Core. The profile does
not serialize `blocked: true`, because Blocked remains a derived observation.

`manual_block` is permitted only for `open`, `in_progress`, or `waiting`
Actions. It MUST be removed before an Action becomes `completed`,
`cancelled`, or `archived`. Historical explanation may remain in prose or
the Event Log.

### 10.7 Archived Actions

An archived Action is stored in:

```text
<owner>/_archive/_actions.md
```

It MUST have `state: archived` and a required `archived_from` value of
`completed` or `cancelled`:

```markdown
<a id="prepare-initial-draft" name="prepare-initial-draft"></a>
## Prepare the initial representation draft

- id: prepare-initial-draft
- state: archived
- archived_from: completed
```

`archived_from` MUST NOT appear for another state. The archived collection
contains only Archived Actions; an active collection contains none.

### 10.8 Optional description and property order

Prose after the property block is the optional Action description. A short
Action may consist only of its H2 and required properties. Longer supporting
material SHOULD remain in a linked Knowledge Document rather than making the
Action disproportionately large.

The canonical property order is:

```text
id
state
waiting_for
depends_on
manual_block
archived_from
extension properties
```

Only the first two positions are normative: `id` MUST be first and `state`
MUST be second. The order of remaining properties carries no meaning.

### 10.9 Validation and linting

A conforming validator reports at least:

- an incorrect collection envelope or `type`;
- an empty persisted active collection;
- an Action without exactly one H2, required `id`, or required `state`;
- `id` or `state` not occupying the first two property positions;
- an invalid or duplicate ID across an owner's active and archived collections;
- duplicate property keys;
- a state-specific property used with an incompatible state;
- a broken or unsupported dependency endpoint;
- an unresolved dependency on a Completed Action;
- an Archived Action outside the archived collection or a non-Archived Action
  inside it; and
- a present HTML anchor that does not match the Action ID.

A linter MAY additionally report:

- a missing recommended HTML anchor;
- duplicate or confusingly similar titles;
- a dependency cycle;
- a disproportionately large Action that may need a Knowledge Document or
  further Refinement; and
- terminal Actions that may be ready for Archive.

Extension-property namespacing remains part of the general extension model and
is not defined by this section.

## 11. Superseded Experiment: Markdown Inbox Collection

> This section preserves the previous Markdown experiment for rationale. Inbox
> Items are now authoritative in the Operational Store; this is not part of the
> accepted profile baseline.

Inbox Items are short-lived unresolved captures and do not own other objects.
They are represented inside one optional Workspace-root `_inbox.md`.

Absence of `_inbox.md` means the Workspace has no current Inbox Items. The
document is an OKF Concept, for example:

```yaml
---
type: OWF Inbox
title: Inbox
---
```

Each Inbox Item has a Workspace-local stable fragment identifier, records the
Core-required `captured-at` value, and contains the original captured input.
The exact internal syntax is deferred alongside Action entry syntax.

Inbox Items are not archived. After successful Resolved or Discarded
processing, the entry is consumed and removed from `_inbox.md`. The Event Log
may record processing but does not retain the item as current Workspace state.

Age and ordering are derived from `captured-at` and may be exposed through
Views.

## 12. Views

Views are represented as individual Markdown Concept documents under the
reserved `_views/` directory. A small Workspace may store them flat; a larger
Workspace MAY organize them in arbitrarily nested, user-named grouping
directories.

Every View grouping directory:

- is a transparent representation container, not a Core object;
- contains `index.md`;
- may contain View documents and further grouping directories; and
- does not determine the View's machine-readable purpose.

Markdown remains the natural representation because:

- a link expresses Curated View membership;
- link order expresses ordering;
- headings express grouping; and
- prose explains intent and context.

The View frontmatter contains properties of the View itself under the
appropriate OKF and `owf` fields. It does not duplicate the current state of
referenced members.

A Computed View also remains a Markdown document but requires a
machine-readable query. Query syntax and placement remain open.

## 13. Event Logs

### 13.1 Markdown Event Log

The Workspace-root `log.md` is the Markdown Event Log and the OKF update log.
It records semantic events for Markdown-authoritative objects, Workspace-level
decisions, and durable workflow history such as Review summaries.

It follows the OKF log structure:

- date headings use `YYYY-MM-DD`;
- entries form a flat Markdown list;
- newest dates and entries appear first; and
- entries remain human-readable prose.

Append-only means that recorded historical events are not edited or removed.
Inserting new entries at the top preserves OKF's newest-first convention and
does not require byte-level appending.

### 13.2 Operational Event Log

The Operational Store contains a separate Operational Event Log for semantic
changes to Inbox Items, Actions, and their outgoing relationships. Its physical
schema and retention rules remain open. It is not an event-sourced authority;
current operational objects remain the source of truth.

A cross-representation event MAY reference the other representation using
`owf:action:<id>` or `MarkdownObjectReference`. Neither log requires a
correlation ID, global sequence, cross-log transaction, or unified materialized
timeline. Logs record completed changes and do not coordinate the operation that
produced them.

A completed Review has its durable summary in the Markdown Event Log. Changes it
performs on operational objects may independently appear in the Operational
Event Log. Exact event-entry grammar remains open for both logs.

## 14. Archive

A Markdown structural owner MAY contain a reserved `_archive/` directory. It
is a representation container, not a Core object or structural owner.

For Markdown Projects and Outcomes, Archive preserves ownership but changes
baseline path identity. A stable optional `owf.id`, when present, remains
unchanged and may help tools update path references. An OWF-aware Archive
operation MUST update affected path links, and a linter SHOULD report broken
references.

| Archive location | Permitted archived Markdown work |
| --- | --- |
| `_projects/_archive/` | Projects |
| Project `_archive/` | child Outcomes |
| Outcome `_archive/` | child Outcomes |

Actions are archived within the Operational Store. Their
`owf:action:<id>` identity and owner reference remain unchanged, and the store
preserves the preceding Completed or Cancelled disposition.

Archiving MUST follow the Core lifecycle and Closure Review rules. It MUST NOT
be achieved merely by moving Markdown files or hiding an operational object.

## 15. OKF Compatibility Profile

The durable Markdown part of an OWF Workspace is an OKF v0.2-conformant
Knowledge Bundle. Every non-reserved Markdown document is an OKF Concept. The
Operational Store accompanies the same OWF Workspace but its Actions, Inbox
Items, relationships, and Operational Event Log are outside the OKF document
model.

Consequently:

- every non-reserved `.md` has parseable YAML frontmatter and non-empty
  `type`;
- `index.md` and the Markdown `log.md` follow their reserved OKF structures;
- unknown OKF fields and producer-defined extension fields remain permitted;
- standard Markdown links are used for physical Markdown navigation;
- `owf:action:<id>` addresses Actions across the representation boundary; and
- OWF-specific frontmatter belongs under the `owf` namespace.

OKF `status` describes document lifecycle, while `owf.state` represents the
intrinsic lifecycle state of the OWF object represented by that document. OKF
actor, provenance, trust, freshness, and attestation fields remain optional and
do not introduce actor identity or collaboration semantics into OWF Core.

## 16. External Structure Baseline

The external structure baseline now defines:

- an OKF-compatible Markdown bundle;
- directory-based Workspace, Project, and Outcome objects;
- `README.md` as their canonical landing page and metadata representation;
- reserved OKF `index.md` for navigation;
- a root Markdown Event Log and a separate Operational Event Log;
- Operational Store authority for Inbox Items, Actions, and their outgoing
  relationships;
- source-owned dependency placement across both representations;
- stable Action URIs and a common `MarkdownObjectReference` for
  Operational-to-Markdown links;
- path identity with optional stable IDs for Markdown objects;
- Markdown placement for scoped and Workspace-level Knowledge;
- hierarchical Markdown Views;
- directory, document, and operational identity rules; and
- local Archive containers that preserve ownership but change baseline path
  identity.

These decisions remain non-normative until incorporated into a representation
specification. Internal design may reveal a genuine structural problem, but
field naming or presentation preference alone should not reopen this baseline.

The minimum logical InboxItem and Action fields, dependency reference values,
and operation capabilities are defined in
[Operational Store Design Notes](operational-store-notes.md#9-minimum-logical-data-model).
These are not a physical serialization or a concrete API contract.

## 17. Current Open Questions

The following representation decisions remain open:

- the physical format, provider-specific connection, versioning, backup, and
  migration model of the Operational Store;
- the exact Action and Inbox Item ID format;
- the detailed storage and interoperability contract;
- concrete human GUI and agent CLI/API design for the agreed minimum capabilities;
- compact Action projections and the command surface for frequent state
  transitions;
- detailed interaction design for the agreed progressive Action enrichment;
- whether the superseded Markdown Action and Inbox collections remain useful as
  interchange formats, snapshots, or optional profiles;
- Operational Event Log schema and retention;
- exact Markdown Event Log and Review-entry grammar;
- representation of `review_after` beyond the agreed README fields;
- exact index completeness lint severity;
- serialization of Computed View queries and Curated View membership;
- representation of View Snapshots;
- extension compatibility rules; and
- the normative lint catalogue.
