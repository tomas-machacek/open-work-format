# 0025 — Move and reorder Actions in web Views

> Status: completed
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

| Interaction                                             | Requested behavior                              |
| ------------------------------------------------------- | ----------------------------------------------- |
| Drop at the indicated insertion boundary                | Send its final one-based position.              |
| Drop on an empty column                                 | Insert at position 1.                           |
| Drop in free content below the final insertion boundary | Omit position; cross-column arrival appends.    |
| Same-column drop at the current position                | Successful no-op.                               |
| Same-column move with position omitted                  | Successful no-op, preserving CLI compatibility. |
| Cancel drag, Escape, or release outside a valid target  | No request and no write.                        |

Keep the resting board compact with ordinary small card gaps and no visible
insertion/append boxes or labels. During a gesture show only the selected boundary
as a thin line; larger invisible activation areas must not shift card geometry
or make the target oscillate. Support before-first, middle and explicit last
positions within/across columns. The natural empty-column content accepts position
1 with a subtle highlight; free content below the last boundary accepts append
without a separate box/button. Distinguish explicit last insertion from append by
indicator location and accessible announcements, retaining their different request
semantics. Use the existing dnd-kit integration.

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
remains available: dropping at a boundary before, between or after cards
selects that exact insertion position, both within and across columns. The UI
translates the chosen slot into the final one-based position specified above.
Numeric position entry remains available through CLI.

Support pointer, touch and keyboard dragging through the existing dnd-kit
integration. Keyboard users must be able to pick up a card, select a destination
column and insertion slot, drop, or cancel with Escape. All supported positions,
including first/last and empty-column insertion, must be reachable without a mouse.
Provide concise instructions and announce the current destination and position.

Remove the visible Move card button. Drag from any nontext, noninteractive card
background/padding with a reasonable activation threshold; no mandatory small
handle replaces it. Text remains natively selectable/copyable and gestures begun
on text or interactive controls never activate dragging. Do not apply blanket
user-select suppression or intercept normal copying. Ordinary click still opens
detail; selection completion, drop and cancellation must never open it. Focus the
card directly: Enter opens detail, Space picks up/drops, arrows select destinations,
Home/End choose first/last, Down past last chooses append, Escape cancels. Preserve
focus restoration, reader instructions/announcements and actual-state labels.

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
- **AC7a — Compact and stable geometry:** No visible Insert at N, Append to column
  or Move card controls in the resting board; ordinary compact gaps. Only the
  current destination is indicated during dragging, with generous invisible hit
  areas and no layout shift/target oscillation. Empty content accepts explicit 1;
  explicit last and free-area append keep their distinct semantics.
- **AC7b — Gesture intent:** Background/padding starts a drag after the activation
  threshold. Text gestures select/copy normally without moving or opening detail;
  controls never start drag. Click opens detail, Enter opens detail, Space moves.
  Dropping, Escape, outside release and finishing selection do not open detail.
  Touch hold-to-drag coexists with scrolling and native text selection; keyboard
  destinations, focus and announcements remain available without a visible handle.
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

| Risk / criteria                          | Verification                                                                                                                                                                                                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP parity and atomicity (AC1–AC4)      | Real HTTP/application/SQLite cases for positional move, required reason, invalid position, rejected exit, required broken definition and rollback; compare persisted results/events with shared-operation semantics.                                                          |
| Execute-time positioning (AC5)           | Commit a CLI reorder/arrival after the displayed read and before HTTP move; verify current-index behavior and a separate now-invalid bound.                                                                                                                                   |
| UI races and outcome reporting (AC5–AC6) | Focused component cases for queued refresh, navigation guards, duplicate submission, late responses, rejected move, committed move/read failure and unknown transport outcome without retry.                                                                                  |
| Main user flow (AC1–AC3, AC7–AC8)        | Small Playwright journey for pointer reorder/cross-column insertion, keyboard dragging, Blocked reason cancellation/submission and rejected exit; inspect CLI order after browser operations.                                                                                 |
| Compatibility and persistence (AC8)      | Refresh/reselect/reload, second-instance independence and return to Default Kanban with existing operations; reuse existing snapshot/purity tests and add new read/preview boundaries where needed.                                                                           |
| Interaction quality (AC7, AC7a–b)        | Real Chromium gestures for wide/narrow boards, empty/long columns, first/middle/last and append, background vs text selection/copy, click/detail/cancel separation, keyboard focus/announcements and touch scrolling. Inspect resting/active screenshots and stable geometry. |

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

Completed with user acceptance on 2026-10-29 after implementation, independent
review, corrections and the final reason-dialog refinement. The user authorized
merging PR #31. The dated entries below retain the actual verification history,
including the occupied-port limitation on the final refinement's full verify run;
closure does not claim a new successful full run.

