# 0030 — Quiet web operation feedback

> Status: in_progress
> Description: Remove visible success confirmations and show operation failures as temporary, dismissible notifications without shifting board layout.
> Depends on: [0028 — Create and delete Actions in web Views](0028-web-action-create-delete.md).

Scope and direction agreed on 2026-10-30. The user reviewed and approved this
document for implementation on 2026-10-30. Implementation is in progress; independent code
review is pending. Increment 0029 is completed and merged into main;
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

| Situation                                                         | Required presentation                                                                                                                         |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Invalid form input, such as blank title or manual blocking reason | Keep validation next to the relevant form/input until corrected or the form is closed; do not auto-dismiss it.                                |
| Rejected or failed mutation                                       | Temporary error notification; preserve draft, confirmed data and existing retry/recovery rules.                                               |
| Confirmed mutation followed by failed refresh                     | Temporary refresh-error notification explaining that the write completed and must not be repeated merely because refresh failed.              |
| Uncertain mutation result                                         | Temporary error notification explaining uncertainty; preserve reconciliation and guards against unsafe repetition.                            |
| Unavailable or stale board/View/inventory                         | Temporary detailed error notification plus compact persistent availability/freshness state and existing Retry/Refresh control until recovery. |

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

Original frontend implementation/test revision: `8e7237597131eaeaae761eebdadaffe97ccd8139`.
Independent code review is pending; the increment and index remain `in_progress`.

### Delivered behavior

- Successful creation, editing, deletion, state changes, View moves and reorders
  are silent. Confirmed snapshots, membership reads, ordering, focus restoration,
  draft protection and screen-reader drag announcements remain in place (AC1, AC7).
- One shared frontend notification owner displays contextual errors outside board
  flow. Native editor/deletion dialogs and the View reason dialog register the
  active notification surface. The close control is named and keyboard reachable;
  dismissal restores focus within the active surface without scrolling (AC2, AC4–AC5).
- Each error event receives eight seconds, including identical repeated failures.
  Hover/focus pause the remaining time; replacement, dismissal and unmount cancel
  the old timer. Dismissing while hovered resets that interaction state for the
  next error. Explicit attempts/navigation clear old feedback, superseded reads
  cannot publish errors, and unchanged background failures do not renew it (AC3, AC5).
- Field validation stays beside its input. Compact refresh/inventory state and
  existing editor recovery controls outlive notifications. Unconfirmed Default
  Kanban movement retains a compact condition and prevents another move until a
  successful read. Creation uncertainty retains an inspection reminder. Confirmed
  write context survives queued/superseded reads, so a failed refresh explicitly
  says the write completed and must not be repeated (AC6–AC7).
- The web README explains the feedback policy. No domain, HTTP contract, CLI,
  store, schema, migration, dependency or release behavior changes.

### CLI test split and follow-up verification

After the initial handoff, the user approved splitting the timing-sensitive CLI
deletion test. This is a test-organization follow-up; production behavior and all
existing timeout settings remain unchanged.

Test revision: `460991b5ac4daf053b1cbb65418359b55745e0c6`.

The former combined rejection case is now five independently reported cases:
incoming-reference refusal and recovery; invalid Action arguments; invalid View
arguments; missing identities; and repeated deletion. Each has an isolated
Workspace. The populated Action/dependency fixture and all exit-code, error-output
and filesystem/SQLite preservation assertions are retained, including surviving
Action data in the repeated-deletion case. The original successful-deletion
journey is unchanged. No test is disabled and no assertion, timeout or retry gate
was relaxed.

Focused verification on the same Windows/Node/npm platform below:
`npm run typecheck`, `npm run lint` and
`npx vitest run tests/e2e/delete-cli.test.ts --reporter=verbose` passed. All six
cases in the file passed; the five new cases took 0.81–1.73 seconds each in that
run, while the unchanged successful-deletion case took 2.61 seconds.

The full **`npm run verify` passed, exit 0**, against that committed revision on
Windows x64, Node 24.21.0, npm 11.4.1 and headless Chromium:

