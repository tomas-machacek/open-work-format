# 0022 — Display Views in the web interface

> Status: in_progress
> Description: Select an existing View in the web interface, display its evaluated columns and Actions, and return to the default Kanban at any time.
> Depends on: [0021 — Read-only View evaluation through CLI](0021-view-evaluation-cli.md), [0020 — View instance CLI foundation](0020-view-instance-cli-foundation.md), and the existing board/detail capabilities through [0019](0019-compact-blocking-detail.md).

## Goal and scope

The web interface currently exposes a fixed five-state Kanban. Add a persistent
top-bar selector containing the default Kanban and existing View instances.
Selecting an instance renders its current evaluated columns while clearly
identifying the selected View. Reuse the current compact cards and expanded
Action detail, including existing detail editing.

This increment is a passive View presentation. Its only work-data mutation is
the existing Action edit operation through detail, including the existing manual
block and prerequisite controls. Do not add View-specific mutations.

Authority: [Views profile](../../../../docs/design/views-profile-notes.md),
[Core](../../../../spec/core-v0.md), [architecture](../architecture.md), and
[development guidelines](../development-guidelines.md). This increment exposes
0021's implemented evaluation through HTTP and the browser; it does not implement
the profile's future placement, movement or ordering capabilities.

Included:

- Inventory and selection of stored View instances, with a permanent default
  Kanban option.
- Rendering of evaluated columns, empty states, existing card information and
  the existing Action detail/editor.
- Clear View identity, current/stale/loading/error feedback, and refresh.
- Preservation of the default Kanban's existing functionality.

Deferred:

- Drag and drop, moves between View columns, manual ordering within columns,
  persisted placements/ranks, and creation directly in a View column.
- View creation/editing/deletion in the web interface and definition authoring.
- Additional search/owner filters over View content. Existing default Kanban
  filters remain available; they do not narrow View evaluation.
- Windows, Snapshots, additional renderers, polling and push synchronization.
- Action archiving and all archive-specific display/filter/dependency behavior.
  Archiving is not implemented; it was explicitly deferred in 0021 and is not an
  implementation or test prerequisite here.

Moves and manual ordering must be designed and implemented through CLI in a
later increment before adding their web interactions.

## Proposed solution

### Dependency and branch boundary

