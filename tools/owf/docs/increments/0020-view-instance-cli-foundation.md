# 0020 — View instance CLI foundation

> Status: in_progress
> Description: Create, list and retrieve operational View instances backed by validated, reusable Markdown definitions.
> Depends on: [0003 — Action creation and retrieval](0003-action-create-get.md) for the Operational Store baseline and [0017 — CLI Action blocking and dependencies](0017-action-blocking-cli.md) for the current store baseline.

## Goal and scope

A user prepares a Markdown View definition, creates a named instance in the
Workspace, and uses the CLI to inspect its persisted identity and current
configuration. Multiple instances can reference one shared definition.

This is the first runtime Views increment. It implements definition loading and
validation as well as instance persistence; it does not evaluate Actions into
columns. A successful read means the configuration is valid, not that a board
has been evaluated or is empty.

The authority is the [Views profile](../../../../docs/design/views-profile-notes.md),
the [representation profile](../../../../docs/design/representation-profile-notes.md),
[Operational Store design](../../../../docs/design/operational-store-notes.md),
and [Core](../../../../spec/core-v0.md). Follow the
[architecture](../architecture.md) and [development guidelines](../development-guidelines.md).

Included:

- Manually authored Markdown definitions under Workspace-root `_views/`.
- Validation of the complete agreed state-and-blocking definition format.
- Create, list and get operations with human and JSON CLI output.
- Stable Workspace-scoped instance IDs, titles and definition references.
- Atomic instance creation and its Operational Event Log entry.
- A usable definition example, command help and generated Workspace guidance.

Deferred: instance windows, editing/deleting instances, definition authoring
commands, definition discovery/listing, Action membership evaluation, placement,
manual ordering, routing/reconciliation, moves, creation in columns, HTTP/GUI
changes, Snapshots, automated Planning/Review, arbitrary filters and registries.
Do not create speculative placement/rank storage or window APIs in this increment.
The existing board continues to use its current behavior.

## Proposed solution

### CLI contract

Use the existing verb-first CLI convention:

```bash
owf create view --definition /_views/work-board.md --title "My work"
owf list views
owf get view VIEW_ID
```

All three commands support `--json` and normal command help. Workspace discovery
follows existing commands, including invocation from descendant directories.
The definition URL is always relative to the Workspace root, not the process
working directory. Commands work without a web server and never prompt.

The discussion's `owf view create/list/get` spelling was illustrative. This
document uses the existing `create action/get action/list actions` convention
without adding parallel aliases.

| Operation | Result and behavior                                                                                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create    | Require a non-empty title and definition URL; load and validate the definition; atomically persist a new instance and creation event; return the saved instance and its ID. |
| List      | Return every stored instance with ID, title and definition reference; do not load or validate referenced definition files. An empty supported store returns an empty list.  |
| Get       | Resolve the instance by ID, load and validate its current definition, and return instance metadata plus the resolved definition configuration. Unknown IDs fail explicitly. |

Instance titles use existing title normalization conventions. Duplicate titles
are allowed. Every successful create produces a new independent ID, including
repeated calls with the same title and definition; no title-based deduplication
or implicit replacement is introduced.

List order must be deterministic, using ascending instance ID for this increment;
it has no planning or priority meaning. No list filters or pagination are added.
Get identifies instances by their stored ID, not by title or definition path.
No new public View URI scheme is introduced.

Use the existing success/error envelope and stdout/stderr/exit-code conventions.
JSON exposes structured data, not preformatted tables. Get distinguishes stored
instance metadata from current definition data; definition title and instance
title must not be conflated. It includes column IDs, titles and order, state
sets and effective defaults, and blocking inclusion/type. Preserve the optional
purpose as descriptive data. Resolve implicit defaults in the returned
configuration without writing them back to Markdown.

Do not return empty Action collections or member counts as if evaluation had
taken place. Exact DTO names and diagnostic codes are implementation choices;
document the resulting public output.

### Definition loading and validation

