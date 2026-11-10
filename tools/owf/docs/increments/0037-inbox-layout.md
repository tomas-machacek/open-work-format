# 0037 — Inbox layout and reclaimed board space

> Status: completed
> Description: Place Inbox on the left and reclaim the full board width when its item list is hidden, while keeping capture available.
> Depends on: [0036 — Inbox in the web interface](0036-web-inbox.md).

## Goal and scope

Improve the web Inbox layout introduced in 0036. Currently, the desktop layout
reserves a fixed right-hand column even when its item list is hidden. Hiding the
list therefore does not increase the space available to a selected View or
Default Kanban.

Move the expanded Inbox to the left. When the list is hidden, remove the side
column and give the work surface the full available width. Capture remains
visible and usable in both states.

Included: Workspace composition, responsive layout, preservation of existing
state and focused layout regression checks. This increment changes the desktop
right-panel decision from 0036; its other Inbox behavior remains authoritative.

Deferred: resizing or choosing the panel side, new visibility settings, rich
text, Inbox conversion, drag and drop between Inbox and boards, and changes to
Inbox operations, ordering or persistence.

## Proposed solution

### Expanded and collapsed layouts

On wide screens with the list shown, place a visibly separate Inbox panel on the
left: heading, visibility control and capture form above the independently
scrollable item list. Default Kanban or the selected View occupies the remaining
space on the right.

When the list is hidden, remove the reserved side column entirely. Keep a compact
capture strip above the work surface, containing the capture field, submission
and show-list controls, with existing refresh/recovery controls reachable.
The work surface spans the full available width below this strip; do not retain
a blank panel, spacer or fixed side margin.

Keep capture and the visibility control visible while the work surface scrolls.
The strip must not cover board content or controls. Keep enough room for
multiline input and necessary validation/recovery messages; compactness must not
make these controls inaccessible.

On narrow screens retain the stacked arrangement, with Inbox above the work
surface. Hiding the list releases its vertical space to the work surface.
Support short landscape viewports as well as portrait screens without overlap
or unreachable controls. Board columns remain side by side with horizontal
scrolling, following [0026](0026-web-layout-cleanup.md).

### State, access and integration

