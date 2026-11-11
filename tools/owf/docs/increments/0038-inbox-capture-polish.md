# 0038 — Compact Inbox capture and shared button styling

> Status: completed
> Description: Unify Inbox button styling with existing controls and place compact hidden-list capture below the Workspace header.
> Depends on: [0037 — Inbox layout and reclaimed board space](0037-inbox-layout.md).

## Goal and scope

The collapsed Inbox introduced in 0037 is placed above the owf / Workspace header,
and its textarea stretches across most of a wide viewport. Its buttons also use
different typography, spacing and interaction styling from the board controls.

Restore a clear hierarchy: Workspace header first, then Inbox capture and the
work surface. Keep hidden-list capture compact and left-aligned below the header,
while retaining the full board width recovered in 0037.

Included: shared CSS button styling, Inbox capture placement and sizing,
necessary header/composition changes, responsive behavior and focused regression
checks. This supersedes 0037's above-header capture placement; its space recovery
and state-preservation behavior remain required.

Deferred: a complete design system, a generic React button framework, redesigning
all controls, new Inbox operations, rich text and user-configurable panel sizing.

## Proposed solution

### Shared button styling

Extract a reusable CSS base for ordinary action buttons, using existing board
Refresh controls as the visual reference. Give the base explicit typography,
line height, padding, border, radius, foreground/background colors and enabled
hover, focus-visible and disabled states. Import or compose the same base for
Inbox controls and the reference board controls, rather than copying declarations.

Apply it to Show/Hide Inbox, Add to Inbox and Refresh Inbox in expanded and
collapsed layouts, and to ordinary Inbox editor/recovery action buttons.
Preserve intentional primary/destructive variants with explicit modifiers.
Item-preview buttons remain item rows; inline links, column Add Action controls,
identity disclosures and notification dismissal retain their specialized roles.
Avoid a broad global button selector that restyles these surfaces.

Keep native button semantics, accessible names, disabled conditions and touch
usability. Shared appearance must not change submission or recovery behavior.
Remove redundant conflicting declarations from affected selectors.

### Header and compact capture

Keep the owf / Workspace header and Display selector at the top of the
application, before capture in the visual and keyboard reading order. In the
hidden-list state, render one compact capture group below this header and above
the board content, aligned with the work surface's left content edge.

On sufficiently wide screens, use a textarea with a maximum width in the
480–640 px range; choose the precise value to fit the existing typography.
Its width may shrink with available space. Group Add to Inbox, Show Inbox and
Refresh Inbox beside or immediately around the field. Do not spread controls to
opposite viewport edges. The surrounding layout may span the board width, but
the field and control group must not stretch to fill it.

Retain multiline capture and a visible label. Validation and recovery messages
wrap within the group and may increase its height; they must not cover the board
or force controls outside the viewport. Capture/toggle remain available while
the board scrolls. On narrow screens, let the group use available content width
and wrap controls naturally without horizontal page overflow.

With the list shown, retain the left Inbox panel on wide screens, capture above
the independently scrollable list, and the stacked Inbox/board arrangement on
narrow screens. The Workspace header remains above these regions. Hiding the
list releases the side column on desktop and list height on narrow screens.
The board retains its full available width when the list is hidden, with
horizontal column scrolling.

### Composition and state

Start from Workspace.tsx, Board.tsx, ViewBoard.tsx, Inbox.tsx, Board.module.css
and Inbox.module.css, following the [code map](../code-map.md).
Headers currently belong to the board components; moving capture below the header
may require a small shared header/composition adjustment. Keep that change
limited to this layout and preserve navigation guards, selected View, focus
restoration and board-specific busy/disabled behavior, including dialog navigation.

Maintain one capture form and one Inbox lifecycle. Do not duplicate forms or
remount them when toggling, resizing or switching board mode. Preserve capture
and editor drafts, Default Kanban filters and existing browser preference keys.
Layout changes alone must not trigger mutations or extra board reads.

Retain [0036 Inbox behavior](0036-web-inbox.md), including uncertain-write recovery
and external-edit guards. No domain, HTTP, CLI, store schema or dependency changes
are needed.

Update the browser README and current layout description in architecture.
Update code-map entries if shared styles or header responsibilities change.
Keep prior increments as history. Generated Workspace guidance is unaffected.

## Acceptance criteria

- **AC1 — Consistent buttons:** Show/Hide Inbox, Add to Inbox and Refresh Inbox
  visibly match ordinary board buttons in typography, border, radius and spacing.
  Shared CSS supplies the base in both surfaces. Hover, keyboard focus and
  disabled styling work; primary/destructive distinctions remain visible.
