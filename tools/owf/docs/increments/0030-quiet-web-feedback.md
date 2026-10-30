# 0030 — Quiet web operation feedback

> Status: reviewed
> Description: Remove visible success confirmations and show operation failures as temporary, dismissible notifications without shifting board layout.
> Depends on: [0028 — Create and delete Actions in web Views](0028-web-action-create-delete.md).

Scope and direction agreed on 2026-10-30. The user reviewed and approved this
document for implementation on 2026-10-30. Implementation and independent code
review have not started. Increment 0029 is completed and merged into main;
it is not a functional prerequisite for this frontend increment.

## Goal and scope

Moving an Action currently adds “Move succeeded.” above a View. Editing it can
leave another “saved successfully” message alongside it. These messages persist,
accumulate and push the board downward.

Remove visible success confirmations for Action operations in Default Kanban
and Views. Show operation failures temporarily in a floating notification,
outside normal document flow. Preserve field validation and the information
needed to understand ongoing unsafe or stale conditions.

References: [architecture](../architecture.md),
[development guidelines](../development-guidelines.md),
[web View movement](0025-web-view-moves.md),
[web layout](0026-web-layout-cleanup.md) and
[web Action creation/deletion](0028-web-action-create-delete.md).

This is a frontend behavior increment. It changes no domain rules, HTTP
contracts, CLI output, storage, migrations or View placement/order semantics.
It introduces no notification history, success toast, user notification settings,
new dependency or release. Deletion confirmation and unsaved-draft confirmation
remain part of the existing interaction.

## Proposed solution

### Silent successful operations

Apply one policy to both board modes and their shared Action forms:

- Create, edit, state change, View column movement, within-column reorder and
  permanent deletion produce no visible success message, banner or toast.
- Remove mixed success messages such as “saved successfully but the Action does
  not match current filters.” Let current cards, filter context and empty states
  reflect the resulting selection.
- Preserve confirmed snapshots, membership reconciliation, refreshes, focus
  restoration, form closing and pending-write guards. Removing a notice must not
  remove the state or callbacks that perform this work.
- Preserve functional loading/busy indicators, filters, empty states and
  screen-reader drag/drop announcements. These explain current UI state or
  provide interaction accessibility rather than visible success confirmations.

### Temporary operation errors

Use a small shared frontend notification mechanism for failed Action mutations
and failed load/refresh requests. Include failures in the shared editor and
creation form, Default Kanban moves, View moves/reorders and View inventory.

- Render notifications in a fixed floating region near the top-right of the
  active surface, with ordinary viewport gutters. On narrow windows, constrain
  their width to the viewport and wrap text.
- A notification does not occupy board layout space, move columns/cards or
  scroll the page/editor. Only its own region intercepts pointer events.
- Show one notification at a time. A new error replaces the previous error and
  starts a fresh eight-second lifetime, including when its text is identical.
  There is no accumulated stack or delayed queue.
- Provide a keyboard-accessible close control with an accessible name.
  Dismiss automatically after eight seconds. Pause expiry while hovered or
  while keyboard focus is within the notification; resume the remaining time
  after both leave.
- Use an appropriate alert/live-region announcement. Do not steal focus when an
  error appears or expires. Manual dismissal must not strand keyboard focus.
- Errors from a modal operation must be visible and accessible within the active
  modal surface; they must not appear behind a native dialog or in its inert
  background. Preserve form drafts and existing failure recovery controls.
- Clear an old notification when beginning a new explicit attempt or changing
  board/View context. Cancel its timer when replaced, dismissed or unmounted.
  An old timer must never dismiss a newer error. Ignore superseded asynchronous
  results so an inactive board/View cannot publish an unrelated error.
- Re-rendering or receiving the same retained error state does not restart the
  timer. A distinct failed attempt can show that error again. Background refresh
  must not turn the same unresolved failure into a continuously renewed toast.

Avoid duplicating one failure in a board banner, card error, form-level operation
error and notification. Keep useful operation/Action context in the notification,
without introducing visible IDs.

### Validation and persistent recovery state

Separate a transient error event from facts that remain true after it expires:

| Situation | Required presentation |
| --- | --- |
| Invalid form input, such as blank title or manual blocking reason | Keep validation next to the relevant form/input until corrected or the form is closed; do not auto-dismiss it. |
| Rejected or failed mutation | Temporary error notification; preserve draft, confirmed data and existing retry/recovery rules. |
| Confirmed mutation followed by failed refresh | Temporary refresh-error notification explaining that the write completed and must not be repeated merely because refresh failed. |
| Uncertain mutation result | Temporary error notification explaining uncertainty; preserve reconciliation and guards against unsafe repetition. |
| Unavailable or stale board/View/inventory | Temporary detailed error notification plus compact persistent availability/freshness state and existing Retry/Refresh control until recovery. |

