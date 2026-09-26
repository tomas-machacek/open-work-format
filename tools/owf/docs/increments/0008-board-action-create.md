# 0008 — Create Actions on the board

> Status: draft
> Description: Create an Action directly in a board column with its initial execution state.
> Depends on: [0006 — Read-only Action board](0006-read-only-action-board.md) and [0007 — Action creation in a selected state](0007-action-initial-state.md).

## Goal and scope

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

Pending implementation and review.
