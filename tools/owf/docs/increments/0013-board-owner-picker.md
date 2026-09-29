# 0013 — Search for Action owners on the board

> Status: in_progress
> Description: Choose a Workspace, Project or Outcome owner by searching in the board's Action forms.
> Depends on: [0008 — Create Actions on the board](0008-board-action-create.md) and [0012 — Edit an Action on the board](0012-board-action-edit.md).

## Goal and scope

The user reviewed and approved this design for implementation on 2026-09-29.

Replace manual owner URL entry in both Add Action and the Action detail editor
with a searchable list of valid owners. People should recognize Projects and
Outcomes by name, see where they sit in the hierarchy, and select the correct
one without knowing the URL syntax. Keep Workspace (`/`) as an obvious choice.

References: [architecture](../architecture.md),
[development guidelines](../development-guidelines.md),
[MVP scope](../../../../docs/design/mvp-scope.md),
[Core v0](../../../../spec/core-v0.md),
[Operational Store design](../../../../docs/design/operational-store-notes.md),
[0002 context structure](0002-project-outcome-creation.md),
[0011 owner validation](0011-action-edit-cli.md) and
[0006 quiet refresh](0006-read-only-action-board.md).

Included: read-only owner discovery for the local board, one reusable picker
in both Action forms, clear loading/error/empty states and server-side
revalidation at save. Deferred: CLI owner listing, editing Project/Outcome
metadata, creating owners in the picker, changing owners of existing Markdown
objects, board filtering, fuzzy search and cross-Workspace selection. No
store schema change or migration is needed.

## Proposed solution

### Available owners

Add a shared application operation that discovers the current Workspace and
enumerates its physical `_projects` tree through a focused filesystem port.
Return Workspace plus Project and Outcome candidates with canonical
Workspace-rooted URL, type, title and a hierarchy label or parent reference.
Build labels from validated README metadata and containment, not from index.md
links. Do not read the Operational Store to discover owners or write any file.

Apply the same owner type, lifecycle and ancestor rules as Action creation:
only active or parked Projects/Outcomes with no terminal or archived ancestor
are selectable. A terminal/archived context and its descendants are not
offered. Ignore ordinary directories and non-OWF Markdown; reject unsafe
symlinks and traversal and report unreadable or malformed _claimed_ OWF owner
metadata as a discovery error rather than silently presenting an incomplete
list. Keep traversal within the Workspace and avoid following links. Titles
need not be unique, so show a path/hierarchy as a disambiguator and keep the
canonical URL as the saved value. Order Workspace first, then contexts in a
stable title/path order. An empty `_projects` tree still returns Workspace.

Expose a local read-only endpoint such as `GET /api/owners` with a typed
contract and the board's established `no-store` behavior. The endpoint returns
a distinct error when discovery fails, never an empty successful list on
failure. Keep the HTTP adapter thin; the application owns traversal and
validation through ports. CLI create/set Action and their stored owner format
remain unchanged.

### Picker and saving

Use one accessible searchable picker in both the Add Action form and the
expanded Action editor. Search client-side by title, hierarchy and URL,
case-insensitively; a simple substring match suffices. Show readable type and
hierarchy in the choices, with the URL available as secondary text. Keyboard
typing, arrows, Enter, Escape and pointer/touch selection must work within
the form/dialog without triggering card drag or closing the Action editor.
Provide clear label, focus indication, result count/no matches and an
announcement of the selected owner. Avoid a large menu obscuring Save or
other fields on a narrow viewport.

On create, default to Workspace, matching the existing board form. In the
editor, display the Action's stored owner even if its Markdown path has since
gone missing or become ineligible. Flag it as unavailable in the picker but
do not silently replace it. Saving another field without changing owner must
continue to work as in 0011; choosing a new owner sends its canonical URL.
The picker must never silently turn typed search text into an owner selection.
For creation, selection is required; for editing, unchanged stored owner is
retained without revalidation by the picker.

Load choices when a form opens and refresh them on a later opening or explicit
Retry/Refresh owners. Preserve other form fields and the selected owner while
loading or refreshing; do not blank the board or editor. If loading fails,
explain the error and offer Retry. Keep the previously chosen value visible;
do not pretend an incomplete list is authoritative. A Project/Outcome may
change between listing and Save: the existing create/set application operation
revalidates the selected URL at write time and reports the real owner error,
leaving the draft intact. No cached list grants permission to save.

## Acceptance criteria

AC1: Add Action and Edit Action both offer the same searchable choices for
Workspace, eligible Projects and eligible Outcomes. Searching by name,
hierarchy or URL finds the same canonical owner. Duplicate names remain
distinguishable; selection submits the exact canonical URL.

AC2: Root is selected by default on create. Edit initially shows the stored
owner; a missing or ineligible old owner remains visible with a warning and
does not prevent changing other fields. Selecting a new valid owner changes
ownership without changing Action identity. Typing search text alone never
changes the selected owner.

AC3: Terminal, archived, malformed and unsafe contexts cannot be selected.
Discovery reports a real read/metadata failure rather than a partial list.
An owner made invalid after discovery is rejected at Save by existing rules,
with no partial Action or event change and with the draft preserved.

AC4: Keyboard and touch users can search, navigate, select and leave the
picker without interfering with dialog Escape or board drag. Loading,
no-results and error states are understandable and do not flash or discard
the Action draft. Opening the forms later reveals owners created through CLI.

AC5: Existing CLI commands, state movement, Action validation and persistence
remain unchanged. Owner discovery is read-only and needs no schema migration.

## Verification plan

- Application/adapter checks for nested Project/Outcome enumeration,
  canonical URLs, duplicate names, eligible/terminal/archived ancestors,
  ordinary folders, symlinks and read/metadata errors (AC1, AC3, AC5).
- HTTP integration checks for a valid list, Workspace-only result and a
  distinct discovery failure; creation/editing still revalidate the selected
  owner when it changes between list and save (AC2–AC3).
- Component checks for shared picker use in both forms, search and keyboard
  interaction, unchanged unavailable owner, no accidental selection, draft
  retention and retry. Avoid duplicating traversal cases in UI tests (AC1–AC4).
- Extend an existing focused Playwright board journey only if component tests
  cannot reliably establish the dialog/drag/picker interaction. Keep browser
  tests minimal. Manually inspect desktop and narrow touch layout and keyboard
  flow. Run `npm run verify` before implementation handoff and record the
  actual platform, revision and results.

Manual trial: create two Projects with similarly named Outcomes. Open Add
Action, search by title and path, create under a chosen Outcome and verify the
URL through `owf get action {id}`. Edit the Action to another owner and check
the stored URL. Create a new owner through CLI while the board stays open,
then reopen or refresh the picker to find it. Make a selected owner invalid
before saving and check the error without losing the draft.

## Open questions for review

No blocking question. This increment chooses a searchable list of existing
eligible owners and keeps manual URL entry in the CLI.

## Implementation and review outcome

Pending implementation and review.
