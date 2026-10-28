# 0025 — Move and reorder Actions in web Views

> Status: in_progress
> Description: Move and reorder existing View cards through pointer, touch and keyboard drag and drop, using the shared CLI movement semantics.
> Depends on: [0022](0022-web-view-display.md), [0023](0023-view-move-cli.md), and completed [0024](0024-view-order-cli.md).

## Goal and scope

Make existing View instances usable for daily organization in the browser.
The user can move a card between columns, choose its insertion position, and
reorder it within a column. Browser refresh and CLI show reveal the same
persistent result.

Authority: [Views profile](../../../../docs/design/views-profile-notes.md),
[Core](../../../../spec/core-v0.md#12-views),
[Operational Store notes](../../../../docs/design/operational-store-notes.md),
[architecture](../architecture.md), and
[development guidelines](../development-guidelines.md).

Included:

- Drag and drop between and within columns of the selected View instance.
- Keyboard and touch support for the same drag-and-drop interaction.
- A thin HTTP adapter for the shared movement operation delivered in 0023/0024.
- Required manual-block input, authoritative refresh, and explicit failure feedback.
- Preservation of existing View detail editing and Default Kanban behavior.

Deferred:

- Creating Actions in a View column, importing outside-View Actions through UI,
  moving between View instances, bulk moves, and undo/history.
- View definition or instance editing, additional View filters, automatic sorting,
  state-choice controls, Snapshots, archival and migrations.
- New board revisions, neighbour-based positioning, polling, push synchronization,
  and advanced concurrent-edit detection or merging.

This increment extends 0022's passive View controls. It does not redefine the
placement, ordering, reconciliation, no-op or event contracts of 0023/0024.

## Proposed solution

### Movement and position semantics

Use the existing shared application move operation. Submit stable View instance,
Action and destination column IDs plus an optional final one-based position.
Titles, browser array indices and internal database ranks are not identifiers.

For an explicit position, remove the moved card from the destination list before
calculating the insertion index. Same-column positions are 1..K; cross-column
positions are 1..K+1 for K destination members. An empty destination accepts 1.
The server validates against resulting evaluated membership within the write
transaction, including any membership effects on dependents, as in 0024.

| Interaction                                            | Requested behavior                              |
| ------------------------------------------------------ | ----------------------------------------------- |
| Drop into a visible insertion slot                     | Send its final one-based position.              |
| Drop on an empty column                                | Insert at position 1.                           |
| Drop on a column's append target                       | Omit position; cross-column arrival appends.    |
| Same-column drop at the current position               | Successful no-op.                               |
| Same-column move with position omitted                 | Successful no-op, preserving CLI compatibility. |
| Cancel drag, Escape, or release outside a valid target | No request and no write.                        |

Expose clear before/between/after insertion indicators, including a reachable
last position in long columns. A whole-column append target must be visually
distinct from an insertion slot. Use the existing dnd-kit integration; avoid a
second drag library or a general board rewrite.

Same-column reorder preserves Action state, owner, content, waiting reason,
blocking, dependencies and updated_at, and preserves inferred versus explicit
placement. Reorder within a multi-state column must not apply its default state.
A dependency-only blocked card can reorder inside Blocked without a manual reason.

Cross-column moves apply exactly 0023's defaults, eligibility, terminal/completion
guards and blocking rules, then 0024's insertion and reconciliation. Shared Action
effects can change other instances, but those instances never inherit the selected
destination or requested position. No-op requests write no events or normalization.

### Drag-and-drop access and card interaction

Use drag and drop as the only web movement interaction. Do not add a separate
"Move..." action, destination selector or numeric-position form. Precise placement
remains available: dropping into the visible gap before, between or after cards
selects that exact insertion position, both within and across columns. The UI
translates the chosen slot into the final one-based position specified above.
Numeric position entry remains available through CLI.

Support pointer, touch and keyboard dragging through the existing dnd-kit
integration. Keyboard users must be able to pick up a card, select a destination
column and insertion slot, drop, or cancel with Escape. All supported positions,
including first/last and empty-column insertion, must be reachable without a mouse.
Provide concise instructions and announce the current destination and position.

Keep ordinary card click/keyboard activation for the existing detail distinct from
drag activation. Completing or cancelling a drag must not accidentally open the
detail. Preserve compact cards and actual-state labels.

On narrow screens, touch dragging must coexist with normal board/page scrolling;
verify reachable targets in long columns and horizontally scrolled boards.
Keep the required Blocked-reason dialog keyboard navigable and errors announced.
Restore focus to the card or an appropriate column/board control after completion
or cancellation.

### Blocked and Waiting input

For cross-column entry into Blocked, reuse an existing valid manual reason when
available. Otherwise collect a nonblank manual-block reason before submitting
the move. A drag needing a reason opens a small reason-only dialog; no preliminary
state or placement write occurs. Cancel leaves everything unchanged.

Whitespace-only supplied reasons fail. Dependency blocking alone does not
supply a manual reason. Terminal entry and exit with unresolved prerequisites
remain rejected by the shared operation. Show the actual rejection, preserving
the card and reason. Do not implement an unblock-then-move sequence.

Same-column moves never request or send manual-block or waiting reason options.
Entering Waiting has no mandatory prompt and sends no waiting reason from this
movement UI. Existing Waiting context is preserved between Waiting destinations,
new Waiting entry starts without a reason, and leaving Waiting clears it under
0023 rules. The existing Action detail remains the place to edit waiting context;
this increment does not add a second waiting-reason editor.

### HTTP and application boundary

Add a narrow mutation route under the existing Workspace-bound View HTTP API.
Exact route and DTO names are implementation choices. The request carries the
IDs, optional position and manual reason needed by the flow above. Validate
transport shapes with shared contracts and report existing structured errors.

HTTP invokes the same application operation as CLI; it must not spawn CLI,
access SQLite directly, independently route cards, or compose move and reorder
as two commits. No new domain movement semantics or store schema is required:
retain schema 8 and existing unsupported-version rejection without migration.

Return success only after commit, with the shared result's source/destination,
positions, changed flag and resulting Action information as appropriate.
Action effects, placement, ordering, reconciliation and operational events remain
one transaction. Required broken definitions and invalid references fail with
context, including the broader affected-instance scope agreed in 0024.

Reuse the corrected coherent read path: Actions/prerequisites, placements and
order used for evaluation come from one read-only SQLite snapshot. Markdown
definitions remain outside that snapshot. Reads, opening controls, drag previews
and cancellation perform no semantic writes.

### Concurrency, refresh and failure behavior

Retain 0024's execute-time numeric-position contract. A drag translates the
displayed slot into N; the server resolves N against current transaction facts.
Concurrent CLI changes may therefore change which cards are adjacent to the
result. There is no promise to remain before/after the card seen at drag start.
Out-of-range positions fail rather than clamp or silently append. The current
evaluated source and current definition determine effects, not cached UI data.

Do not claim Action updated_at detects organization-only changes: 0024 reorders
do not change it. Preserve existing HTTP stale-edit guards for existing Action
operations; do not introduce a board revision or weaken those guards.

Freeze the displayed drag layout during an active gesture or required-reason
dialog, coalesce automatic refresh, and apply the queued refresh after completion
or cancellation. Prevent simultaneous local moves, detail saves and mode switches
while submitting. Navigation guards cover the top selector and modal selectors.
Cancel active gestures before leaving the View; a hidden/unmounted board must not
submit a late drop. Protect existing unsaved Action detail edits.

After confirmed success, re-evaluate the selected View and render server-provided
membership and order; never independently sort or guess affected dependent cards.
A visual drag preview is temporary, not confirmation of persistence.

- On a definitive rejection, discard the preview, explain the cause and refresh
  current facts before another attempt. Do not save compensating reverse moves.
- On confirmed commit followed by refresh failure, report that the move succeeded
  but display could not be refreshed. Retained content is visibly stale and
  movement/detail saves stay disabled until a successful refresh.
- On transport failure where commit outcome is unknown, explain the uncertainty,
  refresh before permitting another move, and do not automatically resend.
- Ignore superseded reads and errors so they cannot replace newer content or
  display another instance's result under the current heading.

Loading, first-load errors and retained stale data offer no active movement
controls. Refresh and safe navigation remain available. Preserve manual refresh
and coalesced tab-return refresh; no polling or push channel is added.

Default Kanban retains its existing creation, state moves, filters and detail
editing. It does not gain View-local ordering or use View IDs. Returning to it
restores its existing in-page filter state.

### Documentation

During implementation update README and the architecture's delivered-capability
summary to explain web moves, insertion positions, required Blocked reasons,
execute-time concurrency behavior and failure/refresh feedback. Replace current
passive-View descriptions only where they describe current functionality;
retain completed increment documents as history.

No fundamental CLI command changes or generated Workspace guide changes are
required. Preserve existing user-edited guides. This proposal itself changes only
the increment document and index, not shipped-capability documentation or code.

## Acceptance criteria

- **AC1 — Same-column order:** Pointer, touch and keyboard dragging reorder in both
  directions, including first/last positions. State, Waiting/blocking metadata,
  Action timestamps and inferred/explicit placement remain unchanged. Same-position
  moves are write-free. Multi-state and dependency-only Blocked cards are covered.
- **AC2 — Cross-column insertion:** Same-state and state-changing moves support
  explicit insertion and append, including empty targets. Other continuing cards
  retain relative order. CLI show and browser refresh/reselection agree.
- **AC3 — Blocking and Waiting:** Blocked entry collects/reuses a valid manual
  reason atomically; cancellation saves nothing. Terminal entry and unresolved
  dependency exit fail without partial changes. Waiting requires no prompt and
  preserves/clears its context exactly as specified.
- **AC4 — Shared transaction:** HTTP uses the existing operation and enforces
  position bounds, eligibility, completion and affected-definition checks.
  Rejections and injected persistence/event failures preserve Action, placement,
  order and events. Pure reorders affect only the selected instance.
- **AC5 — Freshness and concurrency:** Numeric N uses current server facts;
  concurrent reorder/arrival does not imply neighbour anchoring. Out-of-range
  results fail explicitly. Active interactions are protected from layout refresh,
  duplicate submission, navigation and hidden-board late drops.
- **AC6 — Honest outcomes:** Rejection, confirmed save with failed refresh, and
  uncertain transport outcome have distinct feedback. Stale data disables writes.
  Superseded reads cannot replace a newer result; no automatic mutation retry.
- **AC7 — Accessible interaction:** Every supported move and precise insertion
  position is reachable through keyboard drag and drop as well as pointer/touch.
  No separate Move form or numeric-position input is added. Card detail remains
  accessible without accidental opening after a drag. Escape/cancel, focus
  restoration, insertion indicators and wide/narrow layouts work.
- **AC8 — Compatibility and purity:** Default Kanban and shared detail protections
  remain intact. Refresh/reload and CLI process reopen preserve organization.
  Reads/previews/cancellation are write-free, schema remains 8, and no deferred
  creation, filtering, state-choice or View-authoring capability is introduced.

Canonical shared-operation acceptance scenarios are retained in
[view-order.feature](../../tests/acceptance/features/view-order.feature) and
[view-move.feature](../../tests/acceptance/features/view-move.feature).
HTTP and browser-specific risks are covered by the tests recorded below.

## Verification plan

Reuse 0023/0024 domain and SQLite coverage; add tests for the new adapter and
interaction risks rather than repeating the full domain matrix at every layer.

| Risk / criteria                          | Verification                                                                                                                                                                                                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP parity and atomicity (AC1–AC4)      | Real HTTP/application/SQLite cases for positional move, required reason, invalid position, rejected exit, required broken definition and rollback; compare persisted results/events with shared-operation semantics. |
| Execute-time positioning (AC5)           | Commit a CLI reorder/arrival after the displayed read and before HTTP move; verify current-index behavior and a separate now-invalid bound.                                                                          |
| UI races and outcome reporting (AC5–AC6) | Focused component cases for queued refresh, navigation guards, duplicate submission, late responses, rejected move, committed move/read failure and unknown transport outcome without retry.                         |
| Main user flow (AC1–AC3, AC7–AC8)        | Small Playwright journey for pointer reorder/cross-column insertion, keyboard dragging, Blocked reason cancellation/submission and rejected exit; inspect CLI order after browser operations.                        |
| Compatibility and persistence (AC8)      | Refresh/reselect/reload, second-instance independence and return to Default Kanban with existing operations; reuse existing snapshot/purity tests and add new read/preview boundaries where needed.                  |
| Interaction quality (AC7)                | Inspect wide/narrow boards, empty and long columns, precise first/middle/last insertion slots, touch dragging alongside scrolling, card/detail separation, keyboard focus and error announcements.                   |

Human try-out:

1. Use a schema 8 Workspace with two existing View instances and several Actions.
2. Select the first View; reorder a middle card and insert it into another column.
3. Compare with CLI show, refresh and reselect after page reload.
4. Repeat with keyboard dragging, including first/last positions and an empty
   target; verify touch dragging and scrolling on a narrow screen.
5. Enter Blocked without an existing manual reason: cancel once, then submit.
6. Reject exit with an unresolved prerequisite; resolve it through existing
   controls and retry.
7. Inspect the second instance and return to Default Kanban.

Run required npm run verify before implementation handoff. Record actual revision,
platform and results; design-only preparation does not claim runtime verification.

## Open questions

No blocking product question is identified in this proposal. Route/DTO names,
component extraction and drag geometry are implementation choices within the
contract. The execute-time positioning limitation is explicit; stronger stale-board
detection would require a separately agreed extension.

## Implementation and review outcome

Design reviewed and approved for implementation by the user on 2026-10-28.
Implemented the narrow Workspace-bound `POST /api/views/:id/moves` contract and
shared-operation adapter. Evaluation exposes the configured Blocked column ID;
CLI output, domain movement rules, SQLite schema 8 and coherent reads are unchanged.

View cards have separate drag handles, precise insertion gaps, append targets,
mouse/touch/keyboard sensors, destination announcements and a temporary overlay.
Keyboard arrows select columns/positions; Home/End reach first/last and Down past
last reaches append. Only required Blocked entry opens a reason-only dialog;
Waiting sends no extra context. Gesture/reason input queues refresh and guards
navigation. Completion refreshes authoritative data with distinct rejection,
unknown-outcome and confirmed-save/read-failure feedback. No automatic retry is
introduced. Detail and Default Kanban remain available through existing controls.

Added HTTP/SQLite rollback and execute-time ordering coverage, focused component
lifecycle/outcome tests and a browser journey for keyboard, pointer, required
reason cancellation/submission, dependency rejection, persistence and narrow touch.
Existing 0023/0024 acceptance, snapshot and transaction tests remain canonical.

Verification on 2026-10-28:

- Verified implementation revision: `4bd5a2219fe263dcfc24cc5d98031c1559bab4fe`.
  The subsequent handoff commit changes this record only.
- Platform: Windows NT 10.0.26300.0, PowerShell, Node.js 24.21.0, npm 11.4.1;
  browser tests use headless Chromium.
- Final standalone `npm run verify`: **passed**, exit 0. Typecheck, ESLint,
  Prettier, architecture checks and production build passed; 187 unit tests,
  248 integration tests, 36 acceptance scenarios / 204 steps, 27 CLI E2E tests
  and 10 browser journeys passed.
- Browser evidence includes pointer insertion, keyboard first/last ordering and
  immediate drop, Blocked reason cancel/submit, dependency-blocked rejection,
  CLI persistence/reload, independent instance organization, Default Kanban and
  detail compatibility, plus CDP-emulated held touch reorder on a horizontally
  scrolled 390px board. Inspected the narrow-board screenshot.
- Verification found and corrected keyboard sensor membership/measurement timing,
  detail focus restoration and stale-detail keyboard access. Regression tests also
  cover success/error from reads already in flight when touch activation freezes
  layout. Initial rollback test fixtures were corrected to snapshot their own
  deliberate trigger/Markdown changes before the rejected write.
- Sandbox process restrictions initially produced `spawn EPERM`; executable
  suites ran with approved escalation. One overlapping verification attempt hit
  two existing 5000ms CLI timeouts. The final standalone run passed unchanged
  timeouts; no checks were weakened or skipped.
- Limitations: Linux, physical touch hardware, manual long-column scrolling and
  an actual screen reader were not verified. Touch is automated Chromium
  emulation; these human interaction checks remain useful during review.

### Independent review and corrections

Independent review inspected PR #31 at
`29027cf3b7fd4e96e41a9b2d092e7e769350285b` against main at
`dbb72a9bf901b9dd68740ceba67001b02522f19b`. It identified three P2 findings:

- A ref-only submission flag did not render disabled controls. A reason-dialog
  Cancel or cancellation of a second drag could unlock navigation while the first
  POST was still pending. Chromium reproduced a move committing after Cancel and
  navigation away. Submission now has reactive control state plus synchronous
  guards; cancellation and late callbacks cannot unlock a pending write. The
  disabled reason dialog retains focus and traps Tab while submitting.
- A superseded post-move read was treated as a failed refresh, and the resulting
  static warning survived successful queued or manual refreshes. Mutation outcome
  is now stored separately from refresh feedback; current loading/error state
  determines the display notice and a successful refresh removes stale warnings.
- Home/End changed the selected slot without scrolling it into view in long
  columns. These jumps now scroll to the destination and use its updated viewport
  geometry. Arrow scrolling and immediate keyboard drops retain their behavior.

The user authorized these corrections, commit and push, without authorizing
completion, merge or release. Component regressions first reproduced the pending
control and superseded-read failures. New Chromium tests hold mutation responses
unfinished, check navigation/detail/gesture guards and dialog focus, then verify
the persisted result. A long-column journey checks both target visibility and
saved positions for End and Home. The existing browser journey remains intact.
HTTP rejection tests now assert exact statuses/codes alongside rollback snapshots;
client tests cover structured rejection and uncertain network/body/contract
failures with exactly one mutation request. Development guidelines record the
reactive-control and keyboard-visibility lessons.

Post-correction verification is recorded below after execution. Status and index
remain `in_progress`; human acceptance and completion are separate steps.

## Decision changes and follow-up

- 2026-10-28: User requested the next increment document for web View movement.
  Confirmed completed 0024 already includes same-column reorder and cross-column
  positional insertion; both are included in 0025.
- Keep Waiting moves free of mandatory prompts; collect input only when Blocked
  entry requires a manual reason. Existing detail editing handles waiting context.
- Preserve 0024's execute-time numeric positions instead of introducing a new
  board revision or before/after contract in the web adapter.

- 2026-10-28: User simplified web movement to drag and drop only, removing the
  separate Move form to reduce interaction and implementation complexity. Retain
  precise on-screen insertion, keyboard/touch dragging, Escape cancellation and
  the required Blocked-reason dialog. This removes numeric input in the browser,
  not precise placement; execute-time concurrency semantics remain unchanged.

- 2026-10-28: User reviewed and approved the updated drag-and-drop-only design
  for implementation. Increment and index marked `reviewed`; implementation and
  independent code review remain pending.
