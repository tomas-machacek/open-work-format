# OWF Representation Profile Design Notes

> Status: Working design notes; non-normative and incomplete

## 1. Purpose

These notes capture the representation decisions made after closing the OWF Core
v0 conceptual model. They are an input to a future normative representation
profile and do not yet define serialization conformance.

The representation should remain:

- readable and editable without specialized tooling;
- usable through a normal file explorer or Markdown application;
- friendly to Git and AI agents;
- free of hidden database state; and
- structurally simple even where the Core semantics are richer.

## 2. General Model

An OWF Workspace is represented by a directory tree. Markdown is used for
long-lived descriptive objects and YAML is used for compact Action collections.

The Workspace directory is the bundle root. For example:

```text
my-workspace/
├── _index.md
├── _actions.yaml
├── general-note.md
├── _projects/
│   ├── _index.md
│   └── open-work-format/
│       ├── _index.md
│       ├── _actions.yaml
│       ├── design-background.md
│       ├── representation-profile/
│       │   ├── _index.md
│       │   ├── _actions.yaml
│       │   └── okf-notes.md
│       └── _archive/
│           ├── _index.md
│           ├── _actions.yaml
│           └── obsolete-outcome/
│               └── _index.md
├── _inbox/
│   └── _index.md
└── _views/
    └── _index.md
```

Optional files and directories are omitted when empty unless a later normative
rule says otherwise.

## 3. Reserved Names

Names beginning with `_` are reserved for files and directories defined by the
representation profile. User-defined object names MUST NOT begin with `_`.

Current reserved names are:

- `_index.md`
- `_projects/`
- `_inbox/`
- `_views/`
- `_actions.yaml`
- `_archive/`

The leading underscore keeps structural entries visible, sorts them before most
user content in file explorers, and avoids using hidden dot-files.

## 4. Object Mapping

Object role is derived from representation location:

| Representation | Core meaning |
| --- | --- |
| Workspace-root `_index.md` | Workspace representation |
| User-named directory directly under `_projects/` | Project |
| User-named directory directly under a Project or Outcome | child Outcome |
| Entry in an owner's `_actions.yaml` | Action |
| Ordinary `.md` file directly under Workspace, Project, or Outcome | Knowledge Document |
| Document under `_inbox/` | Inbox Item |
| Document under `_views/` | View |

The need for a redundant explicit `type` field remains open. Location already
determines type, but an explicit field could provide additional validation.

## 5. Workspace, Projects, and Outcomes

The Workspace, every Project, and every Outcome are directories represented by
their `_index.md`.

The Workspace-root `_index.md` represents the Workspace and is the location for
the representation-profile version.

A Project or Outcome `_index.md` contains:

- machine-readable metadata required for its semantics, such as intrinsic state;
- an H1 title;
- a human-readable description or expected result; and
- navigation to user-defined objects at the next physical level.

Projects and Outcomes are always directories, even before they own children.
Adding children therefore does not require converting a Markdown file into a
directory or changing the object's identity.

## 6. Index Files

Every directory defined by the profile contains `_index.md`. An index supports
progressive disclosure: a human or agent can inspect a short overview before
opening individual objects.

An `_index.md`:

- describes or represents its directory;
- lists user-defined entries at the next physical level;
- may group entries by role;
- uses relative Markdown links; and
- does not establish existence or ownership.

Filesystem structure and object data remain authoritative. A missing or stale
entry in an index is a lint finding rather than evidence that the unlisted
object does not exist.

An index does not repeat mandatory profile infrastructure. For example, a
Project index does not need boilerplate links to `_actions.yaml` or
`_archive/`. Their meaning is already defined by the profile.

## 7. Knowledge Documents

Knowledge Documents owned by a Workspace, Project, or Outcome are stored
directly in that owner's directory as ordinary Markdown files.

This makes them visually distinct from Actions in a file explorer:

- Knowledge Documents are named `.md` files;
- Actions are entries in `_actions.yaml`;
- child Outcomes are directories.

Detailed specifications, background material, evidence, and other durable
context should be Knowledge Documents rather than long Action definitions.

## 8. Action Collections

Actions are normally short, often only one sentence, have relatively short
lifetimes, and cannot own other objects. Creating a separate Markdown file and
frontmatter block for each Action would therefore be disproportionate.

Each possible Action owner MAY contain one `_actions.yaml`:

- the Workspace file contains standalone Actions;
- a Project file contains Project-owned Actions; and
- an Outcome file contains Outcome-owned Actions.

Absence of `_actions.yaml` means that the owner has no non-archived Actions.

The planned shape uses a mapping keyed by an owner-local stable Action ID:

```yaml
actions:
  define-minimum-frontmatter:
    title: Define minimum frontmatter
    state: open

  prepare-example:
    title: Prepare a minimal example Workspace
    state: open
    description: |
      Demonstrate ownership, dependencies, parking,
      Planning Views, and Review.
```

YAML `|` preserves line breaks in longer text; `>` folds lines into a
paragraph. Exact field names and required properties remain to be specified.

Ordering within the YAML mapping has no Core meaning. Intentional ordering
belongs to Views.

### 8.1 Action Identity

Because an Action is an entry rather than a physical file, the representation
profile maps it into a virtual logical path:

```text
/<owner-identity>/_actions/<action-id>
```

For example:

```text
/_projects/open-work-format/representation-profile/_actions/define-minimum-frontmatter
```

Action IDs must be unique within the owner's active and archived Action
collections together.

## 9. Archive

A possible owner MAY contain a reserved `_archive/` directory. It is a
transparent representation container, not a Core object and not a structural
owner.

Its contents remain owned by the nearest enclosing Workspace, Project, or
Outcome. At the `_projects/` level, archived Projects remain top-level
Workspace Projects.

Typical contents are:

| Archive location | Permitted archived work |
| --- | --- |
| Workspace `_archive/` | standalone Actions |
| `_projects/_archive/` | Projects |
| Project `_archive/` | Project-owned Actions and child Outcomes |
| Outcome `_archive/` | Outcome-owned Actions and child Outcomes |

Archived Actions are stored in:

```text
<owner>/_archive/_actions.yaml
```

Archived Projects and Outcomes retain their directory representation under the
appropriate local `_archive/`.

The archive is transparent to logical identity and ownership. Moving an object
into `_archive/` is a physical storage change representing an already
completed Archive operation, not a logical ownership move. The `_archive`
segment is therefore omitted when mapping the physical location to logical
identity.

Archiving MUST NOT be achieved merely by moving files. Core lifecycle and
Closure Review requirements apply first. An archived object preserves its
preceding successful or unsuccessful terminal disposition.

For Actions:

- IDs are unique across `_actions.yaml` and
  `_archive/_actions.yaml`;
- an Action cannot occur in both files;
- the archived collection contains only Archived Actions; and
- each archived Action preserves whether it was previously Completed or
  Cancelled.

If `_archive/` exists, it contains its own `_index.md`. That index lists
user-named archived directories but does not need to list the reserved
`_actions.yaml`.

## 10. Current Open Questions

The following representation decisions remain open:

- whether objects need an explicit `type` field despite type being derived from
  location;
- exact frontmatter fields for Workspace, Project, Outcome, Knowledge Document,
  Inbox Item, View, and View Snapshot;
- the complete Action YAML schema and canonical spelling of enum values;
- representation of dependencies, manual blocks, references, and
  `review-after`;
- the field used to preserve an archived object's preceding terminal
  disposition;
- exact index section conventions and completeness lint severity;
- serialization of Computed Views and Curated View ordering;
- representation of View Snapshots, Event Log entries, and Review runs;
- extension namespacing; and
- the normative lint catalogue.