The definition is a regular Markdown definition document beneath `_views/`,
including nested grouping directories allowed by the representation profile.
A reserved navigation `index.md` is not a definition. Read the specified
document; this is not a Workspace-wide definition discovery or conformance scan.

Validate the document envelope: YAML frontmatter, canonical
`type: OWF View Definition`, non-empty title, corresponding H1, and the
`owf` configuration. Optional description/prose and permitted common
document metadata remain valid. A heading inside a code example does not
satisfy the document H1 requirement. Reject malformed or ambiguous YAML,
including duplicate mapping keys.

Implement the existing profile, not an interim reduced schema:

- `renderer: kanban`; optional open-vocabulary `purpose`.
- Ordered column definitions with unique, non-empty stable IDs and titles.
- Ordinary columns default to `type: status`; `status` is one execution
  state or a non-empty, duplicate-free state list.
- Definition state spellings are `open`, `in_progress`, `waiting`,
  `completed` and `cancelled`; `blocked` is not a state.
- `default_status`, when supplied, belongs to that column's state set;
  otherwise the first listed state is effective.
- `include_blocked` is a boolean on ordinary columns, defaulting to false.
- At most one `type: blocked` column, with no `status`,
  `default_status` or `include_blocked`.
- Explicit `defaults[state]` references an ordinary column supporting that
  state. Otherwise use the first supporting ordinary column in definition order.
- Multiple columns may support the same state. Definitions need not cover every
  state or include a Blocked column.
- Reject unsupported View configuration fields, including the superseded
  namespace, selector, filter, ordering and transition-hook model. This does
  not prohibit common document metadata allowed by the representation profile.

This validates configuration only. No Actions, dependency graph or eligibility
facts are needed to create or retrieve an instance. Do not implement routing,
moves or Action-state effects merely because their configuration is accepted.

### References and current-definition behavior

Store the existing `MarkdownObjectReference { url, id? }` shape. The required
URL points to the physical Markdown file, for example
`/_views/work-board.md`; the document's logical path identity and the
instance's store ID remain distinct.

Use URL/path conversion and Workspace-containment rules at the filesystem
boundary. Reject external URLs, traversal and targets outside the permitted
Workspace definition location; URL encoding must not bypass containment.
Support legitimate encoded path characters, including spaces, on Windows
and Linux. Do not interpret the leading slash as an OS filesystem root.

A path-only reference is sufficient. When the definition declares a valid
optional `owf.id`, retain it in the reference and verify that the URL and
ID still identify the same document on get. Do not add an ID index, Workspace
scan, automatic relocation or repair command. A missing target or mismatched
stored reference fails explicitly; reads never repair references.

Instances always use the current shared definition. Do not persist a pinned
copy, resolved column configuration, or authoritative Action lists in the
instance. Editing the definition changes subsequent get results for all its
instances; it does not rename those instances or change Actions.

| Situation                                                   | Required outcome                                                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Create references missing, unreadable or invalid definition | Fail without an instance or creation event.                                                                                     |
| Definition changes validly after creation                   | Get returns the new configuration with the same stored instance ID and title.                                                   |
| Existing definition disappears or becomes invalid           | Get fails with actionable diagnostics; the instance remains stored.                                                             |
| One instance references a broken definition                 | List still returns all valid stored instance records, including that reference; it makes no claim that definitions are healthy. |
| Operational Store unavailable or unsupported                | Fail explicitly; never return an empty success or initialize a replacement.                                                     |

Diagnostics identify the definition URL and relevant field/column where possible;
get failures also identify the instance. An invalid stored instance record is
a store-data error, not a reason to silently skip that row. Read operations
change no instance, Action, definition, timestamp or event.

### Persistence and application boundaries

Keep semantic validation in domain code, orchestration in application use cases,
Markdown parsing/path resolution and SQLite access in infrastructure, and CLI
parsing/rendering in the interface adapter. Reuse existing reference and
Workspace support where appropriate. Do not add generic repositories or a
View extension framework.

