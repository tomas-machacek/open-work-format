# 0008 — Create Actions on the board

> Status: completed
> Description: Create an Action directly in a board column with its initial execution state.
> Depends on: [0006 — Read-only Action board](0006-read-only-action-board.md) and [0007 — Action creation in a selected state](0007-action-initial-state.md).

## Goal and scope

The user reviewed and approved this design for implementation on 2026-09-26.

Let a person create an Action from the browser without first creating it in
Open and then changing its state. The selected board column determines the
initial state. Keep the board's light layout and its quiet refresh behavior.

References: [architecture](../architecture.md),
[development guidelines](../development-guidelines.md),
[MVP scope](../../../../docs/design/mvp-scope.md),
[Core v0](../../../../spec/core-v0.md),
[Operational Store design](../../../../docs/design/operational-store-notes.md),
[0006 board behavior](0006-read-only-action-board.md) and
[0007 creation rules](0007-action-initial-state.md).

Included: one inline create control in each of the five columns, a compact
accessible form, a local POST endpoint, request/response contracts, creation
feedback and interaction with the existing refresh flow. The form accepts a
title, optional description, owner URL and, in Waiting, optional waiting
reason. Creation is available in all five states, including Completed and
Cancelled, as supported by 0007.

Deferred: changing or moving existing Actions, filters, an owner browser or
searchable picker, Action detail, Inbox, drag and drop, live push/polling and
archive. No data/schema migration or new domain operation is needed.

## Proposed solution

### Inline board flow

Each column has an unobtrusive **Add Action** control. Opening it shows a form
in that column; the state comes from the column and is visible in the form,
not an editable duplicate field. Use one open form at a time. Title is required;
description is optional Markdown text. Owner defaults to the Workspace URL
`/`; the user may enter a Workspace-rooted Project or Outcome URL. Label it as
an owner URL and show the expected form, rather than suggesting that arbitrary
paths are valid. A picker needs owner discovery and belongs to a later
increment. Waiting alone offers optional **Waiting for** text, using the same
nonblank and literal-preservation rules as the CLI. There are Save and Cancel
controls. Support keyboard and screen-reader labels, focus on opening, and a
usable layout at narrow widths.

Keep form input intact during board refreshes. Disable duplicate submission
while its POST is pending, but do not block the rest of the board or replace
cards with a spinner. On confirmed success, clear/close the form and show the
server-returned Action immediately in the correct column, with its persisted
ID, owner and waiting reason. Preserve the board's ordering (`created_at`
descending, ID ascending for ties) and update counts. A pending or older GET
must not erase the confirmed Action or briefly put it in another column; a
subsequent refresh reconciles the full list. Do not show a speculative card
before the server confirms creation.

On validation or persistence failure, keep the draft and show a clear inline
error; do not show a new card or mark the whole board current. If the network
fails after sending the request and success is unknown, do not automatically
retry a non-idempotent create. Explain that the user should refresh/check the
board before submitting again. A successful POST during an already stale board
may show the returned card, but the stale warning remains until a successful
GET. The existing quiet focus/manual refresh and CLI-created changes continue
to work. Replace the now-inaccurate **Read-only board** label and CLI-only
empty-board guidance with copy that reflects the new ability to create.

### HTTP and application flow

Add `POST /api/actions` to the loopback server. Accept a JSON body containing
`title`, optional `description`, explicit `owner` (default `/` from the form),
`state` and optional `waitingFor`. Use shared transport contracts for the
request, accepted Action response and machine-readable errors; validate the
request shape and reject unknown fields. The server supplies the selected
Workspace root, invokes the existing `createAction` application operation
once and returns the accepted persisted Action with HTTP 201. Do not write
SQLite from the handler or compose create and set-state calls. Retain 0007's
owner validation, atomic Action plus `action.created` event, and lack of an
intermediate Open state. A malformed request or invalid owner/state is a
client error; unavailable, unsupported or failed storage is a server error.
Report the existing domain error code without exposing internal SQL details.

Because this is the first browser write endpoint, accept mutation requests
only as same-origin JSON to the local server. Reject cross-origin and
non-JSON submissions before invoking the application, and do not enable
cross-origin credentials. Keep loopback binding. The implementation should
handle the server's public origin/host consistently, including a configured
port; development through Vite must use the same-origin API path or a proxy.
Test that rejected cross-origin/form submissions leave the Workspace unchanged.

