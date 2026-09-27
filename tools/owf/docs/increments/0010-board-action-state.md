# 0010 — Change Action state on the board

> Status: reviewed
> Description: Change Action state by dragging a card into another board column.
> Depends on: [0009 — Compact Action cards](0009-compact-action-cards.md) and [0005 — Action state changes](0005-action-state.md).

## Goal and scope

The user reviewed and approved this design for implementation on 2026-09-27.

Let a person change an existing Action's execution state directly on the
Kanban board, without switching to the CLI. The board shows the persisted
result in the right column without flashing or blocking other cards. Reuse
the state operation and domain rules from 0005.

References: [architecture](../architecture.md),
[development guidelines](../development-guidelines.md),
[MVP scope](../../../../docs/design/mvp-scope.md),
[Core v0](../../../../spec/core-v0.md),
[Operational Store design](../../../../docs/design/operational-store-notes.md),
[0005 state semantics](0005-action-state.md),
[0006 refresh behavior](0006-read-only-action-board.md) and
[0008 browser write behavior](0008-board-action-create.md).

Included: drag and drop between the five state columns (including reopening
Completed/Cancelled), an accessible non-drag equivalent, a local state-update
HTTP endpoint, conflict feedback and quiet board reconciliation.

Deferred: editing Action fields including `waiting_for`, ordering cards within
a column, archive, filters and bulk changes. Dropping into Waiting does not
prompt for a reason; editing it belongs to a later Action editing increment.
No schema migration or new state is needed.

## Proposed solution

### Card interaction

Use dnd-kit for a card drag handle and five column drop targets. The handle
must not interfere with reading/selecting card text or with Add Action. While
dragging, show the card and target clearly without obscuring other content;
drops outside a column or back into the source column do nothing. Position
inside a column never changes the fixed `created_at`/ID list order. Dropping
in another column submits one state change. All five destinations work from
any source, including reopening Completed/Cancelled.

A drop into Waiting supplies only `state: waiting`: the stored `waiting_for`
is absent for an Action coming from another state, as in 0005. Show no dialog,
inline form or interruption. Leaving Waiting clears its reason under the
existing rule. Changing or clearing `waiting_for` while staying Waiting is
deferred to Action editing. The existing CLI can still edit the reason.

Support keyboard and screen-reader users through dnd-kit's keyboard controls
and a discreet alternate state control on the card, as required by the
architecture. The alternate control invokes the same state update, with no
Waiting form. Describe how keyboard dragging works in accessible instructions;
use visible focus and a clear announcement of drag/drop outcomes. Keep the
compact card readable at desktop and narrow widths; touch input should also
permit a move without preventing ordinary scrolling.

Disable only the affected card's movement while its request is pending;
other cards, forms and Refresh remain usable. The source card stays visible
while the write is pending, with subtle progress feedback. On confirmation,
use the complete returned Action to move it once to its actual state and
update column counts, preserving existing list order (`created_at` descending,
ID ascending for ties). A same-column drop causes no request, timestamp or
event. If the request fails, keep the card in the original column and explain
the error nearby. A network failure after sending may have an unknown
outcome: do not automatically retry; prompt the user to refresh/check the
board first. Preserve the quiet refresh and stale warning.

### HTTP, stale data and persistence

Add a local state update route such as `PATCH /api/actions/{id}/state`. A strict
JSON request carries the target `state` and the card's observed `state`,
`updated_at` and `waiting_for` as an expected snapshot. The board sends no
new Waiting reason. The response returns the actual persisted Action and
`updated` or `unchanged` status. Parse request/response in `src/contracts`;
keep the HTTP adapter thin,
using `setAction` once. Reuse the same-origin JSON/Host gate established for
POST, including Vite proxy behavior. Reject invalid input before any write;
return machine-readable 400 for invalid input, 404 for an absent Action, 409
for a stale card, and a distinct 5xx store error without SQL details.