Design reviewed and approved for implementation by the user on 2026-10-28.
Implemented the narrow Workspace-bound `POST /api/views/:id/moves` contract and
shared-operation adapter. Evaluation exposes the configured Blocked column ID;
CLI output, domain movement rules, SQLite schema 8 and coherent reads are unchanged.

The initial implementation used separate drag handles, labelled insertion gaps and append targets,
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

Post-correction verification, 2026-10-28:

- Verified revision: `75e146a9cfa78f721280017c8aa7836f34ef8766`. The subsequent
  evidence commit changes this document only.
- Platform: Windows NT 10.0.26300.0, PowerShell, Node.js 24.21.0, npm 11.4.1,
  headless Chromium. Executable build/browser checks ran outside the sandbox
  because of its known process restrictions.
- Final standalone `npm run verify`: **passed, exit 0**. Typecheck, ESLint,
  Prettier, architecture (61 modules / 201 dependencies), production build,
  194 unit/component tests, 248 integration tests, 36 acceptance scenarios /
  204 steps, 27 CLI E2E tests and 13 Chromium journeys passed.
- Focused checks included the component/HTTP/client regressions and the original
  View journey. All three new browser journeys also passed five consecutive
  repetitions (15/15) before the final full verification.
- Initial correction checks exposed lint issues in new test callbacks/matchers
  and a keyboard pickup synchronization race in the new browser test. Keyboard
  tests now wait for the initial insertion indicator, not only `aria-pressed`,
  before navigation keys. The assertions, timeouts and lint rules were retained;
  the complete verification was rerun after correction.
- The three reported P2 findings are addressed with regression evidence. Linux,
  physical touch hardware, manual long-column touch scrolling and an actual
  screen reader remain unverified. Existing automated narrow touch coverage
  passed in the final browser suite.

Status and index remain `in_progress`; human acceptance and completion are
separate steps. No merge or release is included.

### Approved compact-card UX refinement, 2026-10-29

The user approved this refinement within 0025 and explicitly retained `in_progress`.
It replaces visible movement controls with background/padding activation and
invisible insertion regions. Only the selected thin boundary or empty-content
highlight appears while dragging. Natural free content supports append; explicit
last insertion remains a different request. Card dimensions and target geometry
stay fixed during a gesture. Native text selection/copy, ordinary click detail,
keyboard movement, cancellation, focus and announcements remain required.

Delivered behavior:

- Cards retain their normal dimensions and 12px gaps throughout a gesture. The
  source stays in place as a faded placeholder; the overlay includes the same
  content. A 2px line marks explicit insertion, with half-card activation areas;
  empty content highlights gently and free content below the final boundary uses
  append. Indicators and hit testing share stable viewport geometry, including
  scrolling and immediate release. Header/gutters outside the board reject drops.
- Mouse activation uses 6px movement; touch uses a 200ms hold with 8px tolerance.
  Text-range hit testing excludes native text and controls without suppressing
  selection or copying. Text clicks wait 400ms to permit double-click word
  selection. Long text holds, selection completion, drag/cancel and embedded
  controls cannot open detail. Background click and Enter retain detail access,
  including stale read-only detail; pending operations keep navigation locked.
- The card itself receives keyboard focus and screen-reader instructions. Space
  starts/drops, Enter opens detail, arrows/Home/End/Escape retain precise movement
  and cancellation. Focus returns to the card. No visible movement button, new
  movement form, backend/domain operation, schema or dependency is introduced.

The existing lifecycle tests and original CLI/browser journey are retained and
adapted to card activation. Additional real Chromium journeys cover pointer
first/middle/last insertion in both directions, empty-column and cross-column
moves, explicit-last versus append request/persistence semantics, unchanged card
rectangles and a single stable indicator, native drag-selection/double-click and
Ctrl+C/clipboard roundtrip, below-threshold click, Escape/outside/gutter cancellation,
embedded controls, keyboard announcements/focus, touch horizontal/vertical scrolling
and text holds, held touch reorder, plus long-column keyboard/pointer scrolling.

Verification on 2026-10-29:

- Verified implementation revision: `1b4c8351af98994902f4894228e0d98bab4f31d6`.
  The following evidence commit changes documentation only. Historical results
  above describe their recorded revisions, not this refinement.
- Platform: Windows NT 10.0.26300.0 / PowerShell / Node.js 24.21.0 / npm 11.4.1;
  real input dispatched in headless Chromium, including CDP touch emulation.