The web client uses `fetch` and parses the accepted response through the
shared contract. Keep browser code free of direct application/domain/SQLite
imports. CLI creation and read operations remain independent of the server.
Document board creation in the tool README and board help; the generated
Workspace AGENTS.md remains focused on CLI usage and does not need a new
command. Existing user-authored guides remain untouched.

## Acceptance criteria

AC1: From each of the five columns, the user can create an Action whose stored
initial state equals that column. Title, optional description and explicit
owner URL round-trip through get/list. Waiting accepts an optional nonblank
literal reason; other columns have no waiting reason. The existing CLI and
board refresh behavior still work.

AC2: One submission creates exactly one Action and one `action.created` event
with the selected initial values. It does not produce an intermediate Open
Action or `action.state_changed` event. A failed validation, owner check,
store write or event write creates neither object nor event.

AC3: The form is usable by keyboard and at narrow widths. Its draft survives
refresh. Pending save does not blank or block the board; a confirmed Action
appears once, in order, even if an older read completes afterward. Failed
saves preserve the draft and show a useful error. An uncertain network result
is never retried automatically.

AC4: HTTP accepts valid same-origin JSON creation with a complete accepted
Action response; malformed, cross-origin and non-JSON requests are rejected
without writes. Business validation and storage failures are distinct and
machine-readable. The server remains bound to loopback; browser code respects
architecture boundaries.

AC5: The board no longer claims to be read-only, documentation describes the
new flow, and there is no new schema version or browser state-change control.

## Verification plan

- HTTP integration with a real temporary Workspace: valid Waiting creation,
  persisted Action/event, invalid owner/state/payload, store failure, and
  rejected cross-origin/non-JSON requests with unchanged data (AC1–AC2, AC4).
- Focused component/client tests for form validation and feedback, retained
  drafts and cards, duplicate-submit prevention, stale/older GET response
  races and an uncertain network result (AC3). Reuse 0007's domain validation
  tests rather than repeat every state and failure at each layer.
- Add one focused Playwright browser journey for creation in Waiting with a
  reason and a non-default owner, checking the stored result with the CLI and
  its visible board card (AC1–AC3). Keep the existing board journey; do not
  add a browser case for each state or HTTP rejection.
- Manually inspect the form and resulting card at desktop and narrow widths;
  run `npm run verify` before handoff and record the revision, platform and
  actual results (AC5).

Manual trial: initialize a Workspace, create a Project/Outcome, start `owf
serve`, and add a Waiting Action in the board with its owner URL and waiting
reason. Confirm it appears in Waiting and `owf get action {id}` returns the
same state, owner and reason. Refresh the page and check it remains visible.

## Open questions for review

No blocking question. The first form uses the existing owner URL contract
with Workspace (`/`) as default. A discoverable owner picker can be considered
as a later usability increment.

## Implementation and review outcome

Implemented on 2026-09-26 in `57dc4bb81380a2ec7e27a1a9a9590aa1e4ab4758`,
with completion evidence recorded in a following documentation commit.

### Delivered behavior

- Each of the five columns has Add Action and an accessible inline form. One
  form is open at a time; title receives focus, Cancel/confirmed Save return
  focus to Add Action. Owner defaults to `/`; Waiting alone offers its reason.
- `POST /api/actions` validates the strict shared JSON request contract and
  invokes the existing creation operation once. A 201 returns the persisted
  Action; client validation, origin/media-type rejection and storage failures
  have machine-readable errors. Storage diagnostics do not expose SQL details.
- The write gate requires the actual loopback Host and canonical same-origin
  Origin, including configured ports, and JSON content. Vite proxies the same
  API path while preserving rejection of foreign origins.
- Confirmed cards merge by ID in listing order. Reads started before a
  confirmation cannot erase it; later successful reads reconcile the list.
  Refresh retains card nodes and drafts. Pending saves suppress duplicate
  submission; failures preserve input, and uncertain results explain checking
  the board before retrying. Successful creation does not clear stale warnings.
- README and serve help describe creation. No schema or domain operation was
  added; Workspace CLI guidance remains unchanged as planned.

### Verification evidence

Initial verification platform: Windows, Node.js v24.21.0, Playwright Chromium.
The checks in this section ran against implementation `57dc4bb`; completion
commit `2b76458` changed only documentation. See the second review below for
the later proxy fix and its verification.

- `npm run verify`: passed in full (typecheck, lint, Prettier, architecture,
  production build, 74 unit/component tests, 114 integration tests, 24 Cucumber
  scenarios / 123 steps, 20 CLI E2E tests, and two Playwright journeys).