Coordinate visibility with Workspace layout rather than only hiding list
contents inside a fixed-width panel. Start from Workspace.tsx, Inbox.tsx,
Inbox.module.css and useInbox.ts, following the
[code map](../code-map.md) and existing
[browser lifecycle](../architecture.md#browser-read-and-write-lifecycle).

Use one capture form and the existing Inbox lifecycle across layout states.
Moving between a side panel and a top strip must preserve the capture draft
without remounting or resetting Inbox. Preserve the existing Workspace-scoped
browser preference, default shown behavior and graceful storage fallback.
Existing saved preferences must continue to work without resetting them.

Toggling visibility must preserve selected View, Default Kanban filters and
board/editor state. Resizing across responsive breakpoints must also retain
drafts and state. Preserve existing dialog guards, focus restoration, keyboard
and touch access, refresh behavior and uncertain-write recovery. Layout changes
must not initiate mutations or new board reads solely to rearrange the screen.

Update the browser workflow in the tool README and any current layout description
in architecture. Update the code map only if responsibilities or navigation
change. Retain completed 0036 as history and link this follow-up where useful.
No CLI, HTTP, domain, store schema, dependency or generated Workspace guidance
change is needed.

## Acceptance criteria

- **AC1 — Left Inbox:** On a wide viewport with the list shown, Inbox is visibly
  left of Default Kanban and of a selected View. Capture is above its list;
  Inbox remains separate from board columns and View selection.
- **AC2 — Reclaimed width:** At the same wide viewport, hiding the list removes
  the side column and measurably increases the work surface width to the full
  available Workspace width. Compact capture remains above it. Showing the list
  restores the left panel and corresponding board width.
- **AC3 — Permanent usable capture:** Capture, submit and visibility controls
  remain reachable in both layouts while the board scrolls. Multiline capture,
  inline validation and recovery controls fit without covering the work surface.
- **AC4 — State preservation:** Hide/show and responsive resizing preserve the
  capture draft, selected View and Default Kanban filters/state. A retained
  draft can be submitted once after either transition. Existing editor guards,
  focus restoration and pending/uncertain-write restrictions remain effective.
- **AC5 — Saved preference:** Existing shown/hidden preferences are respected
  after reload for the same Workspace. The corresponding layout is applied;
  unavailable browser storage still permits toggling within the session.
- **AC6 — Responsive space and interaction:** On narrow screens the Inbox stays
  above the board; hiding its list measurably increases board height. At narrow
  and short landscape sizes, independent scrolling, actual Inbox/Action taps,
  dialogs and keyboard access remain usable without overlap. Board columns
  retain horizontal scrolling; View moves remain usable after layout changes.

## Verification plan

Prefer extending existing Workspace/Inbox component tests and built-browser
journeys over duplicating their full behavioral suites. Component checks should
protect state/preference preservation where composition changes create a concrete
risk. Browser tests must assert actual element geometry: a hidden list alone
does not prove that space was reclaimed.

At a representative wide viewport, measure Inbox and work surface positions
with the list shown, then hide/show and compare work surface widths in both
Default Kanban and a selected View. Assert that the hidden-state board occupies
the available width and sits below the capture strip. Check restored preference
after reload and retain a multiline draft through toggling and resizing.

Extend narrow/low-height checks to compare board heights, verify independent
scrolling and exercise actual controls after the transition. Include a View
drag-and-drop regression after resizing the work surface. Reuse existing Inbox
operation and recovery tests; add cases only for a distinct layout/state risk.
Inspect desktop, collapsed, narrow and short-landscape screenshots, including
validation or recovery content.

Human trial: open a disposable Workspace in Default Kanban, type a thought
without submitting, hide/show the list and verify the board gains/returns space.
Repeat with a selected View, then submit the retained thought. Reload with the
list hidden; resize to narrow portrait and short landscape and try scrolling,
opening an item/Action and moving an Action in a View.

For this planning-only change, check Markdown formatting, relative links and
the final diff. Before implementation handoff, follow the
[verification workflow](../development-guidelines.md#development-verification-workflow),
run full npm run verify on the final runtime revision and record actual platform,
results, visual inspection and independent review outcome.

## Open questions

None. Expanded Inbox is on the left; hidden-list capture moves to a compact
strip above the full-width work surface.

## Implementation and review outcome

Draft prepared on 2026-11-10. The user reviewed and approved the scope,
solution and acceptance criteria for implementation on 2026-11-10.

Implemented on 2026-11-10 through
[PR #44](https://github.com/tomas-machacek/open-work-format/pull/44).
The user reported that independent review passed and authorized completion and
merge into main on 2026-11-10. The increment and index are now `completed`.

- Workspace now owns the existing `useInbox` lifecycle and passes it to one
  retained Inbox. Visibility changes the Workspace grid, preserving the capture
  form, board components, preference key and existing recovery behavior.
- The expanded desktop panel is on the left. Hidden-list capture becomes a
  compact top strip above the full-width work surface. Narrow layouts retain
  their stacked composition and release list height when hidden. Validation has
  its own form row; short layouts use matching padding in both visibility states.
- Extended Workspace component coverage and existing Inbox browser journeys for
  measured geometry, responsive draft retention, unchanged board reads, saved
  preferences, pointer movement after resizing, short-screen touch interaction,
  validation and collapsed uncertain-write recovery. Existing Inbox operation,
  editor guard and storage-fallback coverage is reused.
- Updated the browser README, architecture and the code map's lifecycle ownership
  note. No domain, HTTP, CLI, store, dependency or generated guidance changes.

### Verification and visual inspection

Platform: Windows x64 (OS build `10.0.26300`), Node.js `24.21.0`, npm `11.4.1`,
Playwright `1.63.0` with Chromium. Runtime evidence identifies commit
`ccbcc8f9a433a8a4b763552ba35188773a01c327`; subsequent outcome edits are prose only.

- `npm ci` passed (572 packages audited, zero reported vulnerabilities).
- Focused `npx vitest run src/web/Workspace.test.tsx src/web/Inbox.test.tsx`
  passed: 23 tests in two files. Typecheck, lint and formatting passed before
  launching the full gate; the code map measured 991 words against its 1,500-word
  ceiling. Changed Markdown relative file links and `git diff --check` passed.
- The first focused Chromium selection passed five of seven journeys. It caught
  a four-pixel short-screen padding discrepancy and an incorrect test selector
  for the empty View column's insertion indicator. Both were corrected before
  the full gate. After rebuilding, `npm run test:browser -- inbox.spec.ts` passed
  all four journeys (24.2 seconds).
- At 1440×1000, both Default Kanban and a selected View gained exactly 340 pixels
  of work-surface width (1100 → 1440) when hidden, then restored the original
  width. Narrow/short journeys verified at least 96 pixels of recovered board
  height, independent scrolling, actual Inbox/Action taps and reachable controls
  at 390×600, 844×390 and 390×400. The new layout journey also retained a multiline
  capture draft through 390×844 and 844×390 resizing and submitted it exactly
  once; a pointer View move succeeded after returning to the desktop layout.
- The first full `npm run verify` stopped in built CLI tests (254.408 seconds,
  exit 1): three existing multi-process Action journeys exceeded Vitest's
  unchanged 5,000 ms timeout (5.501–5.702 seconds); 35 CLI tests passed. All earlier
  stages passed. An isolated diagnostic rerun of those three tests passed with
  the same timeout and unchanged code/configuration (13.26 seconds total).
  The second full gate resolved that timing uncertainty and passed all 11 stages
  (458.291 seconds, exit 0): 226 unit/component tests in 17 files, 310 integration
  tests in 21 files, 44 acceptance scenarios/243 steps, 38 built CLI tests in six
  files and all 35 Chromium journeys. No timeout or gate was relaxed.

Visually inspected generated PNGs under `test-results/inbox-*/`: desktop Default
and View expanded/collapsed layouts, narrow stacked layout, 844×390 and 390×400
layouts, collapsed validation and desktop/narrow uncertain-write recovery, plus
the narrow long-text editor. The left panel is separate, the collapsed strip
reserves its own height, multiline input and messages remain readable, and board
content/control regions do not overlap capture. Geometry and real interaction
assertions supplement the screenshots. Screenshots are local ignored test artifacts.

Build and browser commands initially hit sandbox `spawn EPERM`; their reruns
outside the sandbox succeeded. A separate interactive trial was attempted using
a disposable Workspace, but Computer Use stopped before interacting with the app:
it could not determine the Windows browser's current URL with enough confidence
to enforce its policy. That trial is **not** recorded as passed. The automated
Chromium journeys exercise the trial's hide/show, resize, capture, reload,
scrolling, item/Action opening and View movement steps. No physical-device,
non-Chromium or non-Windows verification is claimed.

### Review handoff

The implementer inspected the final diff against AC1–AC6 and reported no known
implementation finding at handoff. Independent review subsequently passed, as
reported by the user on 2026-11-10; the user explicitly authorized completion and
merge. No separate reviewer report is stored in this document.

At completion, the diff from verified runtime revision `ccbcc8f` to branch head
`e953df3` contained only this increment's outcome documentation. Completion changes
only this document and its index row, so the recorded passing Windows full-gate
evidence is reused without claiming a new runtime run. Completion does not
create a release.

To try it, serve a disposable Workspace with Actions, Inbox Items and a View.
Type a multiline thought, hide/show Inbox in each board mode and compare the work
surface width; submit the retained thought once. Reload with the list hidden,
resize to portrait and short landscape, scroll each region, open an Inbox Item
and an Action, and move an Action in the View. The separate human trial remains
available for review because the interactive tool trial was blocked as described
above.
