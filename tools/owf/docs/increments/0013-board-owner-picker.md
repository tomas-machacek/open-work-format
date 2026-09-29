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

Implemented on 2026-09-29; independent code review identified one P2 finding,
addressed below. Status remains `in_progress` pending review of the correction;
this PR has not been merged or released.

### Delivered behavior

- Application discovery walks physical Markdown containment through a focused
  filesystem port, validates owner metadata/lifecycle in the domain, and returns
  stable title/URL ordering with Workspace first. Workspace metadata discovery
  is shared with existing operations without reading the Operational Store.
- `GET /api/owners` returns typed choices with `Cache-Control: no-store` or a
  distinct `OWNER_DISCOVERY_FAILED` response. Ordinary/non-owner directories and
  terminal/archived subtrees are omitted; unsafe links and damaged claimed
  metadata fail discovery. No partial successful list is returned.
- Both forms use `OwnerPicker`: separate search text and selected canonical URL,
  visible name/type/hierarchy, bounded inline results, keyboard navigation,
  selected-owner announcement, loading/error/no-match feedback, and Retry/Refresh.
  Reopening reloads choices. Create defaults to Workspace; edit retains an
  unavailable original owner and omits unchanged ownership from its PATCH.
- Existing create/set operations still validate a selected owner at save.
  Failed saves, discovery and retries retain the form draft and selection.
  CLI commands, store schema and Action identity semantics are unchanged.

### Original implementation verification evidence

Verified implementation revision: `fb4e21ff7f9b8587e7a370ac90c886d0c687f4d7`.
The following evidence/documentation commit changes no implementation or tests.

`npm run verify` passed on Windows (`win32`), Node.js **24.21.0**, on 2026-09-29:

| Check                                                                 | Result                          |
| --------------------------------------------------------------------- | ------------------------------- |
| TypeScript, ESLint, Prettier, dependency boundaries, production build | Passed                          |
| Unit and component tests                                              | 90 passed                       |
| Integration tests                                                     | 137 passed                      |
| Acceptance                                                            | 24 scenarios / 123 steps passed |
| CLI E2E                                                               | 21 passed                       |
| Chromium Playwright                                                   | 4 passed                        |

[Discovery/HTTP integration tests](../../tests/integration/owners.test.ts)
cover nesting, duplicate titles, encoded canonical URLs, parked/terminal/archived
contexts, ordinary directories, invalid metadata, injected read/enumeration
failures, physical Windows junctions, linked README rejection, traversal,
read-only snapshots without an available store, HTTP errors and atomic stale-owner
rejection. Unchanged missing ownership remains editable through HTTP.
[Shared-picker form tests](../../src/web/OwnerPicker.test.tsx) cover both forms,
search without selection, keyboard selection/Escape, unavailable ownership,
preserved fields/selection through loading/error/retry, failed saves and later
openings. Existing board/client tests cover the changed integration points.

The existing create browser journey now uses the picker. The existing edit/drag
journey checks native dialog Escape and selection before editing and subsequent
card drag: jsdom's mocked dialog and drag context cannot establish these native
interactions. No new Playwright journey was added.

A separate local Chromium inspection exercised both forms at **1440 x 1000**
and **390 x 1000**, including emulated touch selection, keyboard selection,
Escape, persisted owner change, refresh after creating a new context, and
stale-owner rejection with the draft retained. All passed; inspected screenshots
show wrapping labels, bounded inline results and no horizontal overflow.
Local screenshots and the inspection script are in the ignored
`tools/owf/.test-artifacts/0013-*` files.

### Limitations and review

- Tests requiring subprocesses ran outside the sandbox after Vite was denied
  process creation (`EPERM`). The final full verification passed.
- Validation was performed on Windows with Chromium. Linux, other browsers,
  physical touch hardware and screen-reader testing were not performed.
  Read-permission failures are injected through ports; junction rejection uses
  the actual Windows filesystem.
- Markdown is not a transactional filesystem snapshot; save-time validation
  remains authoritative, as designed. No scope deviation or known unresolved
  implementation failure was identified during implementation. The independent
  review and subsequent correction are recorded below.

### Independent review correction

Independent review of `5548f02` against `main` found that damaged YAML in a
clearly declared non-owner README (for example `OWF Knowledge` with `title: [`)
failed the entire owner list. This contradicted the agreed requirement to ignore
non-owner Markdown. No other substantive issue was identified in that review.

Correction revision: `aa762741bb03befdd8e3b16f4ec65886b833c7ae`.
The Markdown adapter now recognizes a single untagged scalar non-owner type
before validating the rest of its metadata. Claimed Project/Outcome documents
still undergo full validation; damaged YAML with duplicate, tagged or missing
type declarations still fails discovery rather than returning a partial list.

A new integration regression failed before the correction and passed afterward,
retaining Workspace, Project and Outcome choices alongside damaged non-owner
Markdown. Three additional rejection cases protect ambiguous/damaged type
declarations. No Playwright tests were added or changed.

`npm run verify` passed for the correction on Windows (`win32`), Node.js
**24.21.0**, Chromium, on 2026-09-29: typecheck, lint, formatting, architecture,
production build, 90 unit/component tests, 141 integration tests, 24 acceptance
scenarios / 123 steps, 21 CLI E2E tests and 4 Playwright journeys. The subsequent
documentation commit changes no implementation or tests. The focused regression
run required execution outside the sandbox after Vite reported `spawn EPERM`.
The full verification also ran outside the sandbox. The original platform and
manual-inspection limitations still apply; no new manual visual inspection was
performed for this adapter correction.

To try: create two Projects with identically named Outcomes, open Add Action,
search by title or hierarchy and choose a result. Edit the saved Action and
select another owner. Refresh owners after creating another context through CLI;
then make a selected context terminal before Save and confirm the error retains
the draft. Check the canonical reference with `owf get action <id> --json`.