| Check                                                          | Actual result                   |
| -------------------------------------------------------------- | ------------------------------- |
| Typecheck, ESLint, Prettier, architecture and production build | Passed                          |
| Unit/component                                                 | 213 tests passed                |
| Integration                                                    | 291 tests passed                |
| Acceptance                                                     | 40 scenarios / 222 steps passed |
| Built CLI end-to-end                                           | 36 tests passed, five files     |
| Chromium end-to-end                                            | 31 tests passed                 |

The aggregate command now reaches and passes Chromium, resolving the initial
handoff's CLI timeout limitation in this run. The CLI count increased from 32 to
36 because one combined test became five focused tests. The full log is retained
in [verification-after-cli-split-windows.txt](evidence/0030/verification-after-cli-split-windows.txt).
The earlier failed-run log and results below remain historical evidence.
Only documentation/evidence changes follow this verified revision; their
formatting and `git diff --check` are checked separately. Independent code review
is still pending, and the increment/index remain `in_progress`.

### Confirmed-move refresh repair on 2026-10-31

The user reported a failing `npm run verify` after revision
`cd64869fcf312d66f301edd3c8fa0cf0817df9ff`. The failure was reproduced in the
component regression for a confirmed filtered move with an older read still
pending. The move's refresh was incorrectly coalesced behind that read, delaying
the post-write snapshot and its failure feedback.

`useBoard` now starts a new snapshot immediately when a refresh carries confirmed
write context. Ordinary automatic refreshes still coalesce, and superseded
responses still cannot replace confirmed data or publish stale errors. The
existing regression now explicitly checks that the new read starts before the
older read finishes and that its failure identifies the completed move and warns
against repeating the write (AC6–AC7).

Focused verification: `npx vitest run src/web/Board.test.tsx
src/web/Notifications.test.tsx` passed all 38 tests. Local diff review checked
request supersession, retained write context and unchanged background-refresh
coalescing. This repair does not complete the pending independent review of the
whole increment; its status and index remain `in_progress`.

Full `npm run verify` passed with exit 0 on Windows x64, Node 24.21.0,
npm 11.4.1 and headless Chromium against that base revision plus this repair.
Typecheck, ESLint, formatting, architecture and production build passed, as did
213 unit/component tests, 291 integration tests, 40 acceptance scenarios / 222
steps, 36 CLI end-to-end tests and 31 Chromium tests. Vite encountered sandbox
`spawn EPERM` during the first post-fix aggregate attempt; the successful full
run used execution outside that sandbox. The complete successful log is retained
in [verification-refresh-fix-windows.txt](evidence/0030/verification-refresh-fix-windows.txt).
Only documentation/evidence updates follow this verification; their formatting
and `git diff --check` are checked separately. Linux was not tested.

### Initial handoff verification on 2026-10-31

Platform: Windows x64 (NT 10.0.26300), PowerShell 7.6.9, Node 24.21.0,
npm 11.4.1, Playwright 1.63.0 with headless Chromium. Vite/Playwright initially
encountered sandbox `spawn EPERM`; actual build/test runs used execution outside
that sandbox.

At the initial handoff, `npm run verify` exited **1** in the unchanged CLI deletion test:
its second case took 5.12 seconds against the existing five-second timeout.
All preceding gates passed. The aggregate command therefore did not reach
Chromium; `npm run test:browser` was run separately against this revision.
That initial aggregate verification gate was **not green**; this is historical
evidence, separate from the follow-up result above. The separate complete Chromium
run exited **0** with all **31 tests passed**. Raw results are retained in
[verification-windows.txt](evidence/0030/verification-windows.txt) and
[browser-windows.txt](evidence/0030/browser-windows.txt).