Persistent state indicators explain the current condition; they do not retain a
full operation-error banner. Reuse the existing refresh/status area and editor
recovery controls where practical, without growing the board on each error.

Expiry/dismissal changes presentation only. It does not mark data current,
unblock writes, discard a draft, retry a request or imply that an uncertain write
failed. A confirmed write followed by a read failure must not be reported as a
failed write. Keep existing conflict, missing Action, incoming-dependency,
stale-data and uncertain-deletion behavior.

### Affected implementation

Inspect the existing notices and error paths in
`src/web/Board.tsx`, `ViewBoard.tsx`, `Workspace.tsx`,
`ActionEditor.tsx`, `ActionForm.tsx`, `useBoard.ts`,
`useView.ts` and related cards/styles. Share the notification behavior instead
of duplicating timers across these paths. Keep it within frontend boundaries.

Update the relevant web user documentation for the new feedback policy.
Earlier completed increment documents remain historical records; this increment
supersedes their visible success/error-feedback requirements only.

## Acceptance criteria

AC1: Successful create, edit, delete and movement operations in Default Kanban
and Views show no visible success confirmation. View reorder is also silent.
Performing a move followed by an edit leaves neither of the original messages
and creates no accumulated operation-feedback rows.

AC2: A failed mutation produces a contextual error notification on the active
surface, including when an Action editor or creation form is open. The same
failure is not duplicated in card, form-level and board operation notices.
Field validation remains readable until corrected.

AC3: Without hover/focus interaction, a notification disappears after eight
seconds. Manual close dismisses it earlier. Hover/focus pauses expiry, and
leaving resumes its remaining lifetime. A later error, even with identical text,
gets a fresh lifetime; an earlier timer cannot clear it.

AC4: Notifications appearing, replacing and disappearing do not change board
geometry or page/editor scroll position. At wide and narrow viewport sizes
their text and close control are usable. Modal notifications are visible above
the modal content and reachable by keyboard within the active modal.

AC5: Expiry, replacement and navigation do not steal focus, create stale
notifications in another View or leave active timers after unmount.
Screen-reader error announcements and existing keyboard drag/drop feedback
remain available.

AC6: After an error expires, unresolved stale/unavailable/uncertain conditions
remain represented by compact state/recovery controls and existing write
restrictions. A confirmed write followed by refresh failure is clearly
distinguished from a failed write; dismissing its notice never repeats the write
or clears its safety guards.

AC7: Successful operations retain their existing effects on persisted Actions,
View membership/order, filters, confirmed snapshots and focus. Failed operations
preserve drafts and existing recovery semantics. No CLI, API or store behavior
changes.

## Verification plan

- Use focused component tests with controlled timers for error lifetime,
  identical repeated errors, replacement, manual dismissal, pause/resume,
  cleanup, navigation and superseded responses (AC2–AC3, AC5).
- Adapt existing board/View/editor/form tests that expect success notices.
  Assert resulting cards, form state and confirmed mutation behavior instead.
  Cover move followed by edit, creation, deletion and View reorder (AC1, AC7).
- Reuse and adapt existing failure coverage for confirmed writes followed by
  failed reads, uncertainty, stale/conflicting data and preserved drafts.
  Check that expiry changes only notification visibility and that repeated
  renders/background reads do not continually renew one error (AC6–AC7).
- Use a small number of browser journeys for actual geometry, modal layering,
  keyboard dismissal/focus and inline validation. Compare board position and
  scroll before, during and after an error at representative wide and narrow
  sizes, for example 1920 × 1080 and 390 × 844 (AC2, AC4–AC5).
- Visually inspect both modes and an open editor; retain representative visual
  evidence. Use controlled failures rather than requiring the user to corrupt a
  Workspace.
- Run the applicable focused checks during implementation and `npm run verify`
  before code handoff. Record actual commands, revision and platform. No new
  domain acceptance scenarios are needed for a presentation-only change.

Human check: move and edit an Action consecutively in a View, create/delete an
Action in each board mode and confirm that no success messages appear. Trigger
a controlled failed request, observe the floating error, dismiss it or wait for
expiry, and verify that the board stays in place and unresolved recovery state
remains understandable.

## Open questions

None blocking. Eight seconds is the agreed conversation default; notification
positioning and remaining styling details are routine implementation choices
within the constraints above.

## Implementation and review outcome

Not implemented. Code checks, visual verification and independent review have
not run. This change currently defines the increment only.

## Decision changes and follow-up

This increment replaces persistent visible operation confirmations with silent
success and temporary errors. Field validation, loading state and persistent
recovery conditions retain their separate roles.