- Final `npm run verify`: **passed, exit 0**. Typecheck, ESLint, Prettier,
  architecture (61 modules / 201 dependencies), production build, 194 unit/component
  tests, 248 integration tests, 36 acceptance scenarios / 204 steps, 27 CLI E2E
  tests and **17 Chromium journeys** passed. The four added journeys extend the
  original 13; existing functional checks were retained. A final format check,
  focused lint of the updated View-display assertion and `git diff --check` passed.
- The focused eight View/interaction browser journeys also passed before the final
  full run. Browser tests assert persisted order through the real shared operation,
  request position/omission semantics, native text/clipboard behavior and actual
  viewport geometry, not just DOM control presence.
- Visually inspected the final [resting board](evidence/0025-resting-board.png)
  and [active drag](evidence/0025-active-drag.png), both at 1280×1200. Active capture
  keeps the viewport fixed so screenshot resizing does not cancel the gesture.
  Cards retain 12px gaps and identical rectangles; the sole active line is 2px high.
- Initial checks exposed immediate-release collision timing, a synthesized click
  after a touch text hold, and an overbroad disabled guard that blocked stale
  read-only detail. These were corrected and regression-checked. Tests relying on
  removed handles/old article semantics and browser geometry in jsdom were adapted
  without removing their functional assertions. Sandbox `spawn EPERM` required
  approved execution outside the sandbox for build/executable suites.
- Self-review checked the diff against AC1–AC8 and AC7a–b, including cancellation,
  clipped/outside targets, read-only detail, focus and unchanged domain/HTTP
  boundaries. No additional independent review of this refinement was performed
  in this session; the earlier independent review applies to its cited revision.
- Limitations: physical touch hardware/native OS selection handles, an actual
  screen reader and Linux were not verified. Touch evidence is Chromium emulation;
  desktop selection/copy, live announcements, keyboard focus, long-column pointer
  scrolling and touch vertical/horizontal scrolling were exercised in the browser.

Status and index remain `in_progress`; human visual acceptance is pending. The PR
stays draft. No merge, tag or release is included.

### Independent review of compact-card refinement, 2026-10-29

Reviewed PR #31 at `41cd9b25115603b9a5410fefcd352bbeba3e5069` against main
`dbb72a9bf901b9dd68740ceba67001b02522f19b`, including the actual refinement diff
in `1b4c835`. At that revision, three confirmed P2 findings were unresolved: keyboard-drop focus
escapes the required-reason dialog, global focus restoration can select a hidden
Default Kanban card, and a deferred text click can interrupt another card's text
selection. The independent browser reproductions confirm all three twice.

The reviewer personally rebuilt HEAD, passed the seven interaction and three
original compatibility browser journeys, and passed 28 focused component/client/
HTTP tests. Full verify was not repeated; applicable recorded results for unchanged
code were reused. See the [independent report and reproduction evidence](evidence/0025-independent-review-2026-10-29.md)
for locations, scenarios, impact, recommended corrections/tests and verification
limits. This review makes no implementation correction. Status and index remain
`in_progress`; no merge or release is included.

### Authorized independent-review corrections, 2026-10-29

The user authorized correcting the three findings, committing and pushing the
branch while retaining `in_progress`. Drag focus restoration is now owned by
ViewBoard, so keyboard drop cannot override the required-reason dialog's focus.
Card lookup is scoped to the active View for completion, cancellation and detail
closure, including failed-refresh recovery with retained hidden Default cards.
Deferred text clicks check a board gesture version, so another card's new pointer
or keyboard gesture invalidates the older callback without intercepting selection.

Four permanent browser regressions first failed on the reviewed frontend at the
reported boundaries. They cover initial reason-dialog focus and Tab/Escape without
prior input interaction, cancellation plus failed refresh, focus after Tab during
a pending write, and cross-card selection with a real clipboard roundtrip. The
existing interaction fixture now waits for Default Kanban cards to load before
switching, retaining hidden duplicates during the tests. Typecheck, focused lint,
build and all 11 interaction browser tests passed on the corrected working tree.

Post-correction verification, 2026-10-29:

- Verified implementation revision: `9ac9ae5ccba919d0d369c7fcec9c017e3cbb5ddb`.
  The following evidence commit changes documentation only.
- Platform: Windows NT 10.0.26300.0 / PowerShell / Node.js 24.21.0 / npm 11.4.1;
  browser execution uses headless Chromium and CDP touch emulation.
- Final standalone `npm run verify`: **passed, exit 0**. Typecheck, ESLint,
  Prettier, architecture (61 modules / 201 dependencies), production build,
  194 unit/component tests, 248 integration tests, 36 acceptance scenarios /
  204 steps, 27 CLI E2E tests and **21 Chromium journeys** passed.
