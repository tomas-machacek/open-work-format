# 0018 — Manual blocking and dependencies on the board

> Status: in_progress
> Description: Inspect and edit manual blocking and Action prerequisites in the Kanban Action detail.
> Depends on: [0017 — CLI blocking and dependencies](0017-action-blocking-cli.md), [0012 — Action detail editing](0012-board-action-edit.md), and [0016 — Board filtering](0016-board-search.md).

Proposed on 2026-10-15. The user reviewed and approved this design for
implementation on 2026-10-16.

## Goal and scope

Expose the blocking capabilities delivered in 0017 to a human using the existing
Kanban. Show why an Action is blocked and allow manual reasons and prerequisite
relationships to be managed without leaving the board.

References: [Core §§7.2–7.3](../../../../spec/core-v0.md#72-execution-dependencies),
[Operational Store](../../../../docs/design/operational-store-notes.md),
[architecture](../architecture.md), [development guidelines](../development-guidelines.md)
and [MVP scope](../../../../docs/design/mvp-scope.md).

Included: compact card indicators, blocking detail, manual reason set/replace/clear,
searchable Action prerequisite selection, dependency removal, atomic detail saves,
HTTP exposure of existing shared operations, and refresh/conflict handling.

Deferred: Views and a Blocked column, changing state in the editor, blocking at
creation, Outcome endpoints, reverse dependents, graph visualization, cycle linting,
new board filters, archive, and automatic unblocking on drag. Retain the five
intrinsic-state columns. This is GUI access to existing semantics, not new domain
rules or a configurable View implementation. No schema change, migration, new
package dependency, CLI command, or release is expected.

## Proposed solution

### Card and detail presentation

On each blocked card show a compact text badge `Blocked`, distinguishable without
color alone. Indicate its causes: `manual`, `1 prerequisite`, or their combination;
use the unresolved count, not the total number of edges. Keep cards compact and
in their intrinsic-state columns. Unblocked cards need no badge. Do not add full
reasons, dependency lists, or Action IDs to compact cards.

In Action detail, show current persisted blocking separately from State:

- `Not blocked`, or `Blocked` with the manual and dependency causes.
- The full manual reason when present, independent of Waiting for.
- Every prerequisite, including satisfied ones, with title, canonical Action URI,
  current state and explicit `Satisfied` or `Unresolved` text.
- An empty-state message when there are no prerequisites.

Sort prerequisite rows deterministically by canonical URI, consistent with 0017.
Completed/cancelled sources can still show dependency blocking after later
corrections. A cancelled prerequisite remains unresolved. Use shared returned
blocking facts; never infer satisfaction from card color, board membership, or
client-side recursive traversal. A completed target satisfies its edge even if
that target currently has an unresolved prerequisite of its own.

The saved blocking summary must not present an unsaved edit as persisted. Label
pending prerequisite additions/removals and manual edits clearly; the summary
continues to describe saved data until successful save. Current target facts
are observations and may change before the server commits the edit.

### Manual block editing

Add a `Manually blocked` checkbox and a labeled reason textarea to the existing
editor. When enabled, require nonblank text; preserve literal text using the same
rules as CLI 0017. When disabled, hide/disable the reason editor and clearly
indicate that saving will clear an existing manual block. Toggling off then on
before saving retains the local draft text. Waiting reason and manual reason
remain separate fields.

Only open, in-progress and waiting Actions may receive a manual reason. For a
completed/cancelled source, show why this control is unavailable; dependency
editing remains available. The server remains authoritative for eligibility.

All edits use the existing Save changes/Cancel flow. Checkbox changes do not
write immediately. Cancellation, outside click and Escape preserve the existing
unsaved-change confirmation behavior. Manual edits and dependency edits must
participate in dirty detection, saving lock, reload and conflict handling.

### Prerequisite selection and removal

Add an `Add prerequisite` search control within the editor. Reuse the existing
GET `/api/actions` query capability without the board's owner or search filters.
Search title or description with 0014 semantics; empty search omits the parameter
and lists available Actions in existing list order. Label the search scope clearly.
No fuzzy matching or new ID-search semantics are introduced.

Candidates come from the entire Workspace, including other Projects and terminal
Actions. Display title, state, owner URL and canonical URI so equal titles remain
distinguishable. Already selected prerequisites cannot be added twice. Self and
cyclic edges remain selectable, as in CLI 0017; do not silently introduce GUI-only
restrictions. Selecting an item adds it to the draft set; it does not create an
Action or issue a write.

Each selected row has a labeled Remove control. Removal changes only the draft
edge set, never the target Action. Adding and then removing a new target is a
net no-op; removing and then re-adding an existing target restores membership.
Compute additions/removals relative to the original source snapshot when saving.
Do not send the same normalized URI in both lists. Preserve other Action fields.

Provide loading, empty-results and failure/Retry states. A lookup error must not
clear selected prerequisites or masquerade as an empty Workspace. Search responses
may arrive out of order; only the latest query can replace visible candidates.
Queries and selection never change the board filter or the editor's source.

The picker must work with keyboard alone, have labeled controls and predictable
focus, and allow scrolling on narrow screens. It must not create nested modal
dialogs or submit the Action form when Enter selects a candidate. Removing a row
moves focus to a remaining control rather than a removed element.

### Save and HTTP contract

Extend the existing PATCH `/api/actions/:id` request with optional `manualBlock`,
`clearManualBlock: true`, `addDependency: string[]`, and
`removeDependency: string[]`. Retain the required expected source snapshot and
existing edit fields. Omitted fields preserve stored values; empty edge arrays
have no effect and alone do not constitute an edit. Reject malformed types,
unknown fields, contradictory reason flags and conflicting target additions/
removals. Endpoint existence, URI normalization, idempotency and final candidate
validation belong to the shared application/domain operation from 0017.

Submit changed content, owner, waiting reason, manual reason and edge membership
as one atomic edit with the existing expected snapshot. No sequence of separate
manual/dependency HTTP writes. Return the complete current Action projection
with derived blocking. Persist one edit/event for a real source change, none
for a no-op, and nothing on rejection or failure. Preserve existing trusted-write
protection and error envelope/status conventions. Unsupported/missing targets
produce explicit errors, not silently omitted prerequisites.

No state field is accepted by this edit endpoint. Existing state moves retain
0017 rules: completing with unresolved prerequisites fails; completing or
cancelling with a manual reason still present fails. Show a useful error telling
the user to resolve prerequisites or clear the manual block in detail and save
before retrying the drag. Do not automatically clear blockers, remove edges,
complete prerequisites, or open a reason dialog during drag.

### Freshness, conflicts and board reconciliation

A source edit made elsewhere invalidates the existing editor baseline via its
revision and preserves the user's draft until explicit reload. Manual and edge
changes must receive the same protection as existing content edits. Do not
silently overwrite source changes made via CLI or another tab.

A target-only change does not advance the source revision. Refresh must update
its displayed title/state/satisfaction and the source badge even when the source's
updated_at is unchanged. This is not a source-edit conflict and must not discard
pending content, reason, or membership edits. Refresh current facts for selected
unsaved candidates through the Workspace lookup as needed. If those facts cannot
be refreshed, label them stale/unavailable; never invent a successful status.

After any confirmed Action write, refresh the applied board query so other
visible Actions depending on that Action also receive updated blocking. Refresh
is necessary after target title edits as well as target state changes. Keep
existing safeguards against old reads overwriting confirmed writes and newer
filter scopes. A new successful read may update derived blocking even if the
source revision has not changed; do not retain stale derived facts indefinitely
under confirmed-source snapshot protection.

Retain the existing unfiltered lookup for an open detail excluded by board
filters. Prerequisites excluded by filters remain visible and resolvable.
Preserve applied filters, drafts and clear save-success versus refresh-failure
messages. A successful save followed by a failed refresh must not be reported
as a failed write or encourage repeating it. Preserve uncertain-write handling:
refresh and inspect current source values before allowing a retry.

Get/list responses serving the GUI must include valid blocking projections;
missing or malformed facts are errors, not evidence that an Action is unblocked.
No writes on reads, refresh, search or opening detail. All terminal validation
and current-target checks remain inside the shared write transaction.

### Documentation

Update the tool README with indicators, editor/picker usage, HTTP fields,
terminal drag behavior, and the existing schema-5 requirement. Update the MVP
capability description to distinguish delivered GUI operations from remaining
Views work. No new CLI commands are added, so the generated Workspace guide
requires changes only if existing statements about GUI limitations become stale.
Do not rewrite user-edited Workspace guidance.

## Acceptance criteria

AC1: Cards and detail accurately distinguish intrinsic state, manual blocking,
dependency blocking and combined blocking. Detail includes satisfied targets;
terminal sources and cancelled targets retain 0017 semantics. Missing data is
not presented as unblocked.

AC2: Set/replace/clear a manual reason through detail. Waiting context stays
independent, blank enabled reasons fail, and terminal sources cannot receive a
manual reason. Draft changes require Save and participate in Cancel/reload/conflict
behavior without premature writes.

AC3: Find and select prerequisites across the Workspace regardless of board
filters, disambiguate duplicate titles, remove edges, and undo draft membership
changes. Already selected edges are unique; terminal/self/cyclic targets follow
shared rules. Lookup errors and superseded responses preserve selection.

AC4: A combined detail edit commits once or not at all. HTTP validates new fields,
uses shared domain rules and preserves existing expected-snapshot and write
protections. Invalid/missing targets and injected write/event failure leave the
source and events unchanged. Idempotent requests create no event.

AC5: Existing drag completion/cancellation honors blockers and leaves rejected
moves in their actual state with useful guidance. State remains read-only in
detail. Clearing manual blocking does not remove dependency blocking; completing
a prerequisite does not remove its edge or a separate manual reason.

AC6: Target-only changes update derived presentation without causing source
conflicts or losing drafts. Confirmed target writes refresh dependents. Older
reads, filter changes, source conflicts, uncertain writes and refresh failures
cannot resurrect obsolete state or falsely report save failure. Filtered-out
prerequisites and the selected source remain accessible as specified.

AC7: Keyboard-only manual and prerequisite editing works, candidate selection
does not accidentally submit, row removal retains focus, and the detail remains
usable on narrow screens. Existing create/edit/move/filter flows remain usable.

## Verification plan

- Reuse 0017 domain and transaction tests; do not duplicate its rule matrix.
- HTTP integration for new accepted/rejected fields, combined atomic edits,
  expected-source conflicts and full projections (AC2–AC4).
- Focused component/client tests for draft membership/reason behavior, search
  races/errors, target-only refresh with unchanged source revision, saved-write
  reconciliation, and keyboard/focus behavior (AC1–AC3, AC6–AC7).
- Extend a Chromium journey with real store/server: select an out-of-filter
  prerequisite, set manual blocking, save, inspect indicators, reject completion,
  complete the prerequisite, clear the manual reason, and complete the source.
  Include a CLI target correction followed by refresh and a combined detail edit.
  Reuse existing error/rollback coverage rather than rebuilding it in browser tests.
- Run `npm run verify` before implementation handoff; record actual revision,
  platform and results. Inspect detail/card layout on desktop and narrow viewport.

Manual trial: use two Actions in different Projects. Filter the board to the
source Project, add the other Action as prerequisite, and set a manual reason.
Save, inspect blocking and attempt completion. Complete the target via CLI and
refresh: only the manual cause remains. Clear it in detail, save and drag to
completed. Reopen the target via CLI and refresh to see dependency blocking on
the still-completed source. Test picker and removal using the keyboard.

## Open questions

No blocking questions remain. The user approved the scope and interaction on
2026-10-16: existing Save/Cancel detail flow, checkbox plus manual reason,
searchable prerequisite selection, and compact card indicators. No Core changes
are proposed.

## Implementation and review outcome

Implemented on 2026-10-16. Status remains `in_progress`; the independent review
finding and its correction are recorded below.

- Cards show compact text badges using unresolved counts and retain the five
  intrinsic-state columns. Detail lists saved manual blocking and all sorted
  prerequisites, including satisfied targets, separately from editable drafts.
- The manual checkbox/reason and Workspace-wide prerequisite picker participate
  in the existing atomic Save/Cancel, dirty detection, saving lock, conflict,
  reload and uncertain-write handling. Membership undo produces no edit. Search
  ignores superseded responses, preserves selections on errors, and offers Retry.
- HTTP accepts the four agreed blocking edit fields through the existing shared
  operation. Strict transport validation and complete blocking projections are
  required. Shared transaction validation, normalization, terminal rules and
  expected source revisions remain authoritative; no domain/schema changes.
- Confirmed moves now refresh the applied query even without filters, so target
  changes update dependents. Source conflicts retain drafts; target-only facts
  refresh without conflicting. `Refresh saved facts` works inside the editor;
  selected unsaved targets use an independent unfiltered lookup and stale labels.
- Updated the tool README, MVP capability description and the generated Workspace
  guide's stale CLI-only limitation. No existing Workspace guide was overwritten.

Verification evidence:

- Focused component/client and HTTP tests: 70 passed before the final verification
  run. These cover literal manual reasons, membership undo, focus after removal,
  search races/errors, malformed projections, target-only updates, source conflicts,
  combined edits, idempotency and injected Action/event write failures.
- New real-store Chromium journey passed at 1440×1000 and 390×844. Keyboard-only
  detail editing covers an out-of-filter Project target, pending selection/removal,
  discard confirmation, combined save, terminal move rejection, CLI target completion,
  manual clearing, source completion and later target correction. It also refreshes
  target facts inside an open draft without losing that draft.
- Visually inspected desktop and narrow board/detail screenshots from these
  journeys. Text badges, wrapped URIs, focus outlines, scrollable detail and picker
  remain usable; the journey checks that the dialog has no horizontal overflow.
- Final `npm run verify` passed on 2026-10-16 for implementation commit
  `870c950794e92fe86f9c961093fa6cfdcb9bb50f` on Windows x64, Node.js 24.21.0,
  npm 11.4.1. Typecheck, ESLint, Prettier, dependency-cruiser and production build
  passed, followed by 111 unit tests, 160 integration tests, 30 Cucumber scenarios
  (164 steps), 23 CLI process tests and all 7 Chromium journeys. The new blocking
  journey passed at both viewport sizes in this final run as well.
- The subsequent handoff commit changes documentation only: this verification
  record and corrections to the README's older introductory capability/test text.
  Documentation formatting and `git diff --check` were checked separately.

Canonical added technical coverage lives in
[`ActionEditor.test.tsx`](../../src/web/ActionEditor.test.tsx),
[`Board.test.tsx`](../../src/web/Board.test.tsx),
[`client.test.ts`](../../src/web/client.test.ts),
[`board.test.ts`](../../tests/integration/board.test.ts) and
[`board-blocking.spec.ts`](../../tests/e2e/board-blocking.spec.ts).
Existing 0017 domain/transaction and acceptance scenarios remain the rule matrix.

Independent review and correction on 2026-10-16:

- Review of PR #24 at `152d823` against `main` at `80102f8` found one P2 issue:
  selecting a prerequisite could replace fresh search facts with older facts
  from the independent Workspace lookup, without labeling them stale.
- The picker now retains target observations across searches and reconciles both
  lookups by request order. An older response cannot overwrite a newer observation;
  absence from filtered results cannot establish that a selected target is missing.
  A new source projection supersedes older cached facts. Failed refreshes retain
  observed values with stale labels, including after removing and re-adding an edge.
- Three component regressions cover older lookups finishing before/after selection,
  preserving facts when a later search excludes the selection, and re-adding an
  existing edge followed by failed refresh and successful retry. Both original
  race cases were observed failing before the fix. Existing target-only refresh,
  conflict, draft, focus and search-failure coverage remains in place.
- `npm run verify` passed for the corrected working tree based on `152d823` on
  Windows x64, Node.js 24.21.0 / npm 11.4.1: types, lint, formatting, architecture,
  build, 114 unit tests, 160 integration tests, 30 Cucumber scenarios (164 steps),
  23 CLI process tests and all 7 Chromium journeys, including 1440px and 390px
  blocking journeys. The subsequent edits only record this review and verification.

No approved behavior change or requirement conflict was needed. No package,
schema, migration, new CLI command or release was added. Testing on other
platforms/browsers remains outstanding. Outcome targets and configurable Views
remain deferred as agreed.
