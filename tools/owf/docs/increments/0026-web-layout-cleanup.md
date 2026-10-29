# 0026 — Web layout cleanup

> Status: in_progress
> Description: Keep Action editing controls visible, use the available View width and keep Default Kanban columns in one horizontal row.
> Depends on: [0025 — Move and reorder Actions in web Views](0025-web-view-moves.md).

Scope and direction agreed on 2026-10-29. The user reviewed and approved this
document for implementation on 2026-10-29. Implementation started on 2026-10-29;
independent code review remains pending.

## Goal and scope

Three layout problems interrupt everyday use: saving a long Action requires
scrolling to the bottom of its detail, a fixed maximum page width wastes screen
space in Views, and Default Kanban stacks its columns vertically in narrow windows.

Deliver always-visible Action edit controls in both board modes, full available
width for Views, and horizontal column scrolling for Default Kanban at every
window width.

References: [architecture](../architecture.md),
[development guidelines](../development-guidelines.md),
[Action editing](0012-board-action-edit.md),
[compact blocking detail](0019-compact-blocking-detail.md) and
[web View display](0022-web-view-display.md).

This is a presentation-only increment. It does not change Action state rules,
save/cancel semantics, View membership, placement, ordering, filters or drag-and-drop
rules. No CLI, HTTP contract, storage schema, migration, new dependency or release
is required. A broader visual redesign and new board features are deferred.

## Proposed solution

### Always-visible Action edit controls

Adapt the shared Action detail/editor used by Default Kanban and Views.

- Place the existing `Save changes` and `Cancel` controls in a persistent action
  bar within the dialog. They must be visible immediately after opening and
  remain visible while scrolling through a long Action.
- Bound the dialog to the available viewport height and scroll its content
  independently of the action bar. Keep the existing readable detail width;
  full-width board layout must not make the editor itself full-screen width.
- Give the bar its own layout space. It must not cover fields, the last content
  row, validation messages or focused controls.
- Retain readable labels, keyboard access and usable controls on narrow and
  short windows. Scrolling must allow every field to be reached.
- Preserve existing form submission, cancellation/discard, focus restoration,
  validation, pending-write disabling and stale/conflict/error handling.
  Always visible does not mean always enabled.
- Preserve owner/prerequisite pickers, identity disclosures and their Escape
  handling. The new scroll container must not clip these controls or make their
  results unreachable.

Use one shared editor behavior for both board modes; do not duplicate save logic
or introduce a second set of save/cancel controls.

### Views use available window width

Remove the fixed maximum-width constraint that limits the View board area,
including an ancestor constraint if that is the cause. Let the board use the
available viewport width, retaining small, consistent outer gutters.

Keep columns readable rather than shrinking them merely to fit every column.
When the columns exceed the available width, retain horizontal scrolling.
This requirement does not promise that every possible View fits without scrolling.

Resizing the window must immediately adjust the usable board width. Keep existing
column order, card density and movement affordances. Do not add a full-screen
toggle or configurable column widths. If a shared page container also makes
Default Kanban wider, that is compatible with this increment.

### Default Kanban keeps columns side by side

Use a single non-wrapping horizontal row for Default Kanban columns at all
supported viewport widths, including the existing narrow/mobile layout.
Remove the breakpoint behavior that stacks columns vertically.

Columns retain a usable width. When they do not fit, scroll the board horizontally
to reach every column, following the existing View behavior. Keep overflow in the
board region instead of forcing unrelated page controls off-screen.

Preserve column/state order, card interactions, creation and state movement.
The layout change must not interfere with native text selection, pointer/touch
scrolling, drag activation or existing keyboard movement.

## Acceptance criteria

AC1: Opening an Action with content taller than the available dialog in either
Default Kanban or a View shows both `Save changes` and `Cancel` without scrolling.
Both controls stay within the visible dialog at the top, middle and bottom of
content scrolling. Their bar does not overlap the content.

AC2: In wide, narrow and short windows, every editor field remains reachable,
labels and controls remain usable, and keyboard focus is not hidden behind the
action bar. Owner/prerequisite pickers and identity disclosures remain usable
within the visible dialog.

AC3: Save and Cancel retain their existing effects in both board modes.
Validation/save failure preserves the draft and feedback; pending writes and
stale data retain their existing control restrictions. Moving controls does not
bypass form validation, submit twice or change discard behavior.

AC4: On a wide screen, a View uses the available page width apart from ordinary
gutters, without the previous fixed maximum-width cap. Expanding the window
beyond that former cap increases usable board width. A View with enough columns
uses the additional space to expose more board content.

AC5: When View columns still exceed available width, horizontal scrolling reaches
the first and last columns without compressing cards into unreadable widths.
Window resizing preserves column order and access to all columns.

AC6: Default Kanban columns remain in one horizontal row on wide and narrow
windows. Horizontal scrolling reaches every overflowing column; no responsive
breakpoint stacks columns into subsequent rows.

AC7: Existing edit, creation, selection, scrolling and movement interactions remain
functional after resizing and horizontal scrolling. View placement/order and
Default Kanban state changes retain their existing semantics; layout changes
alone perform no writes.