Increment 0021 is completed and merged into main through
[PR #27](https://github.com/tomas-machacek/open-work-format/pull/27).
This branch has been rebased onto that implementation. Reuse its application
evaluation and agreed schema 6 limitations; do not copy its implementation or
maintain a competing evaluator. Archival remains deferred, and existing
invalid-data rejection must not be weakened by the web adapter.

### Permanent navigation and identity

Use a labeled selector in the top bar, outside the board's horizontal scrolling
area. The bar stays available while scrolling the board, including on narrow
screens. A native accessible select is sufficient; no new navigation framework
is required.

The first option is **Default Kanban**. Remaining options are existing stored
View instances, using the same inventory and deterministic order as CLI
`list views`. List instances, not definition files. Resolve selection by stable
instance ID, never title or list position. Distinguish duplicate titles with a
secondary ID label; normal cards do not gain visible technical IDs.

On initial page load show Default Kanban. Keep the current selection during
manual refresh and tab-return refresh. Selection persistence across full reloads,
deep links and browser history are outside this increment; a reload returns to
Default Kanban.

For the default board, identify the mode as Default Kanban. For a selected View,
show its instance title prominently and an explicit **View** label in the page
heading/top area. Do not rely on color or the selector alone to convey the mode.
The instance title is authoritative, not the shared definition title. Expose
the instance ID and definition reference in unobtrusive metadata if needed.

The selector remains usable with no Views, during View loading, and after a
View/list error. Failure to list Views must not prevent use of Default Kanban.
An empty inventory is a successful state with only the default option; a failed
inventory is an error with retry, not a claim that no Views exist.

Changing mode closes the current Action detail. If it contains unsaved changes,
use the existing dirty-edit protection, or a minimal discard confirmation if none
exists; cancelling keeps both the selection and the draft. Do not switch during
an in-flight save. Pending edits must never be silently discarded.

### Evaluated board

Use the shared 0021 application evaluator. Render every configured column in
definition order with its title and member count, including empty columns.
Preserve evaluator-provided member order (ascending Action ID in 0021).
Do not sort by title, date or state in the browser.

An Action appears at most once according to the evaluator. Do not independently
route cards in React, turn each supported state into a separate column, or append
an Other column. Ineligible Actions remain outside the selected View. A valid
zero-column definition and a View with no eligible Actions are successful empty
states; explain them without offering creation in a View column.

Same-definition instances can have different identities/titles but the same
content until persisted placements are introduced. With the
[shipped example](../examples/work-board.md), unblocked Open Actions route to
New to organize while Todo remains empty. Its other columns are Active
(In Progress and Waiting), Blocked and Done; Sprint backlog and Backlog appear
only in the broader design example. Explain this current limitation in user
documentation.

Cards reuse the current compact presentation: title, owner, waiting reason when
applicable, and blocking summary. Because a View column can represent multiple
states or the special Blocked grouping, additionally show the Action's actual
execution state compactly on View cards. Column labels must not substitute for
the actual state. No prominent Action IDs or expanded blocking lists are added.

View cards open the same expanded Action detail by click or keyboard. Show the
same available content, owner information, actual state, waiting reason,
description, timestamps and compact blocking/prerequisite information as the
existing detail. Reuse existing navigation and on-demand prerequisite behavior.

In View mode, cards are not draggable, columns are not drop targets, and there
are no reorder or Add Action controls. Remove misleading drag cursor,
instructions and keyboard drag bindings in this mode. Do not apply a column's
`default_status` on selection, rendering, opening detail or saving an Action.

### Detail editing and reconciliation

Reuse existing Action edit contracts, validation, conflict handling, owner
selection and block/dependency operations. State remains non-editable in detail,
as in the current board. No View ID, column ID or rank is added to an Action edit
request to imply placement. Saving edits the shared Action, not a View-local copy.

After a successful save, re-evaluate the currently selected View. A changed
block or prerequisite can move an Action to another evaluated column or outside
the View. Display the refreshed membership and order; never pin the saved card
to its old column or insert it speculatively into a guessed destination.

Retain existing success feedback and dirty/conflict safeguards. If an Action
leaves the View, report that the save succeeded and it is no longer in the
selected View. If the save succeeds but re-evaluation fails, say that the save
succeeded and displayed membership could not be refreshed; do not report save
failure or invite repeating the mutation. Any retained content is visibly stale.

Default Kanban retains existing creation, drag/state changes, search/owner
filters and detail editing. Keep its filter state separate from View mode:
switching to a View ignores those filters, returning restores the board's
current in-page filter state. Do not implement a second View filter system.

### Reads, refresh and errors

Expose narrow read-only HTTP operations for instance inventory and evaluated
View content. Follow existing contracts, response validation, error envelopes
and Workspace binding. Exact endpoint/DTO names are implementation choices.

The delivered 0021 application operation is `showView`, returning
`ShowViewResult` with ordered columns whose members contain only
`id`, `title`, `state` and `blocked`. That result alone does not contain the
owner, description, timestamps or full blocking/prerequisite data needed by the
existing editor.

Provide the full existing card/detail projection without per-card browser
requests. Extend or factor shared application orchestration narrowly so the
existing `evaluateView` and the HTTP card projection use the same Action facts
from one coherent repository read. Do not call `showView` and independently
re-read Actions to join potentially different snapshots. Preserve the existing
CLI output contract. Reuse established Action projection and blocking facts;
do not parse CLI text, spawn the CLI from HTTP or duplicate domain rules in
adapters.

Read current instance definitions and Action facts on selection, manual refresh,
and the existing coalesced focus/visibility refresh. Refresh the inventory as
well so instances created through CLI become selectable without restarting the
server. Avoid flicker on successful same-selection refresh.

On selection changes, do not display the previous board under the new View's
heading. Show a loading state for the selected identity until its result arrives.
Ignore superseded responses and errors when quickly switching A → B → Default.
A late read must never replace the current selection's content or error state.

An invalid/missing definition, unknown instance or evaluation failure is an
explicit error, not an empty board. Inventory should remain usable even when an
individual definition is broken, as with CLI list. A disappeared selected
instance is reported explicitly; the default option remains available.
Do not silently fall back and imply that default cards belong to that View.

A failed refresh may retain the last successful result only for the same
instance, clearly marked stale. First-load failure shows no fabricated board.
Disable saving from stale View data until a successful refresh, consistent with
existing conflict safeguards. Browsing retained detail and returning to Default
remain possible. Validate the entire evaluation before returning success.

Inventory, evaluation, navigation, opening detail and refresh must not change
Actions, instance metadata, timestamps, definitions, schema or event logs.
Only an explicit successful existing detail edit may write. No schema migration,
stored selection, placements, ranks, initialization or repair-on-read is added.

### Architecture and documentation

Keep HTTP transport in interfaces, orchestration in application, evaluation in
the existing domain/application boundaries, and browser code dependent on
contracts only. Extract shared card/detail rendering where useful; do not fork
a second editor or undertake a general board rewrite.

Update the tool README and architecture's delivered-capability summary during
implementation. Describe the web interface as containing Default Kanban and
Views while keeping the existing server command and URL usable. Do not rename
CLI commands merely to reflect this terminology change.

Document selection, return to Default, editing shared Actions, refresh behavior,
passive View limitations and the dependency on CLI-created instances.
No new fundamental CLI command or generated Workspace guide change is required.

## Acceptance criteria

- **AC1 — Selection and return:** On initial load Default Kanban is displayed.
  The permanently accessible top selector lists stored instances and always
  offers Default Kanban, including during loading, empty inventory and errors.
  Duplicate titles remain distinguishable and selection uses instance IDs.
- **AC2 — Identity and rendering:** Selecting a View visibly identifies its
  instance title and View mode, with all evaluated columns in definition order,
  exact memberships, member order and counts. Empty and zero-column results
  succeed; valid Actions with states omitted by the definition are outside the
  View. Malformed stored Actions fail evaluation rather than being hidden.
- **AC3 — Information parity:** Cards and expanded detail preserve the existing
  information and compact layout. View cards show actual execution state,
  including multi-state and Blocked columns. Detail opens by pointer and keyboard.
- **AC4 — Passive scope:** View mode has no creation, dragging, drop targets,
  manual ordering or state changes from column defaults. Inspection and
  navigation cause no semantic writes. The only mutation is existing detail edit.
- **AC5 — Existing detail edit:** Saving uses existing Action behavior and
  re-evaluates View membership. Test movement caused by editing a block and an
  Action leaving the View. Successful save followed by read failure is reported
  as a successful save with refresh failure. Dirty edits are protected on switching.
- **AC6 — Freshness and failure:** Refresh/tab return reflects current Actions,
  definitions and instance inventory. Broken definitions and unavailable data
  produce actionable errors, with stale content labeled appropriately. Rapid
  switches cannot show stale responses under another selection's identity.
- **AC7 — Default compatibility:** Returning to Default restores the existing
  board with creation, dragging/state changes, filters and detail editing.
  Default filters never narrow a View. A broken View cannot prevent default use.
- **AC8 — Shared rules and documentation:** HTTP uses 0021's evaluator with
  existing card/detail facts, no duplicated routing or schema change. README
  accurately explains the implemented capability and deferred CLI-first moves
  and manual ordering. No archive-specific behavior is introduced.

## Verification plan

| Risk / criteria                               | Verification                                                                                                                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP/evaluator consistency (AC2, AC8)         | Real application/HTTP integration comparing evaluated column/member IDs and order with the shared 0021 result, plus complete card facts. Reuse 0021's domain matrix rather than duplicate it. |
| Errors and purity (AC1, AC4, AC6)             | Integration for list with broken definition, failed evaluation and semantic before/after comparisons of store/events/Markdown for reads.                                                      |
| UI identity and races (AC1, AC2, AC6)         | Focused component tests for rapid switches, superseded errors, same-View stale refresh, duplicate titles, empty inventory and zero columns.                                                   |
| Edits and membership (AC5)                    | Existing editor integration plus targeted tests of block-driven rerouting/exclusion, dirty-switch cancellation, and confirmed save followed by failed refresh.                                |
| Main browser journey (AC1–AC7)                | Small Playwright journey: default → View → inspect/edit Action → refresh → another View → default; check default operations still work and View movement/creation controls are absent.        |
| Visual/accessibility behavior (AC1, AC3, AC4) | Inspect wide/narrow layouts and scrolling, long titles, compact cards, multi-state/Blocked state labels, keyboard selector/detail access and focus restoration.                               |

Run the required `npm run verify` before implementation handoff. Record actual
platform, revision, commands and results. Do not add tests of unimplemented
archiving or speculative placement semantics.

Human try-out:

1. Use CLI to create two View instances and Actions, including a blocked Action.
2. Start the existing web server and confirm the initial Default Kanban.
3. Choose a View and compare its columns/members to `owf show view VIEW_ID`.
4. Open a card, edit its manual block, save and observe re-evaluated membership.
5. Edit the definition through the existing Markdown workflow and refresh.
6. Temporarily break the definition, verify the explicit error and return to
   Default Kanban; restore the definition and retry.
7. Verify the selector stays reachable while scrolling and the default board
   retains its existing operations.

## Open questions

No blocking product questions remain. Endpoint names, DTO composition and
narrow component extraction are implementation choices within the contract.
The user reviewed and approved this document for implementation on 2026-10-23.

## Implementation and review outcome

Implemented on 2026-10-23 and independently reviewed at revision `9a5a852`.
The review found an active Default Kanban drag surviving a switch to View and
modal navigation bypassing the creation/pending-operation guard. The follow-up
fixes below address both findings. The document and index remain **in_progress**
at the user's request. PR #28 must not be merged or the increment marked completed
as part of this handoff.

Delivered:

- `/api/views` inventories instances independently of definitions;
  `/api/views/:id` returns ordered evaluated columns with complete existing
  Action projections. `displayView` and CLI `showView` share one evaluation
  read; the CLI contract, routing rules, schema and event behavior are unchanged.
- The sticky Display selector starts in Default Kanban, distinguishes duplicate
  instance titles by ID, and remains available through loading and errors.
  View headings use instance titles. All columns and their counts are displayed,
  including successful empty/zero-column results; cards show actual state.
- View cards reuse compact content and the existing Action editor without
  dragging, drop targets, creation or reordering. The modal includes the same
  selector so navigation remains accessible while editing. Existing discard
  protection governs switching; in-flight saves prevent it. An open default
  creation form must be finished or cancelled before mode switching.
- Successful edits re-evaluate membership, report departure, and distinguish
  confirmed saves from failed subsequent reads. Failed same-instance refreshes
  retain visibly stale content with saving disabled. Superseded responses are
  ignored. Manual/tab-return refreshes also discover new CLI-created instances.
- Default Kanban preserves in-page filters and existing editing/creation/state
  operations. Browser testing exposed a keyboard pickup issue with unequal
  column heights; collision selection now uses the card centre's containing
  column before the nearest-centre fallback. The wide/narrow browser journeys
  retain this regression case.
- README and architecture describe the delivered behavior, current example
  routing and deferred CLI-first movement/manual ordering.

Verification evidence:

- [HTTP integration](../../tests/integration/view-http.test.ts): shared-evaluator
  order and full detail parity, one Action repository read, semantic store/event/
  Markdown preservation, broken/missing definitions, unknown instances, malformed
  excluded Actions, block-driven movement/exclusion and zero columns.
- [Component tests](../../src/web/Workspace.test.tsx): selection identity,
  duplicate titles, empty/error inventory, first-load errors, stale read-only
  detail, rapid switching, queued tab-return refresh, inventory changes,
  disappeared instances, dirty navigation in both modes, in-flight saves and
  confirmed-save/read-failure feedback.
- [Browser journeys](../../tests/e2e/views.spec.ts): real CLI-created instances
  and Actions, exact HTTP/member order, detail via keyboard, block editing,
  focus restoration after rerouting, definition refresh, broken definitions,
  scrolling, default filter restoration, creation and keyboard state movement,
  and full-reload reset. Screenshots were inspected at 1440 × 900 and 390 × 900;
  the mobile long-title layout was adjusted after inspection.

Initial implementation verification on 2026-10-23: **`npm run verify` passed**. This includes
TypeScript checking, ESLint, Prettier, dependency-cruiser (58 modules; no
violations), production build, **159 unit/component tests**, **214 integration
tests**, **32 acceptance scenarios / 181 steps**, **25 CLI E2E tests**, and
**9 Playwright browser tests**. `git diff --check` also passed.

Platform: Microsoft Windows NT 10.0.26300.0, Node **24.21.0**, npm **11.4.1**,
Playwright **1.63.0** with Chromium. Vite/test subprocesses required execution
outside the filesystem sandbox after sandboxed runs returned `spawn EPERM`.
Earlier development runs exposed and resolved the mobile heading layout,
post-rerouting focus restoration, keyboard column collision, formatting, and an
existing owner-picker test whose option query needed scoping to its listbox now
that the editor also contains a View selector. No checks were disabled.

Initial verified implementation revision: `832cc751c7a064ba659d224cdfcca14fb5527be2`.
The following verification-record commit changes documentation only; runtime,
tests, dependencies and configuration are identical to the verified revision.
Board/detail screenshots from both viewport sizes are retained locally under
`tools/owf/.test-artifacts/increment-0022/` and are regenerated by the browser
journeys under `tools/owf/test-results/`.

Limitations: verification is on Windows and Chromium only; Linux/macOS and
Firefox/WebKit were not exercised. Selection persistence, polling/push,
View-authoring UI, placements, moves, ranks, manual ordering, Windows, Snapshots
and archiving remain outside this increment. Markdown and SQLite do not form a
cross-representation transaction.

Independent review follow-up on 2026-10-23:

- Mode selection is disabled during an active Default Kanban drag until it is
  dropped or cancelled. Inactive Default boards have no drag sensors and reject
  state-change submissions. Header and modal selectors share the same restrictions
  for open creation forms and pending moves; the navigation callback also rejects
  disabled requests.
- A component regression protects creation drafts against modal navigation.
  Both browser viewport journeys hold a real creation request pending while
  opening another Action's detail, then verify navigation becomes available only
  after confirmation and the View includes the created Action. They also cover
  drag cancellation before switching, normal space entry in View detail, absence
  of inspection/navigation writes and preservation of the original Action state.

Review-fix verification: **`npm run verify` passed** on
`99b168e592abfe379f0e3dea874ebbaace34bc13` on 2026-10-23. This includes types,
lint, formatting, architecture (58 modules; no violations), build, **160
unit/component tests**, **214 integration tests**, **32 acceptance scenarios /
181 steps**, **25 CLI E2E tests** and **9 Playwright browser tests**.
`git diff --check` passed. Focused Workspace tests and both View browser journeys
also passed; the new modal-navigation regression failed against the pre-fix
implementation. During development the browser fixture was corrected to restore
its intentionally broken definition before re-entering a View. No checks or
acceptance expectations were weakened.

The verification platform and browser are the Windows/Node/npm/Chromium versions
recorded above. Browser/Vite subprocesses again required execution outside the
filesystem sandbox after `spawn EPERM`. This following evidence update changes
documentation only; runtime, tests, dependencies and configuration remain identical
to the verified review-fix revision. Both review findings are addressed; the
increment remains **in_progress** and PR #28 remains draft and unmerged.

## Decision changes and follow-up

- 2026-10-22: User requested web View selection with a permanent return to the
  current default Kanban, matching card/detail information and clear View identity.
- 2026-10-22: User explicitly limited View mode to passive display plus reuse of
  existing Action detail editing. Moves and manual card ordering are deferred
  to a subsequent increment, CLI first.
- 2026-10-22: Archive-related scope is excluded because Action archiving is not
  implemented and was explicitly deferred in 0021.
- 2026-10-22: Rebased onto completed 0021. Aligned the shipped example,
  documented the minimal evaluation DTO and required shared-read enrichment for
  web detail, and distinguished omitted states from malformed stored data.

- 2026-10-23: User reviewed and approved the proposal for implementation;
  document and index status changed to reviewed. Implementation and code review
  remain pending.
- 2026-10-23: Implemented the approved scope; document and index changed to
  in_progress. Independent review and completion remain a separate follow-up.
