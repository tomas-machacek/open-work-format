# 0036 — Inbox in the web interface

> Status: in_progress
> Description: Capture and process plain-text Inbox Items in a separate, optionally visible web panel with oldest items first and an always-visible capture form.
> Depends on: [0035 — Plain-text Inbox through the CLI](0035-inbox-cli.md).

## Goal and scope

Bring the Inbox operations from 0035 to the existing local web interface.
Capture must remain available while working in Default Kanban or a selected View,
without opening the Inbox list or changing the current work surface.

Included: capture, list, full-text inspection, text replacement, explicit
resolution and discard; a clearly separate Inbox panel; persistent browser
visibility preference; shared HTTP/application integration.

[0035](0035-inbox-cli.md) owns literal-text and consumption behavior, following
[Core Inbox semantics](../../../../spec/core-v0.md#10-inbox-and-capture).
This increment adds presentation and transport, not new Inbox semantics.

Deferred: conversion to Actions/Outcomes/Projects, automatic processing, drag and
drop into boards, manual ordering, search/filter frameworks, bulk operations,
Markdown rendering, URL detection, attachments, undo, history browsing,
dedicated routes and a new dashboard. “Dashboard” here means the existing
Default Kanban work surface.

## Proposed solution

### Separate Inbox surface and permanent capture

Compose Inbox at the Workspace level, outside Default Kanban and View components.
It is not a View, a board column, a View-selector option or a result of Action
filters. Give it its own heading and visibly bounded region.

Use a compact right-hand side panel on sufficiently wide screens. Its item list
scrolls independently, allowing the main work surface to remain usable.
The capture area and visibility control remain fixed within the visible
Workspace layout while the list or board scrolls. They must not cover board
content or its controls.

The capture area contains an explicitly labeled multiline plain-text field and
an Add to Inbox button. This form stays visible whether the list is shown or
hidden and in both Default Kanban and any selected View. The Inbox list may be
hidden without hiding the form. Existing modal dialogs retain their normal
focus containment; “always visible” does not require capture through an active
modal.

Provide a direct Show Inbox / Hide Inbox toggle, with an item count when a
current count is known. Hide/show changes the list panel, not the selected board,
its filters, its draft forms or the capture draft. A failed read must not imply
a zero count.

Remember shown/hidden preference across reloads in browser-local storage, scoped
to the Workspace identity. Default to shown when no preference exists.
Unavailable browser storage must not prevent capture or an in-session toggle;
this is a presentation preference, not Operational Store data or an event.

On narrow screens use a bounded, collapsible Inbox region above the work surface
rather than squeezing the board into an unusable width. Preserve access to the
capture field and toggle, independent list scrolling, existing horizontal board
scrolling and keyboard/touch access. Do not implement a new navigation mode.

### List, inspect and process

List only current unresolved items, in ascending capture time with ID as the
deterministic tie-breaker, using the application ordering from 0035.
New items appear at the bottom. Text edits preserve ID, original capture time
and position. No reverse-order presentation or manual ordering is introduced.

Rows may use a compact multiline preview with capture time; full text must be
accessible through an item detail/editor. Render text literally, preserving
line breaks, whitespace and selectable text. URLs and Markdown-looking content
remain plain text; no separate URL field or generated links.

The detail offers Save changes, Cancel, Resolve and Discard with controls visible
without scrolling through long text. Save replaces the entire text through the
0035 use case. Reject blank input without rewriting accepted content.
Cancel leaves persisted data unchanged. Navigation, changing the selected item
and hiding the panel must not silently lose unsaved edits; use existing draft
guard conventions. Hiding the list preserves the capture draft.

Resolve is the user's explicit assertion that intended processing is complete;
it does not create another object or infer completion from another operation.
Explain this responsibility next to the control. Do not discard unsaved text
silently when resolving. Discard is visually destructive and requires explicit
confirmation identifying the item. Either successful consumption removes the
item from the current list and closes its detail; neither creates an archived
Inbox state.

Other object operations leave Inbox Items untouched. Processing may involve
several independent operations, as in 0035. No cross-object transaction or
Action-only result requirement is introduced.

### Writes, refresh and failure handling

Disable affected submit/consumption controls while their write is pending and
prevent duplicate submission. On successful capture clear only the submitted
draft, preserving newer input if editing was allowed while pending.
On capture failure retain the text. On save failure retain the edit draft.

Follow the existing [browser lifecycle](../architecture.md#browser-read-and-write-lifecycle)
and [quiet feedback contract](0030-quiet-web-feedback.md).
Successful mutations are silent. Use inline validation, temporary failure
notifications and persistent stale/uncertain recovery state as appropriate.
Never automatically retry a mutation.

Confirmed writes remain successful when a following read fails. Do not restore
consumed items or suggest repeating a confirmed capture/save; retain confirmed
results separately from stale query membership. Older read responses must not
replace newer confirmed state. If a write outcome is unknown, preserve drafts
and require reconciliation rather than silently resubmitting.

Use explicit Inbox refresh and coalesced return-to-tab refresh, without polling
or push. Refresh on opening a previously hidden list to include CLI changes.
Do not overwrite an open edit draft during refresh. If an item was consumed
externally, show a clear missing-item result and retain unsaved text for recovery.
The hidden list need not perform automatic reads; always-visible capture stays
usable and its confirmed results update local state. Refreshing Inbox must be
independent of View-definition evaluation or board-read failures.

### Integration, compatibility and documentation

Extend shared contracts, HTTP adapter, browser client and Workspace composition;
reuse application Inbox use cases, validation, ID/clock adapters, persistence
and atomic events from 0035. Domain rules stay in domain and orchestration stays
in application. Apply existing strict request shapes, loopback access controls
and error conventions to Inbox endpoints; document the resulting API.

No new database schema, migration, URL scheme or frontend dependency is needed.
Schema-10 compatibility and the existing explicit version rejection remain.
Do not add browser preferences to Inbox objects or the Operational Event Log.

Update tool README with HTTP operations and a short browser workflow.
Update code map and architecture to describe delivered browser Inbox and its
independent lifecycle. Keep shared Inbox guidance consistent if relevant;
no new fundamental CLI commands or generated AGENTS.md expansion is required.

## Acceptance criteria

- **AC1 — Permanent capture:** In Default Kanban and selected Views, capture
  remains visible with the list shown or hidden and while content scrolls.
  Nonblank multiline Unicode text, whitespace, URLs and Markdown-looking input
  round-trip literally; blank capture is rejected and failed input is retained.
- **AC2 — Separate surface:** Inbox has its own heading and region outside board
  columns and View selection. Action filters and View selection do not filter,
  recreate or consume Inbox Items. Showing/hiding does not reset board state.
- **AC3 — Visibility preference:** Show/hide affects only the list. The capture
  draft survives either choice. Preference survives reload for the same Workspace,
  defaults to shown and degrades gracefully when browser storage is unavailable.
- **AC4 — Oldest first:** Items appear by ascending capture time and deterministic
  ID tie order. New capture appends according to that order; text replacement
  preserves identity, capture time and ordering. An empty Inbox is clear.
- **AC5 — Inspect and edit:** Full literal text is accessible and editable.
  Save/Cancel work, invalid or failed saves preserve the draft, and navigation
  cannot silently discard unsaved changes. Long content leaves controls usable.
- **AC6 — Explicit consumption:** Resolve consumes only on explicit completion;
  Discard requires confirmation. Cancelled discard changes nothing. Successful
  consumption removes the current item and preserves distinct atomic events.
  Creating/editing other objects does not consume it.
- **AC7 — Reconciliation:** CLI changes appear on refresh/return/opening the list.
  Superseded reads cannot undo confirmed writes or overwrite drafts. A confirmed
  write followed by refresh failure remains confirmed without duplicate retry.
  External consumption preserves an unsaved draft and reports the missing item.
- **AC8 — Pending writes and boundaries:** Duplicate submission is prevented and
  pending state is visibly disabled. HTTP rejects malformed/blank/unknown-item
  requests consistently; application/storage failure causes no partial mutation.
  Inbox requests work independently of broken View definitions.
- **AC9 — Layout and access:** Desktop and narrow layouts support board and
  independent Inbox scrolling without overlap; capture/toggle remain reachable.
  Keyboard/touch operation, focus restoration and existing board dialogs,
  selection, editing and drag-and-drop behavior remain usable.

## Verification plan

Reuse 0035 domain/persistence evidence rather than duplicating its full test set.
Add focused HTTP integration checks for shared use-case wiring, literal payloads,
request/access validation, missing/consumed items and failure preservation.
Use component tests for ordering, saved preference and unavailable storage,
draft guards, deferred reads/writes and confirmed-write/refresh-failure recovery.
Include external consumption with an open draft.

Add a few built browser journeys covering capture while the list is hidden,
show/list/edit/resolve/discard across board modes, preference after reload and
representative narrow/desktop scrolling. Verify actual focus and keyboard access,
long content and existing board interaction regressions.

Manual trial: serve a disposable schema-10 Workspace, capture several thoughts
from Default Kanban and a View, hide/show and reload, edit the oldest thought,
resolve one and cancel/confirm a discard. Capture/change an item through CLI
and refresh the browser. Try a narrow viewport and a multiline item.

Before code handoff run full npm run verify on the final runtime revision and
record platform, actual results and independent review outcome.

## Open questions

None blocking implementation. Side-panel placement, shown-by-default behavior
and Workspace-scoped local preference are approved.

## Implementation and review outcome

Draft prepared on 2026-11-06 and approved for implementation on 2026-11-07.
Dependency 0035 is completed and merged into main through
[PR #42](https://github.com/tomas-machacek/open-work-format/pull/42).
This increment is based on that completed CLI Inbox implementation.

Implemented on 2026-11-07 in `increment/0036-web-inbox`, after fetching origin
and fast-forward checking the clean branch at `a735f77`.

- Added shared strict Inbox transport contracts, six HTTP operations and browser
  client, wired to the existing 0035 application operations. `/api/workspace`
  supplies the server-bound canonical root for preferences even if item reads
  fail. Inbox operations validate Workspace availability without evaluating Views.
- Workspace retains a separate Inbox panel across board modes. Permanent multiline
  capture survives list toggles; browser-local visibility defaults to shown and
  degrades to session state when storage is unavailable. Desktop uses a right
  panel; narrow screens use a bounded region above the independently scrollable
  board. Scroll padding keeps cards reachable below sticky board headers.
- Added oldest-first previews, a literal-text native detail/editor, blank-input
  validation, unsaved-edit guards, explicit resolution responsibility and named
  destructive confirmation. Long text scrolls separately from controls. Focus is
  contained and restored to the opening row or permanent capture field.
- Inbox owns independent manual/open/return refresh, read supersession and
  pending-write guards. Confirmed additions/edits/removals survive failed reads;
  failed or unknown writes retain drafts. Unknown outcomes require explicit
  refresh and inspection before writes are re-enabled. External consumption
  retains the open text with a missing-item result.
- Updated README, architecture and code map. No schema, migration, dependency,
  CLI command or generated Workspace guidance changes were needed.

Verification performed during implementation:

- `npm ci`; Node `24.21.0`, npm `11.4.1`, Windows NT `10.0.26300.0`, PowerShell.
- `npm run typecheck`, `npm run lint`, `npm run format:check` passed on the
  prepared changes. Production `npm run build` passed.
- Focused Vitest selection: `src/web/Inbox.test.tsx`, `inboxClient.test.ts`,
  `Workspace.test.tsx` and `tests/integration/inbox-http.test.ts`: 25 tests passed.
  Coverage includes literal payloads, HTTP access/shape checks, atomic event-write
  failure rollback, broken Views, preference/read failures, pending writes,
  superseded reads, failed follow-up reads, unknown outcomes and external consumption.
- Built Chromium `inbox.spec.ts`: both 1440×1000 and 390×844 journeys passed,
  including keyboard capture, focus containment/restoration, saved preference,
  capture in both board modes, save/resolve/discard and real built-CLI capture,
  replacement and resolution. Disposable schema-10 Workspaces were used.
- Built layout journeys at 1920×1080, 390×844 and 1280×600 passed. View interaction
  journeys passed after adapting assertions to the board's scrolling container
  and fixing sticky-header scroll padding. Earlier affected-suite selections also
  passed board, View and quiet-feedback journeys; these are not a full-gate result.
- Visually inspected generated desktop/narrow Inbox layout and long-editor PNGs
  in `test-results/inbox-*/inbox-layout.png` and `inbox-long-editor.png`: separate
  regions, no overlap, reachable capture/toggle and visible editor controls.

Initial focused attempts exposed fixture/selector assumptions and the sticky-header
touch-scroll issue; these were corrected and their focused checks rerun. Vite/Vitest
subprocess startup hit sandbox `spawn EPERM`; affected commands were rerun outside
that sandbox. No verification gate was changed or bypassed.

Full `npm run verify` evidence will be recorded below before handoff.
Independent code review is pending in a separate session. Status deliberately
remains `in_progress`; no merge or release is authorized by this delivery.

Limitations: visual checks used Playwright Chromium on Windows, including emulated
touch; no physical mobile device, other browser or second OS was checked. The
browser trial was automated with visual inspection of its screenshots, not an
additional interactive manual session. Existing schema-10/no-migration limits and
all deferred features above remain unchanged.

## Decision changes and follow-up

No scope changes. The lightweight identity endpoint and explicit unknown-outcome
inspection are presentation/recovery details. Rich content support and conversion
shortcuts remain separate future decisions, consistent with 0035.