Persist only this increment's instance data: stable ID, title, definition
reference, and creation metadata consistent with existing operational records.
Create the instance and its semantic creation event in one transaction.
An event-write failure rolls back the instance; no success is returned before
commit. Existing Actions and Markdown files are unchanged.

The validation read of editable Markdown is not part of a filesystem/SQLite
transaction. Do not claim a cross-representation snapshot guarantee or add
locking/version-pinning machinery. Subsequent get validates the current file.

A schema change is expected for View instance storage. Follow the existing PoC
policy: initialize new Workspaces with the new supported version and reject old
or unknown versions without mutation. No migration, implicit upgrade, database
replacement or backfill is included. Document the actual supported version and
fresh-Workspace requirement; do not silently change the compatibility policy.

### Documentation and example

During implementation, update CLI help, the tool README and the single-source
generated Workspace `AGENTS.md` template for these three fundamental commands.
Explain manual definition authoring, definition versus instance identity,
shared current configuration, and the absence of Action evaluation.

Provide a copyable valid example based on the Views profile, including the
document envelope, multiple ordinary columns sharing a state and a Blocked
column. Explain preparing `_views/` and its navigation index according to
the representation profile. No automatic sample installation or Markdown
mutation is required from the View commands.

Newly initialized Workspaces receive the updated guide. Existing user-edited
guides must not be overwritten or backfilled. A guide-refresh mechanism is
outside scope. Keep shipped-capability documentation accurate: this proposal
alone does not deliver the commands.

## Acceptance criteria

- **AC1 — Create and persist:** Given a supported Workspace and valid definition,
  creating a named instance returns a stable ID and saves it with one creation
  event. A new CLI process retrieves the same ID, title and reference.
- **AC2 — Independent identities:** Creating two instances from one definition
  produces different IDs. Duplicate titles are accepted. Neither definition
  nor Actions are copied or changed.
- **AC3 — Inventory:** List returns all stored instances in deterministic order
  with their IDs, titles and references. No instances produces an empty success.
  A missing/invalid definition does not prevent listing its instance or others.
- **AC4 — Current configuration:** Get exposes the current validated definition,
  ordered columns and effective defaults. A valid shared-definition edit appears
  on subsequent get calls for both instances without changing instance titles,
  identities or persisted data. No evaluated membership is claimed.
- **AC5 — Complete profile validation:** Accept the supported scalar/multi-state,
  shared-state and blocking configurations and omitted-state definitions.
  Reject malformed envelopes/YAML, duplicate column IDs, invalid states/defaults,
  forbidden field combinations and unsupported configuration.
- **AC6 — Failure and atomicity:** Invalid create input/definition and persistence
  failures leave no instance or creation event. Unknown instance IDs, missing
  definitions and inconsistent references produce explicit errors. Failed get
  preserves the stored instance.
- **AC7 — Boundaries and read purity:** Commands resolve the same Workspace and
  root-relative definition when invoked from its descendants. Encoded paths work
  correctly; traversal/outside targets fail. List/get create no semantic writes
  or events. Unavailable/unsupported stores are not treated as empty.
- **AC8 — Usable CLI and documentation:** Human and JSON output, help, example
  definition, README and generated Workspace guide match implemented behavior.
  A user can complete the documented flow without a web server. Existing guides
  remain untouched; schema compatibility limitations are explicit.

Executable acceptance: [Independent instances use a shared current definition](../../tests/acceptance/features/view-instances.feature).

## Verification plan

Follow the development guidelines; each test protects a distinct rule or
boundary, without a test-count target or repeating the whole matrix at every layer.

| Risk / criteria                                               | Appropriate verification                                                                                       |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Definition rules and effective defaults (AC5)                 | Focused domain/parser tests, including valid overlapping states and invalid field combinations.                |
| Real Markdown/reference boundaries (AC4, AC5, AC7)            | Integration with temporary files: valid edit, missing target, ID mismatch, encoded path and containment cases. |
| Store round-trip and creation/event atomicity (AC1, AC2, AC6) | SQLite integration including injected event-write failure and reopened store.                                  |
| Inventory and read purity (AC3, AC4, AC7)                     | Check broken references remain listed and get/list leave stored data and logs unchanged.                       |
| Observable shared-definition behavior (AC2, AC4)              | Small Cucumber scenario through the application boundary.                                                      |
| Actual CLI contract and documentation (AC1, AC8)              | Small built-CLI journey exercising create/list/get and JSON, plus documentation/example checks.                |