The card's expected values must be compared with the current Action **inside
the existing update transaction**, before applying the change. Extend the
application/port input as needed for this optional browser precondition;
CLI `set action` keeps its current unconditional behavior. A mismatch reports
`ACTION_CONFLICT` and writes no Action or event. Compare state, timestamp and
Waiting reason so a differing state/reason is not silently overwritten, even
when timestamps coincide. The comparison must not require the Markdown owner
path to still exist. If a CLI change makes the card stale, show the conflict
and refresh the board quietly to reveal the current value; never claim the
requested move succeeded. The backend's existing atomic Action/update event
behavior and idempotency still apply.

The board's accepted-write reconciliation currently protects newly created
cards from older GETs. Extend it for state updates: a GET started before the
confirmed PATCH cannot move the card back, duplicate it or discard a changed
reason. A subsequent fresh GET reconciles the authoritative list. If a later
CLI change is read, that newer result becomes visible through the existing
focus/manual refresh path. Neither reads nor no-op updates write an event.

Keep CLI output, GET/list/POST contracts and stored schema unchanged. Update
the tool README and board text that currently describes CLI changes as the
only way cards change; the generated Workspace AGENTS.md remains CLI-focused.

## Acceptance criteria

AC1: Dragging from each column to any other column changes the Action to that
column's state, including reopening Completed/Cancelled. The persisted Action
and one `action.state_changed` event reflect a real change; owner, title, ID and
creation time remain unchanged. A drop outside a target or within the same
column writes nothing. No automatic owning Project/Outcome change occurs.

AC2: Dropping into Waiting changes the state without showing a form or
populating `waiting_for`. Leaving Waiting removes an existing reason. No
browser control in this increment edits or clears the reason while remaining
Waiting. CLI reason editing remains available and visible after refresh.

AC3: Pointer/touch dragging indicates valid targets, and keyboard/screen-reader
users can move a card without a pointer. Pending updates leave the board
interactive and avoid speculative moves or flicker. A confirmed Action appears
once in its correct column and order, with updated counts and reason. Older GET
responses cannot undo it. Failure leaves the card in its source column; an
uncertain result is not automatically retried.

AC4: A browser card whose displayed state, timestamp or Waiting reason differs
from the current Action cannot overwrite it, including after a CLI reason-only
change. The update transaction rejects the conflict without changing Action or
Event Log; the UI identifies the conflict and quietly shows the current
version. A missing Action, validation error and storage failure have distinct
machine-readable outcomes.

AC5: The HTTP mutation accepts only same-origin JSON on loopback and rejects
foreign Origin/Host or non-JSON requests without writes. Existing CLI and
create/read browser flows continue to work. No schema migration, within-column
ordering or browser editing of other Action fields is introduced.

## Verification plan

- Focused application/SQLite integration checks for expected-snapshot success,
  timestamp/state/reason conflicts, no-op invariants, one correlated event
  and rollback on failure (AC1–AC2, AC4). Reuse 0005's transition matrix.
- HTTP integration checks for accepted result, missing/invalid/conflict/store
  errors and same-origin JSON gate, with unchanged bytes on rejections (AC4–AC5).
  Avoid repeating every state at HTTP level.
- Component/client checks for target resolution, same-column/outside drops,
  keyboard alternative, card-level pending/error feedback, stale read/update
  races and quiet reconciliation (AC1–AC3). Do not mirror every HTTP case.
- One focused Playwright journey dragging an Action into Waiting without a
  reason, then to another state, verifying persisted results through the CLI.
  Keep the browser suite small; no case per transition (AC1–AC3).
- Manually inspect pointer, keyboard and touch behavior, drop cues and
  pending/error states at desktop and narrow widths. Run `npm run verify`
  before handoff and record the actual revision, platform and results.

Manual trial: create an Open Action, run `owf serve`, drag it to Waiting (no
prompt and no reason), then complete and reopen it. Check the result with
`owf get action {id}` after each step. Change its state or reason in the CLI
while the board is open, then try moving the stale card and confirm the
conflict/refresh behavior.

## Open questions for review

No blocking question. Drag and drop is the primary interaction, per user
decision. The alternate state control is a small accessibility fallback,
without a Waiting prompt or editor.

## Implementation and review outcome

Pending implementation and review.
