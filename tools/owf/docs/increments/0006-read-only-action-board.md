# 0006 — Read-only Action board

> Status: draft
> Description: Show persisted Actions in browser columns by execution state, refreshing on window focus.
> Depends on: [0005 — Action state changes](0005-action-state.md).

The user chose a smaller first web increment: load and present Actions only.
This introduces local HTTP and browser layers without adding a mutation path.

## Goal and scope

Show all Actions in one Workspace on a local Kanban-style board, grouped by
intrinsic state. It is a projection of the same SQLite data as `owf list actions`;
column position does not assign priority or execution order.

References: [architecture](../architecture.md),
[development guidelines](../development-guidelines.md),
[MVP scope](../../../../docs/design/mvp-scope.md),
[Core v0](../../../../spec/core-v0.md) and
[Operational Store design](../../../../docs/design/operational-store-notes.md).

Included: a local server and browser board, read-only Action API, five state
columns, initial loading, empty/error states, and refresh when the user returns
to the window. Identify which Workspace is shown. Build and run instructions
belong to this increment.

Deferred: filtering, state movement, detail/editing, Inbox, Obsidian navigation,
multiple-Workspace registration, search, polling, push updates, archive and GUI
capture. No schema change, migration or new Action domain rule is needed.

## Proposed solution

### Launch and read path

Start from inside an initialized Workspace with a command such as `owf serve`.
Discover and validate that Workspace at startup, bind only to `127.0.0.1`, and
print the browser URL. Choose one predictable default port and clearly report
if it is occupied. No Workspace registration or active-Workspace setting is
introduced. Serve built frontend assets and one read-only GET endpoint for
Actions. Vite may support development, but production must run without its
server.

The HTTP adapter invokes existing `listActions`; it does not access SQLite
directly, infer owners from Markdown, mutate Actions or initialize a store.
Return complete Action records and a machine-readable error on failed reads.
If the store disappears after startup, the HTTP request fails distinctly from
an empty Workspace; the server stays responsive. Transport contracts live in
`src/contracts`. Keep HTTP and browser code outside domain/application rules.

### Board behavior

Load the unfiltered Workspace list and render columns in this order: Open, In
Progress, Waiting, Completed, Cancelled. Every Action appears exactly once.
Within each column retain list order (`created_at` descending, ID ascending for
ties). A card shows title, stable ID and stored owner URL, plus `waiting_for`
when present. Empty columns and an empty board have clear labels. The layout
remains readable at narrow and wide browser widths.

Fetch on page load and on return to the browser window/tab (focus or visibility
restoration); coalesce nearby focus and visibility events into one request.
Overlapping requests must not let an older response overwrite a newer result.
Include manual Refresh/Retry. A CLI change becomes visible after returning or
refreshing. No background polling is required. Initial loading
can show a loading state. Later refreshes keep existing cards in place without
clearing columns, blocking interaction, flashing the screen or replacing the
board with a spinner. A subtle progress indicator may show that refresh is in
flight. On success, update only changed content without remounting the whole
board. On failure, keep cards visible but label them as not current, show a
clear error and offer Retry; never present stale cards as a successful fresh
read. There are no UI controls that write to the store.

This is a refresh-on-return model, not immediate synchronization while the
board remains visible. CLI writes use another SQLite connection and do not
notify this server directly. Server-driven updates would require separate
change detection and browser delivery, beyond this increment. If live updates
become necessary, design that mechanism separately rather than relying on
filesystem events or assuming a connection-local SQLite callback observes
CLI writes.

Update CLI help, README and the single generated Workspace AGENTS.md source
for the serve command. Existing user-authored guides stay untouched.

## Acceptance criteria

AC1: Starting inside a valid Workspace serves its local board. Startup outside
a Workspace or with an unavailable/unsupported store reports an error without
creating or replacing it. Later HTTP reads report subsequent store failures.

AC2: The board groups every Action once in the five columns and preserves
stable list order per column. Cards show title, ID, owner and waiting reason
when present. Empty columns and an empty Workspace are understandable.

AC3: An Action created or changed through the CLI appears in the right column
after returning to the tab or manually refreshing. A failed read is shown as
an error, not a current or empty result. Refresh keeps existing cards visible
without flicker or blocking loading UI; on failure they are visibly marked as
not current. Old responses cannot overwrite newer ones.

AC4: Opening, refreshing and focusing the board leave Workspace files,
Actions, timestamps and Event Log unchanged. The browser cannot change state
or other Action data.

AC5: Built server and browser work without Vite. HTTP contracts, help, README
and generated Workspace instructions agree. Existing CLI operations still work.

## Verification plan

- HTTP integration checks with real application reads for populated/empty
  Workspace and store loss after startup (AC1, AC4).
- Introduce Playwright with this first web journey, as required by the
  development guidelines. One focused Chromium E2E flow runs the built server
  against a temporary Workspace, checks columns/empty presentation, changes
  an Action using the real CLI and verifies a quiet refresh when the page
  becomes visible again (AC2–AC3, AC5). Keep screenshots out of routine
  assertions; retain them as failure diagnostics.
- Check failed refresh, cards remaining visible and out-of-order responses at
  the smallest useful UI boundary. Do not repeat the whole Action state matrix
  in Playwright or mirror HTTP integration cases (AC3).
- Build and run production server, check generated guidance and help, run
  `npm run verify` before handoff and record actual revision/platform (AC5).

Manual trial: create a fresh Workspace with Actions in several states, including
Waiting with a reason. Start the server there and open its printed URL. Change
an Action state using the CLI, return to the browser and check its column.

## Open questions for review

No blocking domain question. The launch command, local port and exact card
layout are proposed interface choices for review before implementation.

## Implementation and review outcome

Not implemented or independently reviewed. Record delivery and verification
here; set `completed` only after implementation and review.

## Decision changes and follow-up

- The first board increment presents Actions without filters or mutations, per
  user decision. Later increments can add state changes and filtering.
- Quiet refresh on return, with a manual control, is sufficient for this first
  view. Immediate backend-driven updates are deferred because CLI writes happen
  in another process and would need change detection plus delivery.
- Introduce a small Playwright browser E2E suite with this first web view,
  following the development guidelines; keep technical edge cases in faster
  focused tests.