- **AC2 — Header hierarchy:** In Default Kanban and selected Views, the Workspace
  header and Display selector precede capture visually and in keyboard order.
  Hidden-list capture appears below the header and above board content.
- **AC3 — Compact desktop capture:** At a wide viewport the hidden-list textarea
  stays within the chosen 480–640 px maximum width and aligns to the left content
  edge. Its controls form one nearby group. Increasing viewport width does not
  stretch the field or distribute controls across the screen.
- **AC4 — Retained space recovery:** Expanded Inbox stays on the left on desktop.
  Hiding it removes the reserved side column and restores full work-surface
  width; on narrow screens it releases list height. Columns remain side by side
  with horizontal scrolling.
- **AC5 — State and navigation:** Toggle, resize and board-mode changes preserve
  the capture draft and existing board state. Capture submits once. Workspace
  preferences, editor guards, dialog navigation, focus restoration and pending
  or uncertain-write restrictions continue to work.
- **AC6 — Responsive usability:** At narrow portrait and short landscape sizes,
  capture, toggle and necessary recovery controls remain reachable while the
  board scrolls. Validation, recovery text and multiline input remain readable
  without overlap or page-level horizontal overflow.

## Verification plan

Extend existing Workspace/Inbox component and built-browser journeys where they
protect a concrete changed behavior. Reuse existing operation/recovery evidence;
do not add tests that merely assert CSS class names or duplicate domain behavior.

Use real browser geometry to verify header/capture/content order, textarea
maximum width at two wide viewport sizes, nearby control grouping, left alignment
and retained board width/height recovery in both board modes. Check focus order,
draft retention across transitions and one successful capture.

Visually inspect expanded/collapsed Default Kanban and View screenshots, enabled,
hover/focus and disabled button states, and narrow/short layouts with validation
or recovery messages. A green geometry check alone does not establish a coherent
visual result. Exercise header View selection with existing editor guards and
a board move after the layout change.

Human trial: open either board mode, hide Inbox and check the compact group
below the header. Tab through controls, enter a multiline thought, toggle and
resize, then submit once. Show the list and compare button appearance with board
Refresh; try narrow portrait and short landscape.

