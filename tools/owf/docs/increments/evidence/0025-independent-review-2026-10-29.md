# Independent review of increment 0025, 2026-10-29

Outcome at the reviewed revision: **three confirmed P2 findings were unresolved**.
The review phase made no implementation fixes, merge, release, commit or push.
Subsequent user-authorized corrections and their verification are recorded in the
[increment outcome](../0025-web-view-moves.md#authorized-independent-review-corrections-2026-10-29).
Increment status remains `in_progress`.

## Reviewed revision and scope

- Branch / PR: `increment-0025-web-view-moves`, PR #31 (open, draft).
- Reviewed HEAD: `41cd9b25115603b9a5410fefcd352bbeba3e5069`.
- Main / PR base: `dbb72a9bf901b9dd68740ceba67001b02522f19b`.
- Latest implementation change: `1b4c8351af98994902f4894228e0d98bab4f31d6`.
  HEAD adds documentation only. GitHub base/head were checked again before handoff.
- Read the applicable AGENTS.md, development guidelines, architecture, increment
  index, current 0025 brief, relevant 0023/0024 contracts, MVP scope and relevant
  Core / Operational Store sections. Reviewed the actual diff against main and
  the compact-card refinement separately. The implementation summary was not
  treated as proof of correctness.

## Confirmed findings

### R1 — P2: keyboard drop steals focus out of the required-reason dialog

Location: `src/web/ViewDragBoard.tsx:172` (default dnd-kit focus restoration),
with the card registered as activator at lines 446–448; reason dialog in
`src/web/ViewBoard.tsx:246`.

Reproduction: focus a View card, Space, arrows to Blocked, Home, Space. Wait one
animation frame, then press Escape without clicking/filling a dialog control.
The Reason textarea initially mounts with autofocus, but dnd-kit's keyboard-drop
restoration subsequently focuses the source article behind the dialog. Chromium
reported that article as `document.activeElement`, with `aria-disabled="true"`.
Escape leaves the dialog open because its handler never receives the key.
Tab can also navigate the background rather than starting inside the modal.

Impact: the required Blocked flow fails its keyboard focus/modal/Escape contract
(AC3, AC7). Existing browser tests call `.fill()` or `.click()` in the dialog,
which transfers focus and masks the initial-focus failure.

Recommendation: coordinate drag-end focus restoration with opening a modal, for
example by controlling dnd-kit restoration and explicitly focusing the reason
input after gesture teardown. Preserve ordinary drop/cancel focus behavior.
Regression: keyboard-only drop into Blocked; verify focus stays inside the dialog
after the restoration frame, Tab/Shift+Tab remain inside, and Escape cancels
without any move request.

### R2 — P2: focus restoration selects a hidden Default Kanban card

Location: `src/web/ViewBoard.tsx:49–54`, especially the document-wide query at
line 52.

Reproduction A: let Default Kanban load its cards before selecting a View. Open
the required-reason dialog, focus Reason, make the cancellation refresh return
503, and cancel with Escape. Focus is not restored to the visible source card.
The global query finds its hidden Default Kanban counterpart first; calling
`focus()` on that hidden node fails, and the Refresh fallback is not selected.
The data-dependent recovery effect cannot repair this when refresh fails.

Reproduction B: with the same preloaded Default Kanban, hold a same-column move
POST unfinished, Tab from A to B, then release the response. A is correctly saved
at the requested position, but focus remains on B instead of returning to A.
This reproduction uses actual keyboard Tab, not a synthetic focus event.

Impact: completion/cancellation can lose the expected focus or leave it on an
unrelated card; failure recovery violates AC6/AC7. This bug is in the full 0025
diff, although the helper predates the latest refinement.

Recommendation: resolve cards within the current View board ref, with a visible
Refresh/board fallback, independently of successful data refresh. Regression:
retain duplicate hidden Default Kanban cards, test reason cancellation plus failed
refresh, and test completion after tabbing during a pending write.

### R3 — P2: a deferred text click opens detail during another card's selection

Location: `src/web/ViewDragBoard.tsx:534–536`; timer cancellation at lines 455–456
only sees pointer-down events inside the same card.

Reproduction: single-click the actual title text of A. Within 100ms, mouse-down
on the title text of another card, hold for 450ms, then drag across that text and
release. A's 400ms timer survives the second card's pointer-down. While the new
selection is still collapsed at its starting point, the timer opens A's detail
and moves focus to its Title input. Chromium's failure snapshot confirms the
unexpected dialog is editing A.

Impact: an in-progress native text-selection gesture is interrupted by an
unrelated detail opening, violating AC7b. The existing selection test starts
with no pending click, so it does not cover this cross-card timer race.

Recommendation: invalidate a deferred text-click action whenever a newer gesture
starts anywhere in the board (or use shared interaction ownership), and ensure
an older callback cannot open detail during that gesture. Regression: the exact
cross-card click/hold/selection sequence, asserting no dialog, no move request
and a successful native selection/copy after release.

## Verification performed by this reviewer

Platform: Windows NT / PowerShell, Node.js 24.21.0, Chromium through Playwright;
touch cases use CDP emulation. Production assets were rebuilt from reviewed HEAD.
Build/browser execution needed approved escalation after sandbox `spawn EPERM`.

- `npm run build`: passed.
- `npm run test:browser -- view-move-interaction.spec.ts`: **7/7 passed**.
  Real mouse, keyboard, clipboard and emulated touch input cover compact resting
  cards, removal of the three visible controls, stable card rectangles/one thin
  indicator, precise up/down and cross-column insertion, empty targets, explicit
  last versus append request semantics, persisted order, selection/copy,
  click/cancel/control separation, announcements, pending-write guards,
  horizontal/vertical touch scrolling and long-column keyboard/pointer targets.
- `npm run test:browser -- view-move.spec.ts views.spec.ts
--output=test-results-review-compatibility`: **3/3 passed** on the fresh build.
  Includes CLI/browser persistence, Blocked cancellation/submission and rejected
  dependency exit, independent instances, narrow touch reorder, Default Kanban
  operations and shared detail editing at desktop and narrow widths.
- `npx vitest run src/web/ViewBoard.test.tsx src/web/client.test.ts
tests/integration/view-http.test.ts`: **28/28 passed**. Includes queued/superseded
  refreshes, duplicate submission, honest failure outcomes, current-position HTTP
  behavior, reason validation and rollback snapshots.
- Five independent browser probes, repeated twice: **8 expected failures and
  2 passes**. Four probes reproduce R1, R2 (two distinct paths) and R3, each twice;
  the fifth verifies visible keyboard insertion into a horizontally clipped
  column and persistence, and passes twice. Failed assertions are evidence of
  unresolved implementation defects, not a passing regression suite.
- `git diff --check`: passed before review documentation was added.

The [archived reproduction source](0025-review-reproduction.spec.ts.txt) is kept
outside test discovery. To rerun, copy it to `tests/e2e/review-0025.spec.ts` under
`tools/owf`, then run `npm run test:browser -- review-0025.spec.ts --repeat-each=2`.
Remove the temporary copy afterwards. The source uses disposable Workspaces only.
Raw failure screenshots/traces remain locally under
`tools/owf/.test-artifacts/0025-independent-review/reproductions/` (gitignored).

## Reused evidence, test assessment and limits

The recorded full `npm run verify` for implementation revision `1b4c835` is reused
for unchanged code: types, lint, formatting, architecture, 194 unit/component,
248 integration, 36 acceptance scenarios / 204 steps, 27 CLI E2E and 17 browser
journeys. These totals are the implementer's recorded results, not a full suite
personally rerun by this reviewer. The only commit after that implementation
revision changes the increment verification record. Full verify was not repeated.

No additional defect was confirmed in the shared 0023/0024 operation boundary,
atomicity, no-op/position semantics, Waiting/Blocked effects, navigation guards,
duplicate-write prevention or outcome/refresh handling. The HTTP adapter calls
the existing transaction; the latest UX change does not change domain, storage,
schema or HTTP movement semantics. Relevant original assertions were retained
when handles/buttons were removed; new tests assert requests, saved order, native
selection/clipboard and geometry, not only DOM structure. Component tests mock
ViewDragBoard and cannot establish native focus/gesture correctness, as the
confirmed browser failures demonstrate.

Limits: no physical touch device/native OS selection handles, actual screen
reader, Linux or non-Chromium browser was verified. Touch long-press coverage
establishes no drag/detail activation in emulation, not full native mobile text
selection UI. No interactive headed human session was performed; browser
interaction evidence is automated real Chromium input, not screenshot inference.
Physical-device selection and long-distance touch dragging remain verification
limits, not confirmed defects. No separate optional change is required by this
review.