- All four new browser regressions failed on the reviewed frontend before the
  corrected build, then passed in the focused 11-test run and final full suite.
  The assertions check modal focus after drag cleanup, Tab/Escape, no-write
  cancellation, active-surface focus with hidden duplicates, persisted ordering,
  and native cross-card selection/clipboard behavior.
- An initial full verification stopped at the proxy integration test because an
  existing OWF server occupied port 4317. The server exited before the guarded
  stop command could act; no existing server was stopped by this task. The final
  standalone run passed after the port became free. No checks, assertions or
  timeouts were weakened. Build/browser execution used approved escalation after
  sandbox `spawn EPERM`.
- The three P2 findings are addressed. Physical touch hardware/native OS selection
  handles, an actual screen reader, non-Chromium browsers and Linux remain
  unverified; the browser evidence covers emulated touch and actual desktop input.

Status and index remain `in_progress`; PR #31 remains draft. No merge, tag or
release is included.

### Authorized reason-dialog visual refinement, 2026-10-29

The user requested removing the redundant "Reason" label below "Manual blocking
reason", matching the dialog buttons to the app and separating them. This is a
visual refinement of the required-reason dialog under AC3 and AC7, within 0025;
movement semantics and the increment's `in_progress` status remain unchanged.

Acceptance: show one visible heading, retain an accessible name for the textarea,
reuse the shared primary/secondary button styles and wrapping button gap, and
keep input, keyboard focus, pending-write protection, confirmation and cancellation
working at desktop and narrow widths. The supplied root `reason-window.png` is
reference material only and must not be committed.

The textarea now uses the heading as its accessible label, with four rows and
space below the heading. Confirm move and Cancel use the existing shared form
button group, including its 8px gap and narrow-screen touch sizing. Existing
component/browser selectors follow the field's descriptive accessible name.

Verification and review, 2026-10-29 (working-tree refinement over
`64172a782fae700afa5551b4a73237c8a5fcc7cf`):

- Windows NT 10.0.26300.0 / PowerShell / Node.js 24.21.0 / npm 11.4.1;
  headless Chromium. The nine focused ViewBoard tests and the original View move
  browser journey passed. Inspected actual dialog captures at 1440px and 390px
  viewport widths; the heading, textarea and separated buttons fit cleanly.
  Capture instrumentation was temporary and removed before full verification.
- `npm run verify` passed typecheck, ESLint, formatting, architecture, production
  build and all 194 unit/component tests. Integration finished with 247 passing
  tests and one environment failure: `board-proxy.test.ts` could not bind port
  4317 because an existing `node .../dist/bootstrap/cli.js serve` process used it.
  That server was left running. Full verify therefore did **not** pass.
- Separately, all 36 acceptance scenarios / 204 steps and `npm run test:e2e`
  passed: 27 CLI tests and all 21 Chromium journeys, including the existing
  reason-dialog focus, Tab/Escape, pending-write and no-write cancellation cases.
- Final focused Prettier check and `git diff --check` passed after this evidence
  update. No assertions, checks or timeouts were weakened.
- Independent review read the actual diff against the request and AC3/AC7:
  no findings. It checked accessible naming, shared CSS, focus trapping,
  pending-write guards, cancellation, narrow layout and retained test assertions.
  It reused executed tests rather than rerunning them. `git diff --check` passed.
- Initial sandbox test/build attempts hit `spawn EPERM`; executable checks ran
  with approved escalation. Physical touch hardware, an actual screen reader,
  non-Chromium browsers and Linux were not checked for this visual refinement.

The user accepted the visual result and requested committing and pushing this
refinement. Status and index remain `in_progress`; the supplied screenshot remains
untracked. No merge, tag or release is included.

## Decision changes and follow-up

- 2026-10-29: User approved compact resting cards, invisible generous drop regions,
  one stable insertion indicator, natural empty/append content and background drag
  without visible handles. Text selection/copy and interactive controls are
  excluded from activation. Enter opens detail, Space moves; touch scrolling,
  cancellation, focus and announcements remain required. AC7a–b record this
  refinement; movement semantics and all earlier acceptance criteria remain intact.

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

- 2026-10-29: User accepted the final result, confirmed all changes were pushed,
  and authorized completion and merge of PR #31 into main. Increment and index
  marked `completed`. Final implementation/refinement head before this
  documentation-only closure: `46c16c9765065c9fed830f46a62bb78d839ae2cc`.
  Existing review and verification evidence is reused; the final refinement's
  full verify remained blocked by occupied port 4317 in one proxy integration
  test, while its other recorded checks and all CLI/browser E2E passed.
  No release is created by this closure.
