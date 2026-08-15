# OWF Representation Profile Design Notes

> Status: Working design notes; external structure baseline complete; non-normative

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

### 1.1 Choosing Markdown or YAML

The representation selects a medium according to how an object is used:

> Use Markdown where Core semantics are naturally expressed through prose,
> headings, ordering, grouping, and links. Use YAML where many compact records
> require explicit structured properties.

Projects, Outcomes, Knowledge Documents, Views, and the Workspace are
longer-lived human-facing documents and use Markdown with minimal structured
metadata. Actions and Inbox Items are normally short records with several
machine-readable properties and use aggregated YAML collections.

This split avoids inventing custom Markdown syntax for Action state,
dependencies, and other per-record properties while preserving Markdown's
natural strengths for View membership, ordering, grouping, links, and
explanation.

## 2. General Model

An OWF Workspace is represented by a directory tree. Markdown is used for
long-lived descriptive objects and YAML is used for compact Action collections.

The Workspace directory is the bundle root. For example:

```text
my-workspace/
├── _index.md
├── _actions.yaml
├── _inbox.yaml
├── _knowledge/
│   ├── _index.md
│   ├── general-note.md
│   └── technologies/
│       ├── _index.md
│       └── oauth.md
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
└── _views/
    ├── _index.md
    ├── next-actions.md
    ├── planning/
    │   ├── _index.md
    │   └── sprints/
    │       ├── _index.md
    │       └── sprint-42.md
    └── review/
        ├── _index.md
        └── weekly-review.md
```

Optional files and directories are omitted when empty unless a later normative
rule says otherwise.

## 3. Reserved Names

Names beginning with `_` are reserved for files and directories defined by the
representation profile. User-defined object names MUST NOT begin with `_`.

Current reserved names are:

- `_index.md`
- `_projects/`
- `_inbox.yaml`
- `_knowledge/`
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
| Entry in the Workspace-root `_inbox.yaml` | Inbox Item |
| Ordinary `.md` file directly under a Project or Outcome | Knowledge Document owned by that object |
| Ordinary `.md` file anywhere under Workspace-root `_knowledge/` | Workspace-owned Knowledge Document |
| Ordinary `.md` file anywhere under `_views/` | View |

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

Knowledge Documents owned by a Project or Outcome are stored directly in the
owner directory as ordinary Markdown files. They MUST NOT introduce additional
Knowledge grouping directories there: the Project and recursive Outcome
hierarchy already provides the relevant organization.

Workspace-owned Knowledge Documents are stored under the optional reserved
`_knowledge/` directory. They MAY be organized using arbitrarily nested,
user-named grouping directories.

A Knowledge grouping directory:

- is a transparent representation container, not a Core object;
- does not change ownership: all documents in this subtree remain owned by the
  Workspace;
- contains `_index.md`; and
- may contain Knowledge Documents and further grouping directories.

For example:

```text
_knowledge/
├── _index.md
├── architecture-principles.md
├── people/
│   ├── _index.md
│   └── jan-novak.md
└── technologies/
    ├── _index.md
    └── kafka/
        ├── _index.md
        └── operational-notes.md
```

A Knowledge Document may contain original documentation, a local synthesis, or
a durable reference to material stored in another format or external system.
External documentation does not need to be copied into the Workspace.

This layout keeps Knowledge Documents visually distinct from Actions in a file
explorer:

- Knowledge Documents are named `.md` files;
- Actions are entries in `_actions.yaml`; and
- child Outcomes are directories.
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

## 9. Inbox Collection

Inbox Items are short-lived unresolved captures and do not own other objects.
They are represented as entries in one optional Workspace-root
`_inbox.yaml`; OWF does not define an `_inbox/` directory.

Absence of `_inbox.yaml` means that the Workspace has no current Inbox Items.
The planned shape is intentionally smaller than the Action schema:

```yaml
items:
  investigate-view-snapshots:
    captured-at: 2026-08-15T20:45:00+02:00
    content: Investigate whether View Snapshots need shallow and deep variants.

  email-from-jan:
    captured-at: 2026-08-15T21:10:00+02:00
    content: |
      Jan sent additional requirements for the integration.
      Clarify whether they change the expected Outcome.
    source: https://example.com/message/123
```

Exact field names beyond the Core-required `captured-at` semantics remain to be
specified. Each item has a Workspace-local stable ID and maps to the virtual
logical path:

```text
/_inbox/<item-id>
```

YAML mapping order has no Core meaning. Age and ordering are derived from
`captured-at` and may be exposed through Views.

Inbox Items are not archived. After successful Resolved or Discarded processing,
the entry is consumed and removed from `_inbox.yaml`. The Event Log may record
that processing but does not retain the item as current Workspace state.

Because `_inbox.yaml` is the complete profile-defined collection,
`_index.md` does not duplicate its entries.


## 10. Views

Views are represented as individual Markdown files under the reserved
`_views/` directory. A small Workspace may store them flat; a larger Workspace
MAY organize them in arbitrarily nested, user-named grouping directories.

Every View grouping directory:

- is a transparent representation container, not a Core object;
- contains `_index.md`;
- may contain View documents and further grouping directories; and
- does not determine the View's machine-readable `purpose`.

For example, placement under `_views/planning/` is a human organization choice
and MUST NOT implicitly assign `purpose: planning`. Purpose remains explicit
because one View may serve more than one intent.

Markdown is preferred because a Curated View naturally expresses its semantics
through standard document structures:

- a link expresses membership;
- link order expresses ordering;
- headings express grouping; and
- prose explains intent and context.

The View frontmatter contains properties of the View itself, such as optional
`purpose` and planning-window metadata. It does not duplicate the state or
other properties of referenced members.

A Computed View also remains a Markdown document but requires a
machine-readable query. Whether that query belongs in frontmatter or a
designated body block remains open.

The syntax for linking from Markdown to logical OWF identities, especially
aggregated Actions without individual physical files, also remains open.

## 11. Archive

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

## 12. External Structure Baseline

The working design of the external Workspace structure is complete enough to
serve as the baseline for the next phase. It now defines:

- reserved root entries;
- directory-based Project and Outcome hierarchy;
- Markdown placement for scoped and Workspace-level Knowledge;
- hierarchical Markdown Views;
- aggregated YAML Actions and Inbox Items;
- mandatory directory indexes; and
- transparent local Archive containers.

These remain non-normative until incorporated into a representation
specification. Internal design may reveal a genuine structural problem, but
field naming or frontmatter preference alone should not reopen this baseline.

The next phase defines internal document and collection structure: frontmatter,
required and recommended Markdown sections, YAML schemas, reference syntax, and
related lint rules.

## 13. Current Open Questions

The following representation decisions remain open:

- whether objects need an explicit `type` field despite type being derived from
  location;
- exact frontmatter fields and required or recommended Markdown sections for
  Workspace, Project, Outcome, Knowledge Document, View, and View Snapshot;
- the complete Action and Inbox YAML schemas and canonical spelling of enum
  values;
- representation of dependencies, manual blocks, references, and
  `review-after`;
- the field used to preserve an archived object's preceding terminal
  disposition;
- exact index section conventions and completeness lint severity;
- serialization of Computed Views and Curated View ordering;
- representation of View Snapshots, Event Log entries, and Review runs;
- extension namespacing; and
- the normative lint catalogue.
