# OWF Representation Profile Design Notes

> Status: Working design notes; external structure baseline revised for OKF v0.2 compatibility; non-normative

## 1. Purpose

These notes capture the representation decisions made after closing the OWF Core
v0 conceptual model. They are an input to a future normative representation
profile and do not yet define serialization conformance.

The representation should remain:

- readable and editable without specialized tooling;
- usable through a normal file explorer, GitHub, or Markdown application;
- friendly to Git and AI agents;
- free of hidden database state; and
- structurally simple even where the Core semantics are richer.

The profile targets bundle-level conformance with
[Open Knowledge Format (OKF) v0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md).
OWF specializes OKF for personal work without requiring every OWF object to be a
separate OKF Concept.

### 1.1 Markdown as the primary medium

Long-lived descriptive objects, compact work collections, captured input,
Views, and navigation use Markdown. YAML frontmatter carries document-level
metadata. Markdown bodies carry prose, headings, ordering, grouping, links, and
the compact records contained in Action and Inbox collections.

An earlier design used aggregated YAML files for Actions and Inbox Items. That
would have made these important parts of an OWF Workspace invisible to generic
OKF consumers. The working design therefore uses Markdown collections instead.
The exact internal syntax of Action and Inbox entries remains open.

## 2. General Model

An OWF Workspace is represented by an OKF-compatible directory tree of Markdown
documents. The Workspace directory is the bundle root.

For example:

```text
my-workspace/
├── README.md
├── index.md
├── log.md
├── _actions.md
├── _inbox.md
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
│       ├── _actions.md
│       ├── design-background.md
│       ├── representation-profile/
│       │   ├── README.md
│       │   ├── index.md
│       │   ├── _actions.md
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
rule says otherwise.

## 3. Reserved Names

Names beginning with `_` are reserved for files and directories defined by the
representation profile. User-defined object names MUST NOT begin with `_`.

Current OWF-reserved names are:

- `_projects/`
- `_inbox.md`
- `_knowledge/`
- `_views/`
- `_actions.md`
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
| Root `log.md` | OWF Event Log | reserved OKF update log |
| Owner-local `_actions.md` | collection containing owned Actions | Concept document |
| Workspace-root `_inbox.md` | collection containing Inbox Items | Concept document |
| Ordinary `.md` directly under a Project or Outcome | owned Knowledge Document | Concept document |
| Ordinary `.md` below root `_knowledge/` | Workspace Knowledge Document | Concept document |
| Ordinary `.md` below `_views/` | View | Concept document |

Location is authoritative for the OWF role. A document's required `type`
frontmatter provides OKF conformance and redundant validation; it MUST agree
with the role implied by location.

## 5. Workspace, Projects, Outcomes, and README

The Workspace, every Project, and every Outcome are directory-based OWF
objects. Each contains a canonical `README.md` that acts as its human-facing
landing page and stores the machine-readable metadata required by OWF.

A `README.md` contains:

- YAML frontmatter with a non-empty OKF `type`;
- an `owf` namespace for OWF-specific document metadata;
- an H1 title;
- a human-readable description or expected result; and
- optionally a link to the directory's `index.md`.

For example:

```markdown
---
type: OWF Outcome Overview
title: Representation Profile
description: Define a concrete filesystem representation of OWF Core.
status: stable
owf:
  state: active
---

# Representation Profile

Define a portable representation of OWF Core using Markdown, directories,
and minimal structured metadata.

