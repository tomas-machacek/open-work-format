# 0038 — Compact Inbox capture and shared button styling

> Status: reviewed
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
Implementation, verification and independent code review are pending.