- [HTTP integration](../../tests/integration/board.test.ts) covers complete
  Waiting creation and its single event, invalid input/owner/state, rejected
  origin/Host/form requests without writes, Action/event write rollback,
  unavailable storage and configured/default HTTP ports (AC1, AC2, AC4).
- [Board tests](../../src/web/Board.test.tsx) and
  [client tests](../../src/web/client.test.ts) cover each column's request,
  draft retention, validation/failure feedback, focus, duplicate submission,
  old-read races, reconciliation and uncertainty without retry (AC3).
- [Browser journeys](../../tests/e2e/board.spec.ts) retain the CLI refresh flow
  and add one keyboard-driven Waiting creation with description, reason and
  Outcome owner under a Project. CLI get verifies the persisted values and
  page reload verifies one retained card (AC1–AC3).
- Manual visual inspection of rendered Chromium screenshots at 1440 px and
  390 px: form and saved card are readable, labels/buttons fit, focus is
  visible, columns stack at narrow width, and no controls are clipped.
  Local screenshots: `.test-artifacts/0008-{desktop,narrow}-{form,saved}.png`.
- `git diff --check`: passed. Early test/lint failures were corrected before
  the final successful verify run; no checks were weakened or skipped.

### Independent review and limitations

A separate review agent (`review_0008`) read the actual diff, agreed brief and
repository guidelines independently. It inspected domain reuse, atomicity,
HTTP protection/error contracts, architecture, refresh races, accessibility
structure and test value. Its sole P2 finding was rejection of valid browser
origins on port 80, whose canonical Origin omits `:80`. The fix uses URL
normalization and has a focused regression test. Follow-up review confirmed
that fix and reported **no unresolved findings**. Existing URL-boundary guidance
already covers the lesson; no additional general rule was needed.

No scope deviations or release. Owner selection remains an explicit URL field;
editing/moving existing Actions, polling and an owner picker remain deferred.
Only Windows/Chromium was exercised; Linux, other browsers and physical mobile
devices were not tested. The desktop/narrow check used rendered browser
screenshots, and keyboard behavior was exercised by the browser journey.

### Second independent review — 2026-09-26

Reviewed the complete PR head `2b7645849dcf78288f66d945e1be78f3be471630`
against current `main` `f1d045bec832e0d5359b1fea7779ea1c5e7a7fec`.
A fresh review agent (`second_independent_review`) read the actual diff and
agreed requirements without inheriting the implementation conversation.
The review covered HTTP JSON/Host/Origin boundaries, the Vite proxy, errors,
once-only application creation, owner validation and atomic event persistence;
form states, focus, drafts, duplicate prevention and uncertainty; GET/POST
ordering, reconciliation and stale indications; and tests across all layers.

**P2, fixed:** `vite.config.ts`, original lines 12–14, translated matching
Vite origins but forwarded foreign origins unchanged. When a request to Vite
carried the backend origin `http://127.0.0.1:4317` without optional
`Sec-Fetch-Site`, the rewritten Host and untouched Origin both passed the
backend gate. The real proxy returned 201 and wrote an Action despite the
request being cross-origin at the Vite boundary. This affected development
proxy traffic; direct production origin checks were intact, and cross-port
browser requests carrying `Sec-Fetch-Site: same-site` were already rejected.

Fix `0b906227385609f844573ca482e655325598a7b4` translates only matching
incoming origins and sends `Origin: null` for all others. The new
[real-proxy integration test](../../tests/integration/board-proxy.test.ts)
failed with 201 instead of 403 before the fix, then passed with rejection and
an unchanged Workspace, followed by successful same-origin creation. Existing
boundary/forbidden-example guidance covers this case; no additional general
rule was added. Follow-up independent review accepted the fix and test and
reported no remaining substantive findings.

Verification on Windows / Node.js v24.21.0 after the code change:

- Focused `npm run test:integration -- -t "Vite proxy"`: red before, green after.
- `npm run verify`: passed on code committed as `0b90622`, including 74
  unit/component tests, 115 integration tests, 24 acceptance scenarios / 123
  steps, 20 CLI E2E tests, two Playwright journeys, types, lint, formatting,
  architecture and production build.
- `git diff --check`: passed. The PR still adds exactly one browser journey.

Earlier desktop/narrow visual evidence is reused because this fix changes no
UI. No new visual, physical-mobile, Linux or non-Chromium checks were run.
Increment remains completed; no open findings, merge or release.
