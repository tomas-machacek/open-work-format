# 0006 — Read-only Action board

> Status: completed
> Description: Show persisted Actions in browser columns by execution state, refreshing on window focus.
> Depends on: [0005 — Action state changes](0005-action-state.md).

The user reviewed and approved a smaller first web increment: load and present
Actions only. This introduces local HTTP and browser layers without adding a
mutation path.

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
  assertions; retain them as failure diagnostics. Treat browser E2E as costly:
  add another Playwright case only for a distinct risk that cannot be checked
  adequately at a faster layer. Do not expand the suite for each state or
  each API error.
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
layout are implementation choices within this approved scope.

## Implementation and review outcome

Implemented and independently reviewed. The review's refresh finding is fixed
and covered by component regressions. Status is `completed`.

- `owf serve [--port 4317]` discovers and validates one Workspace, binds only
  to `127.0.0.1`, and serves built React assets with Fastify. GET `/api/actions`
  uses the existing application listing and shared Zod transport contracts.
  Startup errors include occupied port, absent Workspace and unavailable or
  unsupported store. Subsequent read errors return HTTP 503 with an error code.
- The responsive CSS Modules board shows five ordered columns, complete IDs and
  stored owner URLs, with optional waiting reasons. Refresh retains keyed cards;
  focus/visibility events are coalesced, older responses are ignored, and failed
  reads retain visibly stale data with Retry. No write controls were added.
- Server dependencies load only for `serve`; ordinary CLI commands retain their
  direct execution path without loading Fastify.
- CLI help, README and the single Workspace guide template document serving.
  Existing Workspace guides are not rewritten. The architecture now records
  the approved refresh-on-return decision instead of its earlier polling option.
- Fast HTTP integration tests cover read-only file preservation, store loss and
  recovery, unsupported store and startup errors. Component tests cover order,
  retained card nodes, stale/error presentation, Retry, response races and return
  event coalescing. Client tests reject failed/malformed transport responses.
- One Playwright scenario exercises the built server, real CLI changes and quiet
  return-to-tab refresh. Chromium's default focus emulation is disabled through
  CDP for actual tab visibility events; no synthetic application event is used.
  Screenshots/traces remain failure diagnostics, not comparison assertions.
- Architecture gate probe: a temporary TSX browser module importing application
  code and `node:sqlite` failed with both expected boundary violations; removed.
- Production board visually inspected at 1440px and 390px; mobile has stacked
  columns, no horizontal overflow. Local visual artifacts are untracked.

Verification on 2026-09-25:

- Verified implementation revision: `1a258d55d9bf1dc7ab8c777839e2b7f59c626dbe`.
  The later handoff commit changes only this verification record.
- Platform: Windows x64, build 10.0.26200, Node v24.21.0; Playwright 1.63.0,
  Chromium 153.0.8010.12. Linux and other browsers were not run.
- `npm run verify`: passed (exit 0). Typecheck, ESLint, Prettier, architecture
  boundaries and production build all passed. Unit/component/client: 59 tests;
  integration: 105 tests; acceptance: 24 scenarios / 123 steps; CLI E2E: 19 tests;
  browser E2E: exactly one scenario, passed in 2.5 seconds.
- Earlier full verification of `25b53ed` exposed a CLI test timeout caused by
  eagerly importing HTTP dependencies. The fix loads them only for `serve`;
  existing timeout limits and assertions were preserved. An intermediate run
  stopped on documentation line endings; normalization fixed formatting without
  changing the committed content. The final full run above supersedes both.
- Browser automation, Vite builds and tests required execution outside the local
  sandbox because child-process startup was blocked with EPERM inside it.
  Dependencies and Chromium installation succeeded; npm reported no vulnerabilities.
- Final production UI was inspected at desktop and mobile widths with no
  horizontal overflow; screenshots are local diagnostics, not assertions.

Limitations: one local Workspace per server; no live polling/push, filters,
mutations, Action detail, Inbox or registration. Linux was not exercised.
No merge or release has been performed.

Independent review and correction on 2026-09-26:

- Reviewed HEAD: `631db3f5c2e42534cff2cd41dc7ed18b08b1f73c`, against
  `a1df3f1cbc5eab40b39994de1c04623d4d8e4307` (PR #11 base).
- One confirmed P2 finding: returning during an outstanding request dropped
  the refresh and could label an older snapshot current after a CLI change.
  The hook now queues one follow-up read, discards the superseded response,
  and retains cards and progress until the follow-up settles. Manual refresh
  still supersedes earlier requests; nearby return events remain coalesced.
- Component regressions cover both success and failure of the older request,
  one follow-up read, retained card identity and the fresh final result. Fake
  timers replace the previous real-time wait. The single Playwright journey
  remains unchanged; HTTP errors and response races stay at cheaper layers.
- Independent checks of the reviewed HEAD passed: production build, five
  focused tests, one browser journey, built-server reads from a Workspace
  subdirectory, loopback binding, complete records, rejected write methods,
  store loss/corruption/unsupported-version recovery and byte preservation.
  Chromium DOM measurements found no overflow at 1440, 390 and 320 pixels
  with long titles, owner URLs and waiting reasons.
- Correction verification: `npm run verify` passed on Windows x64 with Node
  v24.21.0 for the implementation and tests in this correction commit, based
  on the reviewed HEAD above. Typecheck, lint, formatting, architecture and
  build passed; 61 unit/component/client tests, 105 integration tests,
  24 acceptance scenarios (123 steps), 19 CLI E2E tests and the one Chromium
  journey passed. The browser scenario took 3.0 seconds. Only this review
  record and the increment index changed after that run; their formatting
  was checked separately. No blocking findings remain.

## Decision changes and follow-up

- The first board increment presents Actions without filters or mutations, per
  user decision. Later increments can add state changes and filtering.
- Quiet refresh on return, with a manual control, is sufficient for this first
  view. Immediate backend-driven updates are deferred because CLI writes happen
  in another process and would need change detection plus delivery.
- Introduce a small Playwright browser E2E suite with this first web view,
  following the development guidelines and the user's preference to keep
  costly browser tests to a minimum; keep technical edge cases in faster tests.