Planning-only checks: Markdown formatting, relative links and final diff.
Implementation handoff must follow the
[verification workflow](../development-guidelines.md#development-verification-workflow)
and pass full npm run verify on the final runtime revision. Record actual
platform, checks, visual inspection, limitations and independent review outcome.

## Open questions

None blocking planning. Exact field width and wrapping thresholds are routine
layout choices within the constraints above.

## Implementation and review outcome

Draft prepared on 2026-11-10. The user reviewed and approved the scope,
solution and acceptance criteria for implementation on 2026-11-11.

Implemented on 2026-11-11 for
[PR #45](https://github.com/tomas-machacek/open-work-format/pull/45).
At the original implementation handoff, the increment and index remained
`in_progress` pending independent review; subsequent review and completion are
recorded below.

- `Buttons.module.css` supplies the ordinary action base for both board Refresh
  controls and Inbox capture, visibility, refresh, editor and recovery actions.
  Explicit primary/destructive modifiers retain clear editor actions. Preview
  rows and specialized board controls keep their existing roles.
- The active board renders `WorkspaceHeader` into a Workspace slot before Inbox.
  Navigation guards, disabled state and dialog navigation remain board-owned.
  Workspace retains one Inbox and the existing board lifecycles and preferences.
- Hidden-list capture aligns with the board content gutter, has a 560 px textarea
  maximum and nearby controls. Expanded desktop keeps the left panel; narrow
  layouts retain independent list/board scrolling and release list height when hidden.
- Extended existing Workspace and browser journeys for DOM/tab order, two wide
  viewport widths, actual shared button appearance, hover/focus/disabled states
  and geometry. Retained draft, filter, preference, recovery and View move checks
  exercise the changed composition. README, architecture and code map are current.

### Verification and visual inspection

Platform: Windows x64 (OS build `10.0.26300`), Node.js `24.21.0`, npm `11.4.1`,
Playwright `1.63.0` with Chromium. Runtime evidence identifies commit
`51a6c1033fdaa026200a150d0c8968b7a354dd8a`; subsequent outcome edits are prose only.

- `npm ci` passed: 572 packages audited, zero reported vulnerabilities.
- Focused Workspace, Inbox, Board and ViewBoard component checks passed: 68 tests
  in four files. Prepared typecheck, lint and formatting passed. Code map: 1,006
  words against its 1,500-word ceiling. Markdown relative file links outside code
  examples and `git diff --check` passed.
- Initial focused browser runs caught an ambiguous Workspace selector and an
  incorrect callback in the extended geometry test. Both were corrected before
  the full gate. The broader Inbox/layout/View interaction/Views selection passed
  19 of 20 journeys while that callback still needed correction. After correction,
  `npm run test:browser -- inbox.spec.ts` passed all four journeys (26.8 seconds).
- Both board modes measured a 560 px capture field at 1440 and 1920 px viewport
  widths, aligned with the board content gutter. Adjacent controls stayed grouped;
  hiding Inbox recovered the full 340 px side column. Narrow/short checks retained
  list-height recovery, independent scrolling, actual item/Action taps and visible
  validation at 390×600, 844×390 and 390×400. A multiline draft survived toggling,
  mode changes and resizing, submitted once, and a pointer View move succeeded.
  Native tab order, computed button appearance, hover, focus and disabled states
  were checked alongside existing editor, pending-write and recovery journeys.
- First full `npm run verify`: **failed**, 86.445 seconds, exit 1. All preceding
  stages passed, including 226 unit/component tests. Integration had 309 passing
  tests and one existing View HTTP test exceeding its unchanged 5,000 ms timeout
  (5.127 seconds). Its unchanged seven-test file passed an isolated diagnostic
  rerun (5.40 seconds total), motivating the second full run.
- Second full `npm run verify`: **failed**, 257.228 seconds, exit 1. Types, lint,
  formatting, code-map, architecture, build, all 226 unit/component tests, all 310
  integration tests and 44 acceptance scenarios/243 steps passed. Built CLI had
  33 passing tests and five timeouts in `tests/e2e/cli.test.ts`: the manual/dependency
  journey exceeded 15,000 ms; initial waiting-state creation, Action round trip,
  Action listing and combined Action edits exceeded 5,000 ms. Browser was not
  reached by either full run.
- A focused diagnostic selection reproduced all five CLI timeouts with unchanged
  thresholds. A second diagnostic using Node's built-in `NODE_COMPILE_CACHE` in
  ignored `.test-artifacts/0038-node-compile-cache` also failed all five. The cache
  was command-local and was not adopted into package configuration or later checks.
  Backend source, this CLI test file and dependencies match the approved branch
  revision `365e2fa`. No timeout, test or gate was relaxed. These observations do
  not establish a passing full gate or a definitive cause of the timing failures.

`npm run test:browser` then passed the complete Chromium suite separately:
**35/35 journeys**, 4.0 minutes, exit 0, on the same runtime revision without
compile-cache environment overrides. This includes header View selection,
editor guards, pending writes, focus restoration and board moves. It does not
turn either failed full-gate run into a pass.

Visually inspected local PNGs under `test-results/inbox-*/`: Default Kanban and
View expanded/collapsed layouts, enabled/hover/focus buttons, disabled uncertain-write
capture, desktop/narrow recovery and validation, narrow stacked layout, short
844×390 and 390×400 layouts, and the long-text Inbox editor with primary/destructive
actions. The header precedes Inbox, the field and controls remain compact, and
messages reserve their own space without covering the board. Screenshots are
ignored test artifacts, supplemented by geometry and real interaction assertions.

Build initially hit sandbox `spawn EPERM`; build and browser/full-gate commands
ran outside the sandbox. Git writes also required execution outside the sandbox.
A separate interactive trial was attempted with a disposable Workspace, but
Computer Use stopped before app interaction because it could not determine the
Windows browser's current URL with enough confidence to enforce policy. That trial
is **not** recorded as passed. Automated Chromium journeys cover the trial's
toggle, keyboard, multiline capture, resize, reload, scrolling, editor navigation
and move steps. No physical-device, non-Chromium or non-Windows check is claimed.

### Review handoff

At the original implementation handoff, the implementer inspected the diff
against AC1–AC6 and had no known functional implementation finding. The full gate
had not passed because of the CLI timeouts above; the dated follow-up below
records their subsequent repair and full verification. Independent UI review
has not run. The PR records these limitations for review,
and the increment/index remain `in_progress`. No completion, merge or release is
requested.
To try the change, serve a disposable Workspace with Actions, Inbox Items and a
View. In either board mode, hide Inbox, tab from Display into Inbox, enter a
multiline thought, toggle and resize before submitting once. Show Inbox and compare
its action buttons with board Refresh. Try narrow portrait and short landscape,
including blank-input validation, recovery, editor navigation and a board move.

### CLI timeout repair follow-up — 2026-11-11

The user approved [0039 — Bound CLI test journeys](0039-cli-timeout-repair.md),
implemented on this branch with no production code or dependency changes.
Independent argument cases and supporting application fixtures reduce accumulated
CLI startup time; the create/get process round trip and all substantive checks
remain. Child processes now have an explicit hard timeout. The 0039 outcome records
the reviewed test blob and diagnostic evidence.

Full `npm run verify` subsequently **passed in 423.845 seconds, exit 0** on Windows
x64 / Node `24.21.0`: types, lint, formatting, code-map, architecture, build,
226 unit/component tests, 310 integration tests, 44 acceptance scenarios/243 steps,
94 CLI tests and 35 Chromium journeys. The CLI verification blocker is resolved.
This result supersedes the earlier failed full-gate results for current handoff;
their historical results remain above. The 0039 repair received separate review
with all findings resolved. Independent review of the 0038 UI changes is still
pending, so 0038 and its index row remain `in_progress`.

### Independent UI review and recovery layout repair — 2026-11-11

Independent review of `c698b3e59c7b22125bdecdaa0ee865b6c8835499` against
current main `07cbd50987f0ebf76d158e74a7f4170025f9f1c5` found one P2 issue:
with Inbox shown, an uncertain capture and failed refresh could consume the
entire short viewport. The board measured 0 px high at 640×360, 24.8 px at
844×390 and 10.8 px at 390×400 in both board modes, after notification dismissal.
The review found no additional functional or separate visual defects. It
inspected the complete diff, reused matching full-gate evidence and visually
checked desktop, narrow and short layouts and shared button states.

The user authorized the repair, commit and push. Short stacked layouts with
uncertain-write recovery now reserve at least 120 px for the work surface.
Inbox scrolls within its remaining region, keeping all messages and recovery
controls reachable independently of board scrolling. Scroll padding protects
controls at the region edges. Ordinary layouts, drafts, write restrictions and
navigation lifecycles are unchanged; README and architecture describe the fallback.

A new built-browser journey covers both modes at all three reproduction sizes.
It opens an actual Action by touch, reaches recovery messages and controls,
retains a multiline draft and board scroll position, rejects page overflow and
checks explicit recovery acknowledgement and focus restoration. Before the CSS
repair it failed with Action viewport ratio 0. An intermediate run exposed less
than one pixel of capture clipping during automatic scrolling; scroll padding
corrected that issue. All five Inbox journeys then passed in 31.9 seconds.

Runtime verification identifies base `c698b3e` plus CSS blob
`47df5ddcb69435bf9b8f6a8543ff79f54b8375a8` and browser test blob
`e73994f70b9e48515782602151e0ef237ff0ab1b`. Platform remains Windows x64,
Node.js `24.21.0`, npm `11.4.1`, Playwright `1.63.0` Chromium.

- Prepared typecheck, lint and formatting passed. Build, relative document links
  and `git diff --check` passed. Browser/process checks ran outside the sandbox
  because the sandbox blocks required child processes.
- Full `npm run verify` **passed in 432.560 seconds, exit 0** on its first repair
  run: types, lint, formatting, code-map, architecture, build, **226 unit/component
  tests**, **310 integration tests**, **44 acceptance scenarios / 243 steps**,
  **94 CLI tests** and **36 Chromium journeys**. Runtime inputs did not change
  after this run; the final verification record is a prose-only follow-up.
- Visually inspected repair screenshots for Default Kanban and View recovery at
  640×360, 844×390 and 390×400. A complete ordinary Action remains usable below
  Inbox; all recovery messages and controls are reachable through Inbox scrolling.
  Tests also confirm unchanged ordinary Inbox layout and state behavior. No
  physical-device, non-Chromium or non-Windows execution is claimed.

The reported P2 reproduction is resolved and its new regression journey passes.
At repair handoff, the increment and index remained `in_progress` pending the
user's final acceptance.

### Completion — 2026-11-11

The user accepted the completed work after review and explicitly authorized merge
into main on 2026-11-11. Increment 0038 and its index row are `completed`.
The reported P2 issue is repaired; the review identified no other functional or
separate visual defects. No unresolved finding is recorded.

Before completion, branch head `6510583` was checked against the final full-gate
record: Inbox CSS and browser-test blobs match the recorded identities, and the
CLI test blob matches the reviewed 0039 identity. The passing Windows verification
is reused. Completion changes only this document and its index row; no new
runtime run or additional independent re-review is claimed. PR #45 also includes
completed increment 0039. This merge does not create a release.
