# 0012 — Edit an Action on the board

> Status: completed
> Description: Open an Action's expanded card, edit its fields and save it from the board.
> Depends on: [0011 — Edit Actions through the CLI](0011-action-edit-cli.md), [0010 — Change Action state on the board](0010-board-action-state.md).

## Goal and scope

The user reviewed and approved this design for implementation on 2026-09-27.

Click or tap an Action card to open a larger, readable detail card with its
current values. Edit title, description and owner there, plus the waiting reason
when the Action is in Waiting, then save the changes together. Change the state
only by dragging the compact card between columns. The editor uses the same
Action rules and persistence operation as the CLI, so there is one source of
truth for validation and events.

References: [architecture](../architecture.md),
[development guidelines](../development-guidelines.md),
[MVP scope](../../../../docs/design/mvp-scope.md),
[Core v0](../../../../spec/core-v0.md),
[Operational Store design](../../../../docs/design/operational-store-notes.md),
[0006 board refresh](0006-read-only-action-board.md),
[0008 board creation](0008-board-action-create.md),
[0010 board writes](0010-board-action-state.md) and
[0011 edit semantics](0011-action-edit-cli.md).

Included: an expanded Action editor, save/cancel feedback, stale-edit
protection, a local HTTP edit route and quiet board reconciliation. Deferred:
owner picker/search (enter a Workspace-rooted URL), Markdown preview,
attachments, archive, bulk editing, state changes from the detail card and
general URL routing for Action details.
No storage schema change or migration is needed beyond 0011.

## Proposed solution

### Interaction and presentation

A normal click/tap opens a focused, expanded card over the board with labeled
fields. A pointer/touch drag continues to move the card between columns and
must not open the editor after the drop. Keep the whole card draggable as in 0010. For keyboard users, **Enter** opens the focused card; **Space** and
arrows retain the existing drag behavior. The card's accessible instructions
explain both operations. Opening/closing must not submit a change.

Present editable title, multiline Markdown description and owner URL. Show the
state, immutable ID and timestamps as quiet read-only details. Only an Action
already in Waiting has an editable optional waiting reason; allow clearing it
while remaining in Waiting. To change the state, close the detail card and
drag the compact card into another column. The existing drag behavior clears
the reason when leaving Waiting. An empty description clears it. Do not expose
a separate save for each field.

Use a responsive dialog styled as a larger version of the existing card, not a
full page replacement. Give it a visible heading, clear Save and Cancel
controls, initial focus, contained keyboard focus and Escape/close behavior.
Return focus to the original card if it still exists; otherwise use a sensible
board control. If the draft has unsaved changes, closing first presents a
small in-dialog Discard/Continue editing choice so Escape or an accidental
outside click cannot lose text. During save, keep the draft visible with
subtle progress and prevent duplicate submission. On success, update the board
without a loading flash and close the editor. On validation or storage failure,
keep the draft and explain the problem near the form.

The editor captures the displayed Action as its baseline when opened. A board
refresh never overwrites an in-progress draft. If a refresh reveals a newer
Action before save, show a nonblocking stale-data notice and offer to discard
the draft and load the current values. Do not silently merge fields. A failed
save with an uncertain network outcome must not be retried automatically;
prompt the user to refresh and inspect the current Action first.

### HTTP, concurrency and persistence

Add a local route such as `PATCH /api/actions/{id}` with a strict request in
`src/contracts`: a full expected snapshot of mutable fields and
`updated_at`, plus only changed title, description, owner and waiting-reason
fields or explicit clear intents. The request has no target state field.
The snapshot includes title, description, owner URL, state, waiting reason and
timestamp, so equal timestamps cannot hide a conflicting edit. Preserve the
difference between an omitted field, an empty description and a clear. The
server compares the snapshot with the current row **inside the write
transaction**, then calls the same application `setAction` operation as CLI.
Do not implement edit rules independently in HTTP or React.

Recheck the request through the existing same-origin JSON/Host gate. Return the
persisted Action and `updated`/`unchanged`. Invalid request, invalid owner,
missing Action, stale snapshot and store failure must have distinct
machine-readable 400, 404, 409 and 5xx results with no partial write. Keep
the CLI's unconditional edit behavior and the existing `/state` route's
precondition semantics. The full snapshot detects a CLI edit, another browser
edit or drag that happened after the dialog opened. On conflict, keep the
draft, display the conflict, quietly refresh the board and offer an explicit
reload of current values; saving the stale draft again cannot overwrite it.

Accept the complete confirmed Action into the existing board reconciliation,
including a change of owner or waiting reason. Older GET responses must not
roll back the accepted change; a fresh later read remains authoritative. A
no-op update writes no timestamp or event. Edits follow 0011's one-transaction,
one-event rule. The dialog never submits a state change.

## Acceptance criteria