See the [directory index](index.md) for contained work and knowledge.
```

The root `README.md` is the Workspace landing page and carries the
representation-profile version in the `owf` namespace. A separate `MAIN.md`
is not needed: the directory identity names the OWF object, `README.md`
represents it, and `index.md` provides navigation.

Projects and Outcomes remain directories even before they own children. Adding
children therefore does not require converting a Markdown file into a directory
or changing the object's identity.

## 6. OKF Index Files

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
`_actions.md` or `_archive/` unless surfacing it improves navigation.

## 7. Identity and References

Every OWF identity is an absolute bundle-relative logical path without a
serialization extension.

### 7.1 Directory object identities

Workspace, Project, and Outcome identities are directory paths and MUST end in
`/`. The trailing slash is semantically significant and distinguishes an OWF
directory object from an OKF Concept whose file has the same stem.

Examples:

```text
/
/_projects/open-work-format/
/_projects/open-work-format/representation-profile/
```

The following may therefore coexist without ambiguity:

```text
representation-profile/
representation-profile.md
```

Their identities are:

```text
/_projects/open-work-format/representation-profile/
/_projects/open-work-format/representation-profile
```

Implementations MUST NOT remove or normalize away the trailing slash of a
directory object identity.

### 7.2 Document identities

A Markdown Concept document uses the OKF Concept ID: its absolute
bundle-relative file path with the `.md` suffix removed.

For example:

```text
File: /_projects/open-work-format/design-background.md
ID:   /_projects/open-work-format/design-background

File: /_projects/open-work-format/README.md
ID:   /_projects/open-work-format/README
```

The `README.md` Concept ID identifies the overview document, while the
containing directory identity identifies the Project or Outcome. They are
different objects with a profile-defined representation relationship.

### 7.3 Nested collection item identities

An Action or Inbox Item is a nested OWF object within a collection Concept. Its
identity is the collection Concept ID followed by a stable fragment identifier.

Examples:

```text
/_projects/open-work-format/_actions#prepare-internal-structure
/_inbox#email-from-jan
```

The corresponding Markdown links include the physical `.md` suffix:

```text
/_projects/open-work-format/_actions.md#prepare-internal-structure
/_inbox.md#email-from-jan
```

The fragment belongs to OWF identity semantics. The containing collection is an
OKF Concept; the individual nested items are full OWF objects but are not
separate OKF Concepts.

Moving or renaming an object changes its identity. An OWF-aware operation MUST
update affected references. A linter detects references that remain broken but
is not the primary mechanism for performing the update.

## 8. Knowledge Documents

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

## 9. Action Collections

Actions are normally short, have relatively short lifetimes, and cannot own
other objects. Creating one Markdown file and frontmatter block for every Action
would be disproportionate. At the same time, placing Actions only in YAML would
make them invisible to generic OKF consumers.

Each possible Action owner MAY therefore contain one `_actions.md`:

- the Workspace file contains standalone Actions;
- a Project file contains Project-owned Actions; and
- an Outcome file contains Outcome-owned Actions.

Absence of `_actions.md` means the owner has no non-archived Actions. The
document is an OKF Concept with a document-level `type`, for example:

```yaml
---
type: OWF Action Collection
title: Actions
---
```

Each contained Action:

- is a full OWF Action object;
- has an owner-local stable fragment identifier;
- appears under a Markdown heading;
- carries the properties required by Core; and
- may use prose and Markdown links.

The exact heading-ID and property syntax is deliberately deferred. The format
must be unambiguous and mechanically parseable without requiring each Action to
become a separate file or OKF Concept.

Document order and Action order have no Core meaning. Intentional ordering
belongs to Views.

## 10. Inbox Collection

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

## 11. Views

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

## 12. Event Log

The Workspace-root `log.md` is both the OKF update log and the concrete
representation of OWF's one logical Event Log.

It follows the OKF log structure:

- date headings use `YYYY-MM-DD`;
- entries form a flat Markdown list;
- newest dates and entries appear first; and
- entries remain human-readable prose.

OWF adds conventions within those entries for semantic event type, subject,
correlation identifier, Review mode and scope, detected Signal, disposition,
resulting operations, and rationale.

For example:

```markdown
# Workspace Event Log

## 2026-08-16

- **Review started** `review:2026-08-16-weekly`
  — mode: periodic
  — scope: [Weekly Review](/_views/review/weekly-review.md)

