# 0028 — Create and delete Actions in web Views

> Status: in_progress
> Description: Create Actions in a chosen View column and permanently delete Actions from Views or Default Kanban through the shared web interface.
> Depends on: [0008 — Create Actions on the board](0008-board-action-create.md), [0024 — Persist and change View column order through CLI](0024-view-order-cli.md), [0025 — Move and reorder Actions in web Views](0025-web-view-moves.md), [0026 — Web layout cleanup](0026-web-layout-cleanup.md) and [0027 — Delete Actions and View instances through CLI](0027-delete-action-view-cli.md).

Scope and UI decisions agreed on 2026-10-29. The user reviewed and approved
this document for implementation on 2026-10-29. Implementation is in progress.

## Goal and scope

Allow the user to create an Action directly in the intended column of an existing
View, and delete an unwanted Action through its detail in either a View or
Default Kanban. Reuse the existing creation form, owner picker, Action detail
and deletion application operation.

References: [architecture](../architecture.md),
[development guidelines](../development-guidelines.md),
[Views profile](../../../../docs/design/views-profile-notes.md#5-fixed-movement-and-creation-rules),
[Core Views](../../../../spec/core-v0.md#12-views) and
[CLI deletion contract](0027-delete-action-view-cli.md).
Web deletion extends the agreed permanent-deletion capability of 0027; it is
not completion, cancellation, archival or removal from just one View.

Included:

- Create one Action in an ordinary column of an existing View instance.
- Persist its initial execution state, explicit column placement and append
  position atomically with creation.
- Reuse the small `+ Add Action` control below each eligible column title.
- Add a red `Delete action` button alongside `Save changes` and `Cancel` in
  the always-visible Action detail bar in both board modes.
- Confirm permanent deletion, preserve the 0027 dependency guard, and reconcile
  the visible board after a confirmed write without reloading the page.

Deferred: creation in the special Blocked column, web deletion of View instances,
View definition editing, bulk operations, undo/trash, force/cascade deletion,
archival, arbitrary insertion positions during creation, choosing a non-default
state in a multi-state column, new CLI commands and releases.
View instance deletion remains available through the existing CLI.

## Proposed solution

### Creation control and form

Reuse the existing Default Kanban design: a small `+ Add Action` button directly
below the column title, with the existing inline creation form and searchable
owner selection. Do not introduce a separate creation dialog or a new large
column control. Existing Default Kanban creation keeps its current behavior.

Show the control in each ordinary column of a successfully evaluated View,
including empty columns and columns accepting multiple states. Do not show it
in the special Blocked column. An ordinary column with `include_blocked: true`
still supports ordinary unblocked creation; it is not the special Blocked column.

Reuse the existing fields, defaults, validation and keyboard/focus behavior.
Ownership defaults to Workspace unless the existing creation flow provides an
applicable default; a View is never the Action's owner. The user can select a
Project or Outcome through the existing picker. View columns do not infer owners.
Use the destination's `default_status`, not the first state in its list and not
the default routing column for that state. Waiting retains its existing optional
waiting-reason contract and creation field; no new mandatory reason is added.
Do not add manual-block or dependency inputs to creation.

Only one creation form is active in the current board. Focus its title when
opened. Cancel performs no write; successful creation closes the form and restores
focus using the existing pattern. Failed validation or a rejected write retains
the entered draft and shows useful feedback. Preserve existing navigation/discard
and pending-write guards when changing board mode or View.

### Atomic creation and placement

Pass the selected View instance and stable column identity to a shared application
operation. The server validates the current instance/definition, destination and
ordinary-column eligibility, then creates the Action with the destination's
default state and saves explicit placement in that instance.

Append after all currently evaluated members of the destination, including
automatically routed members without explicit placement. An empty column receives
position 1. Preserve the relative order of existing cards. Use the established
0024 ordering rules; append is determined from current data at write time, not
a count cached in the browser.

Creation, placement/order changes and corresponding Operational Event Log entries
must commit in one store transaction or roll back together. Do not implement
this as browser `create` followed by a separate `move`, or compensate a failed
move by deleting an already committed Action. Reuse shared creation/domain rules
and View ordering logic rather than duplicating them in HTTP or React code.
Record creation and actual View organization changes through existing event
conventions without a fictitious state-change or duplicate creation event.

Validate the final result before commit. A missing View, removed destination,
invalid or ID-mismatched definition, invalid owner/input, or persistence/event
failure leaves no new Action, placement, order or success events.
Reuse existing View mutation definition/precondition conventions so a stale form
cannot silently create with a changed destination default. Report a conflict and
require refresh/review when those preconditions no longer hold; preserve the draft
where possible. Do not promise an atomic snapshot across Markdown and SQLite.

The new Action is a Workspace object visible to other Views through their normal
evaluation. Save explicit chosen placement only for the source View instance;
do not copy that placement/order into other instances or create duplicate Actions.
A page refresh or server restart must retain the chosen source column and order.

### Shared deletion control and confirmation

Add `Delete action` to the existing persistent Action detail bar alongside
`Save changes` and `Cancel`. Use a red danger theme with readable contrast,
visible keyboard focus and the text label. It must remain visible and reachable
when the detail scrolls in both Default Kanban and Views, including narrow/short
windows. Allow sensible wrapping without overlap or horizontal clipping.
Do not place the button at the bottom of the scrolling content.

Deletion is a separate action, not a form submit. Opening confirmation must not
save edits or require valid edit fields. Show the persisted Action title and
explain that this permanently deletes the Action from the Workspace and every
View, cannot be undone, and discards any unsaved edits. Provide explicit cancel
and destructive confirmation controls. Opening or cancelling confirmation performs
no write; cancellation returns to the intact editor draft and restores focus.

Use accessible confirmation behavior consistent with the existing UI: keyboard
operation, sensible initial focus on the non-destructive option, Escape to cancel
when no write is pending, and focus contained within the active dialog.
Prevent duplicate submission and overlapping save/delete/move operations while
deletion is pending; controls must visibly reflect pending state.

### Deletion semantics and failure behavior

Invoke the shared 0027 Action deletion operation; do not replicate dependency or
cleanup logic in the browser or HTTP handler. Delete the object globally,
regardless of which board, View or column opened its detail.

All 0027 rules remain authoritative:

- An incoming dependency from any other Action rejects deletion with
  `ACTION_IN_USE`, including terminal referring Actions or satisfied dependencies.
- Explain the rejection and identify referring Actions using the existing error
  information; the user must explicitly remove or redirect those dependencies.
  Do not silently remove edges or offer a force-delete bypass.
- Outgoing dependencies alone do not prevent deletion. On success, remove the
  Action and its outgoing edges, placements and order entries across all Views.
- Preserve surviving card order, unrelated objects and historical events.
  Cleanup and deletion events commit atomically.
- Cleanup does not require loading View definitions or resolving the Action owner.
  Do not add a View validation requirement to global Action deletion.

On a definite rejection/failure, retain the open detail and its unsaved draft
and show a readable error. The confirmation can close to expose that error.
An Action deleted externally is reported through the existing missing-Action
behavior; it is not a successful second deletion and adds no new deletion event.

After confirmed success, close the detail, remove the card and update the active
board without full-page reload. Restore focus to a sensible surviving control
in the active surface because the deleted card no longer exists.
Preserve selection, filters and scroll position where practical.

A read started before a confirmed creation/deletion must not erase the created
card or resurrect the deleted one. Reconcile cached boards and later board/View
switches with current data. A refresh failure after confirmed deletion must not
report the deletion itself as failed or restore the deleted card; retain an
accurate stale/read-failure notice. Likewise, preserve confirmed creation evidence
if its follow-up read fails. View ordering writes remain disabled while the View
cannot be trusted. Do not automatically retry an uncertain mutation response;
explain uncertainty and allow refresh/checking before a deliberate retry, following
existing creation/write conventions.

### Interfaces, architecture and documentation

Add narrowly scoped HTTP/client contracts for View-column creation and Action
deletion. Exact route naming is an implementation choice consistent with current
API conventions. Bind operations to the server's original Workspace; the browser
must not supply arbitrary filesystem roots or definition paths.

Apply the established mutation Host/Origin, body/content-type and request-shape
validation, including the development proxy boundary. Retain structured errors
and storage diagnostics without leaking SQL details. Final eligibility and
dependency checks run server-side even if the UI has already checked them.

Keep orchestration in the application, rules in the domain and persistence behind
store ports. No new dependency or schema change is expected; if one becomes
necessary, document the actual reason and compatibility impact. Never silently
migrate or replace a user store. Keep existing CLI behavior intact.

During implementation update README/examples and affected API/architecture
documentation to describe delivered behavior. No change to generated Workspace
CLI guidance is required solely for these web controls. Keep deferred Blocked
creation and View deletion clearly distinguished from delivered functionality.

## Acceptance criteria

AC1: Every ordinary View column, including an empty or multi-state column, has
the existing small `+ Add Action` design below its title. The special Blocked
column has no such button. Default Kanban creation retains its existing design.

AC2: Creating in a non-default routing column persists one Action with the
column's `default_status`, entered fields/owner and explicit source-instance
placement at the end of the full column. Refresh/restart preserves that result.
Other instances route the same Action independently.

AC3: Waiting creation uses the existing optional reason behavior. Cancelling
creates nothing. Invalid input/owner preserves the draft and creates nothing.
A changed or invalid destination is rejected without a partially created Action.

AC4: Forced persistence or event failure rolls back Action creation and every
associated placement/order/event change. Existing cards retain relative order,
including when the destination contains automatically routed members.

AC5: Both board modes show the red `Delete action` beside `Save changes` and
`Cancel` in the persistent detail bar at wide, narrow and short viewport sizes.
Scrolling long content never hides or overlaps these controls.

AC6: Delete opens confirmation naming the persisted Action and explaining global,
permanent deletion and unsaved-edit loss. Opening/cancelling performs no write,
retains edits and restores focus. Confirming does not save the draft or trigger
edit-field validation. Keyboard-only operation is usable.

AC7: Confirmed deletion removes the Action globally and closes its detail without
page reload. Placements/outgoing edges disappear, surviving order/history remain,
and subsequent Default Kanban/View reads omit it. Focus remains usable.

AC8: Any incoming dependency rejects deletion with `ACTION_IN_USE` and useful
referring-Action information. The detail/draft remains available and stored data
and events are unchanged. No force/cascade path exists.

AC9: Pending creation/deletion prevents duplicate or conflicting writes and
reflects that state visibly. Pre-write reads cannot override confirmed writes;
a post-write read failure preserves the known result and reports refresh failure
accurately. Uncertain responses do not cause automatic retries.

AC10: New mutation routes enforce existing HTTP write boundaries and strict
validation without partial writes. Missing targets and store failures produce
structured diagnostics. Existing CLI deletion, board editing, creation,
drag-and-drop and text selection continue to work.

## Verification plan

- Application/SQLite checks cover atomic create-and-place, append after implicit
  members, source-instance isolation, invalid/stale destinations and event-failure
  rollback (AC2–AC4). Reuse the deletion tests from 0027 for unchanged rules.
- Add concise English Gherkin coverage for creating directly in a chosen View
  column through the real application operation; link canonical scenarios at
  handoff rather than duplicating all technical tests.
- HTTP integration checks exercise the two new mutation contracts, forbidden
  Host/Origin/request examples, dependency rejection, missing targets and atomic
  failure behavior (AC3, AC8, AC10).
- Component/client tests cover confirmation versus edit submission, retained
  drafts, focus, pending controls, duplicate prevention, stale responses and
  post-write read failures. Test held writes rather than immediate mocks only.
- A small set of real browser journeys creates in a non-default Open column,
  verifies persisted order after reload, and deletes through both modes.
  Include cancelled confirmation, an incoming-dependency rejection and keyboard
  use. Verify backend results rather than only disappearing DOM nodes.
- Inspect actual browser rendering at representative wide, narrow and short
  sizes (for example 1920 × 1080, 390 × 844 and 1280 × 600). Verify reused Add
  Action design, a long detail's persistent three-button bar, error visibility
  and accessible confirmation. Record screenshots or equivalent visual evidence.
- Reuse relevant existing movement/layout/creation checks; run `npm run verify`
  before implementation handoff and record actual revision, platform and results.
  No runtime tests are claimed by this documentation-only proposal.

Human try-out: open a View with several Open columns, add an Action to a
non-default one and refresh. Open its detail, make an unsaved edit, open/cancel
Delete and verify the edit remains. Then confirm deletion and check that it is
absent in Default Kanban and another View. Repeat deletion from Default Kanban,
including an Action referenced by a dependent to see the rejection.

## Open questions

No blocking scope questions remain. Exact route names, ordinary spacing and
confirmation component structure are implementation choices within this contract.
Creation in Blocked is supported by the broader profile but explicitly deferred
from this increment; no profile change is required.

## Implementation and review outcome

Not implemented. Record delivered behavior, verification, independent review,
deviations and limitations here at handoff.

## Decision changes and follow-up

None.