AC1: Click/tap or Enter on a card opens its expanded editor with current
title, description, owner, state, waiting reason when relevant, and read-only
identity/timestamps. Drag/drop and keyboard Space-to-drag still work without
opening the editor. Escape/Cancel restores focus and never writes; an unsaved
draft requires an explicit discard choice. The state is displayed read-only.

AC2: Save can change title, description, owner (including `/`) and, for an
Action in Waiting, its waiting reason in one operation. It observes 0011's
validation, clearing and no-op rules, but cannot change state; the edit route
rejects a target state in its request. A confirmed result appears once in the
same column with new card values, without flicker or duplicate events. State
changes remain available by dragging cards.

AC3: A refresh does not replace a draft. An Action modified after the editor
opened cannot be overwritten by a stale save, even if the timestamps coincide
or only title, description or owner changed. A conflict leaves the draft
available, explains the outcome and offers an explicit reload; Action and
event remain unchanged by the rejected request.

AC4: Invalid input/owner, missing Action and store failure keep the form open
with useful feedback and no partial update. The route rejects non-JSON or
foreign-origin writes. An unconfirmed network result is not retried silently.
Creation, CLI editing and drag-to-move keep working.

AC5: The dialog works with keyboard, screen reader and a narrow touch
viewport. It has discernible labels, focus management and visible save/error
states. Board background refresh remains quiet and cards remain visible
behind the dialog.

## Verification plan

- Focused application/SQLite integration checks for full-snapshot conflict,
  combined content/owner/reason update and event atomicity, no-op, stale
  title/owner with equal timestamp and rejected owner (AC2–AC3). Reuse 0011's
  field validation tests.
- HTTP integration checks for valid edit, malformed and rejected requests,
  including a submitted target state, missing/conflict/store errors and the
  origin/JSON gate (AC2–AC4).
- Component/client checks for click versus drag, draft retention across
  refresh, save reconciliation, conflict/reload, clear reason/description,
  pending/error feedback and focus (AC1–AC5). Avoid repeating the full field
  matrix across layers.
- One focused Playwright journey: open a card, edit title and Waiting reason,
  save, verify the board and persisted Action via CLI, then confirm drag still
  moves a card without opening the editor. Reuse existing journeys where
  sufficient; keep the browser suite small.
- Manually inspect desktop and narrow touch layout, keyboard focus/drag,
  screen-reader labels and quiet refresh. Run `npm run verify` before handoff
  and record actual platform, revision and results.

Manual trial: start `owf serve` in a version 4 Workspace, open a card, change
its title/owner/Waiting reason and save. Check `owf get action {id}`. Open it
again, edit the draft, change the Action via CLI, then attempt Save and verify
that the editor reports a conflict without losing the draft. Test dragging
and Escape/Cancel independently.

## Open questions for review

No blocking questions. The expanded card is a dialog with a single Save;
state is displayed read-only and changes only through the existing drag
interaction, per user decision.

## Implementation and review outcome

Implemented in PR #17 at `b3f362c` on 2026-09-27. The board opens a focused
Action dialog by click, tap or Enter while Space and dragging retain state
changes. The dialog edits title, description, owner and Waiting reason together,
shows state read-only, guards unsaved drafts and keeps them through refresh or
conflict. The strict edit route checks the full displayed snapshot inside the
existing `setAction` write transaction, uses its validation and event rules,
and rejects a requested state. A confirmed Action is reconciled into the board
without a loading flash. No storage schema or dependency changed. There were
no deviations from the approved behavior.

On Windows with Node 24.21.0, `npm run verify` passed for `b3f362c`:
typecheck, lint, format, architecture check, build, 83 unit/component tests,
125 integration tests, 24 acceptance scenarios, 21 CLI end-to-end tests and 4
Chromium Playwright scenarios. The new Playwright journey edited a Waiting
Action, checked persistence through CLI and moved the card by drag. Desktop and
390 px Chromium screenshots were inspected for layout and scrolling. Dialog
labels and focus were checked in component tests; a manual assistive-technology
screen-reader session was not run. The version 4 Workspace requirement from
0011 still applies.

Independent review of PR #17 found that opening the Discard/Continue choice
left keyboard focus on the page body, and that the edit-route integration test
supplied the Action's existing owner rather than testing an owner change. The
dialog now focuses Continue editing when the choice opens and returns focus to
the title field when editing resumes. The integration test changes ownership to
a valid Project and checks the old and new owner URLs in the single update
event. The existing Playwright journey also checks focus through Escape,
Cancel, discard and return to the card.

After these review fixes, `npm run verify` passed on Windows with Node
24.21.0: typecheck, lint, format, architecture check, build, 83 unit/component
tests, 125 integration tests, 24 acceptance scenarios, 21 CLI end-to-end tests
and 4 Chromium Playwright scenarios. A manual screen-reader session remains
unperformed. The reviewed and verified implementation is complete in PR #17. No review
findings remain open. This status does not imply a release.
