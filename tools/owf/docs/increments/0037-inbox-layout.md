# 0037 — Inbox layout and reclaimed board space

> Status: draft
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

Draft prepared on 2026-11-10. Implementation and verification are pending.
