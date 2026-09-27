# 0010 — Change Action state on the board

> Status: draft
> Description: Move Actions between board columns through a card control, including Waiting context.
> Depends on: [0009 — Compact Action cards](0009-compact-action-cards.md) and [0005 — Action state changes](0005-action-state.md).

## Goal and scope

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

Included: a compact **Move to…** control on each card, the five existing
states including reopening Completed/Cancelled, optional Waiting reason,
reason replacement while already Waiting, a local state-update HTTP endpoint,
conflict feedback and quiet board reconciliation.

Deferred: drag and drop, changing title/description/owner, clearing a Waiting
reason while remaining Waiting, archive, filters and bulk changes. The
architecture's dnd-kit choice applies when drag and drop is implemented; this
increment provides an accessible state control first. No schema migration or
new state is needed.

## Proposed solution

### Card interaction

Provide a small, keyboard-accessible **Move to…** state control on each card.
Show the current state and the other four destinations clearly. Choosing a
different non-Waiting state submits one update. Choosing Waiting opens a
small inline step for optional **Waiting for** text and explicit Save/Cancel;
the card stays in its current column until the server confirms the update.
While already Waiting, offer **Edit Waiting for** and prefill the existing
reason. A nonblank supplied value replaces it verbatim; leaving it unchanged
is an idempotent no-op. An empty value when a reason exists must not appear to
clear it: disabling Save with an explanation is acceptable, since clearing a
reason without leaving Waiting is deferred by 0005. Waiting without a reason
remains valid. Leaving Waiting clears the reason under the existing rule.

Disable only the affected card's state controls while its request is pending;
other cards, forms and Refresh remain usable. Keep the card visible in its old
column during the request. On confirmed success, use the complete returned
Action to move it once to its actual state, update its Waiting text and column
counts, preserving existing list order (`created_at` descending, ID ascending
for ties). A successful same-state request must not add an event or change the
timestamp. If the request fails, keep the card and entered reason, explain the
error locally and allow correction or retry. A network failure after sending
may have an unknown outcome: do not automatically retry; prompt the user to
refresh/check the board first. Preserve the quiet refresh and stale warning.

The control is usable at desktop and narrow widths without turning the compact
card into a large permanent form. Use native button/select semantics, visible
focus and labels. No hover-only action or drag-only interaction.

### HTTP, stale data and persistence

Add a local state update route such as `PATCH /api/actions/{id}/state`. A strict
JSON request carries the target `state`, optional `waitingFor`, and the
card's observed `state`, `updated_at` and `waiting_for` as an expected snapshot.
The response returns the actual persisted Action and `updated` or `unchanged`
status. Parse request/response in `src/contracts`; keep the HTTP adapter thin,
using `setAction` once. Reuse the same-origin JSON/Host gate established for
POST, including Vite proxy behavior. Reject invalid input before any write;
return machine-readable 400 for invalid state/reason, 404 for an absent Action,
409 for a stale card, and a distinct 5xx store error without SQL details.

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

AC1: From each column, a user can move an Action to any other supported state,
including reopening Completed/Cancelled. The persisted Action and one
`action.state_changed` event reflect a real change; owner, title, ID and
creation time remain unchanged. A same-state no-op preserves timestamp and
event count. No automatic owning Project/Outcome change occurs.

AC2: Entering Waiting can include an optional nonblank literal reason.
Editing the reason while staying Waiting replaces it; leaving Waiting removes
it. The UI does not imply that a blank edit clears an existing reason. Invalid
reason/state combinations are rejected without writes.

AC3: Pending updates leave the board interactive and avoid speculative moves
or flicker. A confirmed Action appears once in its correct column and order,
with updated counts and reason. Older GET responses cannot undo the confirmed
result. Failure preserves the user input and card; an uncertain result is not
automatically retried. Compact cards remain readable and keyboard accessible.

AC4: A browser card whose displayed state, timestamp or Waiting reason differs
from the current Action cannot overwrite it, including after a CLI reason-only
change. The update transaction rejects the conflict without changing Action or
Event Log; the UI identifies the conflict and quietly shows the current
version. A missing Action, validation error and storage failure have distinct
machine-readable outcomes.

AC5: The HTTP mutation accepts only same-origin JSON on loopback and rejects
foreign Origin/Host or non-JSON requests without writes. Existing CLI and
create/read browser flows continue to work. No schema migration or drag and
drop is introduced.

## Verification plan

- Focused application/SQLite integration checks for expected-snapshot success,
  timestamp/state/reason conflicts, no-op invariants, one correlated event
  and rollback on failure (AC1–AC2, AC4). Reuse 0005's transition matrix.
- HTTP integration checks for accepted result, missing/invalid/conflict/store
  errors and same-origin JSON gate, with unchanged bytes on rejections (AC4–AC5).
  Avoid repeating every state at HTTP level.
- Component/client checks for Waiting reason step, cancel, card-level pending
  and error feedback, keyboard operation, stale read/update races and quiet
  reconciliation (AC2–AC3). Do not mirror every HTTP case in the browser.
- One focused Playwright journey moving an Action into Waiting with a reason,
  then to another state, verifying persisted results through the CLI and no
  flicker. Keep the browser suite small; no case per transition (AC1–AC3).
- Manually inspect the control and pending/error states at desktop and narrow
  widths. Run `npm run verify` before handoff and record the actual revision,
  platform and results.

Manual trial: create an Open Action, run `owf serve`, move it to Waiting with a
reason, then complete and reopen it. Check `owf get action {id}` after each
step. Change its state or reason in the CLI while the board is open, then try
an update from the stale card and confirm the conflict/refresh behavior.

## Open questions for review

This proposal intentionally uses a card state control and defers drag and
drop. Confirm that this is the right first interaction for the increment;
other routine visual details can be chosen during implementation.

## Implementation and review outcome

Pending implementation and review.