Run required `npm run verify` before implementation handoff and record the
actual revision, platform and results. New browser scenarios are unnecessary
because this increment changes no GUI behavior; existing required gates remain.
Actual implementation checks are recorded below.

Human try-out after implementation:

1. Initialize a fresh trial Workspace with the supported store schema.
2. Prepare the documented definition under `_views/`.
3. Create two instances, list them, and get each by ID in a new CLI process.
4. Edit a column title in the definition and get both again.
5. Temporarily make the definition invalid: get must fail while list still
   returns both instances. Restore the definition and get succeeds again.

## Open questions

No blocking product decisions remain for this scope. Exact physical schema,
DTO field names, diagnostic codes and module decomposition are implementation
choices within this contract. Record those choices in the implementation outcome.

## Implementation and review outcome

Implemented on 2026-10-21; remains `in_progress` pending independent code review.

Delivered verb-first create/list/get commands with human and structured JSON
output, strict shared-definition validation, current-file reads, independent
UUID v4 instance identities, deterministic inventory, and atomic creation events.
No Action evaluation, placements, windows, HTTP or GUI changes were introduced.

Implementation choices:

- SQLite schema **6**, with `views` and `view_events` tables. One `view.created`
  event commits with each instance. New Workspaces use schema 6; older/unknown
  versions are rejected unchanged. No migration or implicit replacement.
- Stored data: `id`, normalized `title`, `definition: { url, id? }`, `created_at`.
  Get separates `result.view` from `result.definition`; list uses `result.views`.
  The tool README documents effective column/default fields and error codes.
- Optional definition IDs remain nonblank strings, without an invented UUID
  constraint or global uniqueness scan. References resolve only their supplied
  URL and verify a retained ID. Encoded paths and physical containment are checked.
- YAML duplicate keys/custom tags and unsupported configuration fail explicitly.
  H1 recognition excludes code examples; correspondence normalizes Markdown
  formatting, whitespace and case rather than requiring literal string equality.
  Empty column arrays remain valid: the agreed profile requires nonempty state
  sets in ordinary columns, but does not require a nonempty column array.
- Updated CLI help, README, copyable definition, architecture capability summary,
  and single-source generated Workspace guide. Existing guides remain untouched.

Verification: focused domain/parser, SQLite, application, Cucumber and built-CLI
checks were developed with behavior. Full `npm run verify` passed: typecheck, lint,
formatting, architecture, production build, 145 unit tests, 201 integration tests,
31 Cucumber scenarios (171 steps), 24 CLI E2E tests and 7 Chromium browser tests.
The first verification attempts exposed increment formatting and the existing
guide-example fixture needing definition preparation and View-ID substitution;
both were corrected, then the complete verification passed without weakening gates.
Validation platform: Windows, Node.js 24.21.0, npm 11.4.1; Linux execution was not
performed. Base revision: `0f400e5f259052297d238842696209abe7f06c2d`; implementation
revision is the commit containing this outcome. The implementing agent inspected
all delegated diffs; this does not replace the pending independent review.

Known scope limits: editable Markdown validation and SQLite persistence do not
form a cross-representation snapshot. Definitions are not discovered or repaired,
and a valid get reports configuration, never evaluated membership.

## Decision changes and follow-up

- 2026-10-20: Agreed create/list/get with full definition validation and
  Operational Store instances. Explicitly deferred instance windows and all
  Action evaluation/placement work to keep the first increment small.
- CLI examples are aligned with the existing verb-first command structure.
- Next candidate: read-only evaluation of Actions into View columns through CLI.
  That requires a separate agreed increment; it is not authorized by this one.