| Check                                                          | Actual result                       |
| -------------------------------------------------------------- | ----------------------------------- |
| Typecheck, ESLint, Prettier, architecture and production build | Passed                              |
| Unit/component (`npm test`)                                    | 213 tests passed, 15 files          |
| SQLite/HTTP/proxy integration                                  | 291 tests passed, 18 files          |
| Acceptance                                                     | 40 scenarios / 222 steps passed     |
| Built CLI end-to-end                                           | 31 passed / 1 timed out; five files |
| Chromium end-to-end (`npm run test:browser`, separate run)     | 31 tests passed                     |

Focused checks also ran: `npx vitest run src/web/Notifications.test.tsx` passed
all six lifetime/interaction/read-feedback tests, and
`npm run test:browser -- quiet-feedback.spec.ts` passed both journeys at
1920 × 1080 and 390 × 844. The latter checks persisted movement followed by
editing in both modes, absence of accumulated success feedback, creation/edit
failures, board geometry, page/editor scroll, modal layering, keyboard dismissal,
focus restoration, persistent field validation, and confirmed writes followed by
failed reads. Existing browser journeys retain creation/deletion, View ordering,
blocking, draft and focus checks, including layout at 1280 × 600.

Intermediate attempts exposed test type/lint/format errors and old browser
assertions locating operation errors inside cards/status rows or validation at
the editor bottom. Those assertions now require the shared alert and validation
beside its input; existing persistence and interaction checks remain. The new
consecutive-operation journey waits for drag activation and post-drop cleanup,
then checks persisted state/placement before editing, avoiding a false-positive
gesture. No checks were skipped, automatic retries added or existing timeouts
increased.

Earlier development runs also hit unchanged five-second CLI timeouts in
`delete-cli.test.ts` and the Action round-trip case in `cli.test.ts`. Another
earlier aggregate CLI phase passed all 32 tests with the same timeouts; that is
historical evidence, not a passing result for the final aggregate command. One focused
Chromium run closed unexpectedly during screenshot capture; its unchanged rerun
passed. These observed timing/process limitations are retained as handoff evidence.

### Visual evidence and try-out

The focused journeys use controlled HTTP failures in disposable Workspaces;
Workspace corruption is unnecessary. Representative screenshots were inspected
and retained:

- [Default Kanban, wide error](evidence/0030/default-wide-error.png)
- [Default editor, wide error](evidence/0030/default-wide-editor-error.png)
- [View, narrow error](evidence/0030/view-narrow-error.png)
- [View editor, narrow error](evidence/0030/view-narrow-editor-error.png)

The screenshots show wrapping text and usable close controls, floating feedback
without inserted board rows, and a notification within the active native dialog.
Automated geometry/scroll assertions complement this visual inspection.

To try the UI, build in `tools/owf`, run `owf serve` (or the built CLI by absolute
path) from an initialized Workspace and open `http://127.0.0.1:4317`. Move then edit
an Action in a View; create/delete in both modes and observe silent success.
For controlled errors run `npm run test:browser -- quiet-feedback.spec.ts` from
`tools/owf` after building.

### Deviations, limitations and review state

The initial handoff's CLI timeout limitation is resolved by the user-authorized
test split and passing full verification recorded above. The original failed-run
evidence remains available for history. No verification failure remains in this
final run; independent code review is pending.

No substantive scope or design deviation was required. No new domain acceptance
scenarios or generated Workspace guidance changes were needed for this frontend
policy. Linux, other browser engines and an actual screen-reader session were
not tested. Keyboard/live-region behavior is covered through component and
Chromium checks; no human try-out or independent code review is claimed.

No unresolved frontend failure was observed in the final component/browser
checks. Documentation/evidence updates follow their verified source revisions;
their formatting and `git diff --check` are checked separately.

Independent review is the next step. The increment remains `in_progress`; it has
not been marked completed, merged or released.

## Decision changes and follow-up

The user approved the CLI deletion test split after the initial handoff, to keep
its distinct safety checks within independently reported cases rather than
disabling them or increasing timeouts. This changes test organization only.

This increment replaces persistent visible operation confirmations with silent
success and temporary errors. Field validation, loading state and persistent
recovery conditions retain their separate roles.