- **Signal dispositioned** `review:2026-08-16-weekly`
  — signal: action-without-progress
  — subject: [Prepare structure](/_projects/open-work-format/_actions.md#prepare-structure)
  — disposition: retained
  — rationale: Still relevant for the next planning window.
```

Append-only means that recorded historical events are not edited or removed.
New entries are inserted at the top to preserve OKF's newest-first convention;
it does not require byte-level appending at the end of the file.

Local `log.md` files are not currently part of the OWF profile. The one root
log avoids competing histories. Its exact event-entry grammar remains open.

## 13. Archive

A possible owner MAY contain a reserved `_archive/` directory. It is a
representation container, not a Core object and not a structural owner.

The archive is transparent to ownership but not to identity:

- archived contents remain owned by the nearest enclosing Workspace, Project,
  or Outcome;
- at the `_projects/` level, archived Projects remain top-level Workspace
  Projects; and
- moving an object into `_archive/` changes its identity because the physical
  path changes.

An OWF-aware Archive operation MUST update affected links. A linter SHOULD
report references that remain broken after the move.

Typical contents are:

| Archive location | Permitted archived work |
| --- | --- |
| Workspace `_archive/` | standalone Actions |
| `_projects/_archive/` | Projects |
| Project `_archive/` | Project-owned Actions and child Outcomes |
| Outcome `_archive/` | Outcome-owned Actions and child Outcomes |

Archived Actions are stored in:

```text
<owner>/_archive/_actions.md
```

Their identities therefore also change to the archived collection path plus
their stable fragment. Action fragment identifiers remain unique across the
owner's active and archived Action collections together.

Archived Projects and Outcomes retain their directory representation,
`README.md`, and `index.md` under the appropriate local `_archive/`.

Archiving MUST NOT be achieved merely by moving files. Core lifecycle and
Closure Review requirements apply first. An archived object preserves its
preceding successful or unsuccessful terminal disposition.

## 14. OKF Compatibility Profile

The intended compatibility boundary is:

> An OWF representation is an OKF v0.2-conformant Knowledge Bundle. Every
> non-reserved Markdown document is an OKF Concept. Some collection Concepts
> contain multiple nested OWF objects that are not separate OKF Concepts.

Consequently:

- every non-reserved `.md` has parseable YAML frontmatter and non-empty
  `type`;
- `index.md` and `log.md` follow their reserved OKF structures;
- unknown OKF fields and producer-defined extension fields remain permitted;
- standard Markdown links are used for physical navigation;
- Actions and Inbox Items remain visible within OKF Concept documents; and
- OWF-specific frontmatter belongs under the `owf` namespace.

OKF `status` and OWF `owf.state` have different meanings:

- `status` describes the OKF document lifecycle such as `draft`, `stable`,
  or `deprecated`;
- `owf.state` represents the intrinsic lifecycle or execution state of the OWF
  object represented by that document.

The OKF actor, provenance, trust, freshness, and attestation families remain
optional. Their presence does not add actor identity or collaboration semantics
to OWF Core.

## 15. External Structure Baseline

The external structure baseline now defines:

- an OKF-compatible Markdown bundle;
- directory-based Workspace, Project, and Outcome objects;
- `README.md` as their canonical landing page and metadata representation;
- reserved OKF `index.md` for navigation;
- a shared OKF/OWF root `log.md`;
- Markdown Action and Inbox collection Concepts;
- Markdown placement for scoped and Workspace-level Knowledge;
- hierarchical Markdown Views;
- directory, document, and fragment-based identity rules; and
- local Archive containers that preserve ownership but change identity.

These decisions remain non-normative until incorporated into a representation
specification. Internal design may reveal a genuine structural problem, but
field naming or presentation preference alone should not reopen this baseline.

## 16. Current Open Questions

The following representation decisions remain open:

- exact canonical `type` values;
- exact frontmatter fields and recommended Markdown sections;
- the internal heading, stable-fragment, and property syntax for Actions and
  Inbox Items;
- representation of dependencies, manual blocks, references, and
  `review-after`;
- the field used to preserve an archived object's preceding terminal
  disposition;
- exact index completeness lint severity;
- serialization of Computed View queries and Curated View membership;
- representation of View Snapshots;
- the machine-readable convention within OKF-compatible Event Log entries;
- extension compatibility rules; and
- the normative lint catalogue.
