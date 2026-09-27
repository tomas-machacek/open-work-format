# 0012 — Edit an Action on the board

> Status: draft
> Description: Open an Action's expanded card, edit its fields and save it from the board.
> Depends on: [0011 — Edit Actions through the CLI](0011-action-edit-cli.md), [0010 — Change Action state on the board](0010-board-action-state.md).

## Goal and scope

Click or tap an Action card to open a larger, readable detail card with its
current values. Edit title, description, owner, state and waiting reason there,
then save the changes together. Keep the compact board and its drag-to-move
interaction. The editor uses the same Action rules and persistence operation as
the CLI, so there is one source of truth for validation and events.

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
attachments, archive, bulk editing and general URL routing for Action details.
No storage schema change or migration is needed beyond 0011.

## Proposed solution

### Interaction and presentation

A normal click/tap opens a focused, expanded card over the board with labeled
fields. A pointer/touch drag continues to move the card between columns and
must not open the editor after the drop. Keep the whole card draggable as in
0010. For keyboard users, **Enter** opens the focused card; **Space** and
arrows retain the existing drag behavior. The card's accessible instructions
explain both operations. Opening/closing must not submit a change.

Present title, multiline Markdown description, owner URL, state and optional
waiting reason, plus the immutable ID and timestamps as quiet read-only
details. Use a compact state select in the editor; choosing Waiting reveals the
optional reason field. Clearing a previously stored reason while remaining in
Waiting is possible. Moving out of Waiting clears the reason on save; if the
user switches back to Waiting before saving, retain the draft reason. An empty
description clears it. Do not expose a separate save for each field.

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
`updated_at`, plus only the changed fields or explicit clear intents.
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
including a change of state or owner. Older GET responses must not roll back
the accepted change; a fresh later read remains authoritative. A no-op update
writes no timestamp or event. Edits follow 0011's one-transaction, one-event
rule, including combined state and content changes.

## Acceptance criteria

AC1: Click/tap or Enter on a card opens its expanded editor with current
title, description, owner, state, waiting reason when relevant, and read-only
identity/timestamps. Drag/drop and keyboard Space-to-drag still work without
opening the editor. Escape/Cancel restores focus and never writes; an unsaved
draft requires an explicit discard choice.

AC2: Save can change any combination of editable fields, including owner `/`,
state and waiting reason, in one operation. It observes 0011's validation,
clearing and no-op rules. A confirmed result appears once in its right column
with the new card values and counts, without flicker or duplicate events.

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
  combined update and event atomicity, no-op, stale title/owner with equal
  timestamp and rejected owner (AC2–AC3). Reuse 0011's field validation tests.
- HTTP integration checks for valid edit, malformed and rejected requests,
  missing/conflict/store errors and origin/JSON gate (AC3–AC4).
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
state remains available both there and through the existing drag interaction.

## Implementation and review outcome

Pending implementation and review.