## Verification plan

- Use a small set of browser checks for actual geometry and scrolling, covering
  both board modes and long Action detail. DOM-only component assertions cannot
  establish that controls are visible or columns stay in one row.
- Cover AC1–AC3 by opening a long Action, scrolling content and exercising Save
  and Cancel. Reuse existing validation/failure/pending-write coverage; adapt
  focused checks only where the new form structure changes the risk.
- Cover AC4–AC6 by comparing usable View width below and above the former cap,
  checking aligned column rows, and scrolling to the final column. Use a View
  with enough columns to overflow at the tested widths.
- Visually inspect representative wide (for example 1920 × 1080), narrow
  (390 × 844) and short (1280 × 600) viewports. These are verification examples,
  not new CSS breakpoints or exact-pixel design requirements.
- Check a lower editor field, an open picker and validation feedback near the
  bottom. Verify keyboard reachability and that the action bar does not obscure
  content. Record screenshots or equivalent visual evidence.
- Reuse the existing browser movement journeys for AC7. Check a move after
  horizontal scrolling and a touch scroll without unintended drag activation.
  Do not add a new domain/storage test matrix for CSS changes.
- Run `npm run verify` before implementation handoff and record the actual
  revision, platform and results. Update user-facing layout documentation only
  where its current description becomes inaccurate.

Human try-out: open a View with many columns and expand the browser; then narrow
it and scroll sideways. Switch to Default Kanban and confirm the same horizontal
column arrangement. In both modes open a long Action, scroll through its fields,
and save or cancel using the always-visible action bar.

## Open questions

No blocking scope questions remain. Exact CSS structure and ordinary spacing are
implementation choices within the behavior described above.

## Implementation and review outcome

Implemented on 2026-10-29. Status remains **in_progress** pending independent
code review; this implementation session does not claim that review, completion,
merge or a release.

Delivered behavior:

- The shared Action editor uses one form with a bounded, independently scrolling
  content area and one persistent Save changes/Cancel bar. The bar reserves its
  own space; it does not cover lower fields, metadata or feedback. Validation
  and save errors scroll into view. Existing save, discard, pending, stale and
  conflict logic is retained in both board modes.
- The shared page has no 1800px maximum width. Views and Default Kanban use the
  available width with the existing outer gutters; editor width remains bounded
  at 640px.
- Default Kanban uses a single horizontal grid row, with readable minimum column
  widths and board-local horizontal overflow at all widths. Its former three-
  and one-column wrapping breakpoints are removed. State order, filters, creation
  and movement behavior are retained.
- README describes the delivered scrolling and layout. No dependency, domain,
  CLI, HTTP, schema or storage changes were made. No scope deviations.

Verification evidence:

- [Layout browser journeys](../../tests/e2e/layout.spec.ts) exercise the real
  production frontend and server with isolated SQLite Workspaces in Chromium at
  **1920 × 1080**, **390 × 844** and **1280 × 600**. Both modes use a Waiting
  Action with a long description and ten prerequisites; the View has eight
  columns, enough to overflow even the wide viewport.
- Geometry checks cover buttons at the top/middle/bottom of content scrolling,
  independent content/bar bounds, bounded editor width, keyboard access to the
  lower Waiting field, owner results, prerequisite identity and Escape, visible
  validation feedback, save and dirty Cancel/discard with focus restoration.
- Board checks cover aligned, readable columns, last-column access without page
  overflow, retained column order and View growth from 1600px to 1920px beyond
  the former cap. Inspection/resizing/pickers/cancellation issue no writes;
  each Save issues one write. Both boards also exercise keyboard movement from
  their final column after horizontal scrolling.
- Reused the existing validation/failure/pending/stale editor coverage and browser
  creation/movement/native-selection/touch journeys. The Default mobile movement
  journey now scrolls to the card and exposes the boundary between its source and
  destination before dispatching on-screen touch coordinates; its former
  stacked-column geometry no longer applies.
- Visually inspected Chromium screenshots from all three viewport sizes,
  including both boards, long detail, the lower field, owner results,
  prerequisite identity and validation. Labels and feedback remain readable;
  content and focus stay above the action bar. The three new layout journeys
  and adjusted Default movement journey passed together (4 browser tests).
- A separate Chromium touch check at 390 × 844 scrolled Default Kanban by 357px
  with no drag activation, opened detail or write. Browser version:
  **153.0.8010.12**. Its screenshot and script are retained locally under
  `tools/owf/.test-artifacts/increment-0026/`.

Full verification results, verified revision and final visual evidence are
recorded below after the required checks finish.

Platform: Microsoft Windows NT **10.0.26300.0**, Node **24.21.0**, npm **11.4.1**,
Playwright **1.63.0**, Chromium. Vite/test/browser subprocesses required execution
outside the filesystem sandbox after `spawn EPERM` on the sandboxed focused
test run. No checks were disabled.

Limitations: Windows/Chromium only; Linux, macOS, Firefox and WebKit were not
tested. Touch testing uses Chromium emulation; a physical phone and its virtual
keyboard were not exercised. Independent review remains outstanding.

## Decision changes and follow-up

None.
