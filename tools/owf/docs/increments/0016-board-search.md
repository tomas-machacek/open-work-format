# 0016 — Search and filter Actions on the board

> Status: draft
> Description: Narrow the Kanban board by Action text and direct or recursive owner scope.
> Depends on: [0014 — CLI Action text search](0014-action-search-cli.md), [0013 — Owner picker](0013-board-owner-picker.md) and [0012 — Board editing](0012-board-action-edit.md).

This proposal continues the discussion on 2026-10-06. CLI search was delivered
separately in 0014; 0015 repaired development dependency audit findings.

## Goal and scope

Make a growing Workspace board useful for finding an Action or concentrating
on one Project or Outcome. Reuse the shared application list operation so a
human and an agent receive equivalent selections.

References: [MVP scope](../../../../docs/design/mvp-scope.md),
[architecture](../architecture.md) and
[development guidelines](../development-guidelines.md).

Included: title/description search, searchable owner selection, recursive owner
scope, combined filters, clearing filters, filtered column counts and safe
interaction with refresh and existing creation/editing/movement.

All five intrinsic-state columns remain visible, including empty columns.
A separate state filter is deferred for this increment: state is already
represented by columns. Saved Views, persistent filters, URL deep links, fuzzy
search, ranking, pagination and changes to card ordering are deferred.
No schema changes, dependencies or release are required.

## Proposed solution

### Filter controls and semantics

Place a compact, labeled filter area above the board:

- Search input labeled "Search title or description".
- Owner selection using the existing searchable picker, with a distinct
  "All owners" choice as the default.
- "Include descendant Outcomes" checkbox, disabled and false with All owners.
  Selecting an owner defaults to direct ownership; recursive scope is opt-in.
- "Apply filters" button; Enter in the search input also applies.
- "Clear filters" button restores empty search, All owners and recursion off.

Typed controls are drafts until Apply; the board and its counts reflect applied
filters. Clearly indicate unapplied changes. Enter used to select an owner in
the picker must not also submit the filter form.

An empty or whitespace-only search means no text filter: the UI omits search
rather than sending a blank value rejected by 0014. Trim query edges and preserve
internal whitespace. A nonempty query uses 0014 semantics exactly: literal,
case-insensitive substring in title OR description, significant diacritics,
stored Markdown text, no cross-field match and no duplicate Action.
Waiting reasons, owner labels and IDs are not searchable Action text.

All owners means no owner constraint. Workspace (`/`) is a real selectable
owner, not a synonym for All owners: directly it selects standalone Actions;
with recursion it selects the entire Workspace. Project/Outcome direct and
recursive filters use existing stored canonical URL semantics and combine with
text using AND. Typing in the owner picker does not change the selected owner.
Owner discovery errors must not silently clear or broaden an applied filter;
show Retry and retain selection and filter drafts. Retain a selected URL even
if later discovery no longer offers that owner.

Searchable owner results retain name, type and hierarchy disambiguation from
0013. Reuse discovery and picker behavior without coupling filter selection to
the Add Action or detail editor's owner choices.

### HTTP and shared operation

Extend GET `/api/actions` with optional `search`, `owner` and `recursive` query
parameters and forward validated values to the shared `listActions` operation.
The no-query endpoint retains its current response shape and behavior.

Use a contracts-owned query schema and explicit query serialization at the
browser boundary. Encode values with standard URL APIs so owner URL percent
escapes, spaces, ampersands and literal search punctuation survive round trips.
Do not double-decode stored owner URLs or use unescaped SQL patterns.

Accept each query parameter once. `recursive` accepts only the strings
`true` or `false`; true requires owner. Explicit blank search, invalid owner,
repeated parameters, malformed recursion and unknown query parameters return
400 with the existing error envelope, without reading/writing a replacement store.
Do not coerce arbitrary nonempty strings to true. Valid unmatched queries return
200 with an empty actions array. Storage/read failures remain 503.

Application semantics, corruption detection, ordering and full Action records
come from the existing operation. Do not duplicate matching in the browser,
change CLI behavior or hide malformed nonmatching rows. Query selection is read-only.

### Results, refresh and mutations

Column counts reflect currently displayed matching Actions. Show the applied
scope and total matching count, without presenting it as the unfiltered Workspace
total. Distinguish a successful filtered zero-result view ("No Actions match
these filters") from a failed read and from an unfiltered empty Workspace.
Keep all columns and creation buttons available after a successful empty read.

Manual Refresh, Retry and return-to-tab refresh preserve applied filters and
unapplied control drafts. Retain the existing refresh strategy and stable cards.
Filters live in the current mounted board; a full page reload restores defaults.

Treat query changes as a change of result scope. Responses for superseded queries
must not replace current results. While a new scope loads, retain old cards if
desired but label them as previous results; do not label them/count them as
confirmed matches for the new scope. On failure retain the last successful scope
and cards with an explicit error. Clear must also supersede pending requests.

Preserve confirmed-write reconciliation: a GET started before a confirmed write
cannot resurrect an older card snapshot. Reconciliation must also respect query
scope; do not blindly insert every confirmed Action into a filtered result.

Creation keeps its existing defaults (Workspace owner and chosen column state);
a filter is not a creation context. After successful create/edit, refresh the
applied query to determine membership using shared server semantics. Preserve
the confirmed snapshot against older reads. If the saved Action is excluded,
announce that saving succeeded but the Action does not match current filters.
If the membership read fails, distinguish successful save from refresh failure;
do not claim exclusion or encourage repeating the write.

A changed owner/title/description may make an edited card disappear after
confirmation. Keep drafts and the editor usable through query changes, refresh,
conflicts and save errors. Disappearance from a filtered list alone must not be
interpreted as deletion or a stale-edit conflict; separate selection membership
from the editor's authoritative snapshot.

Dragging still changes only intrinsic state. It remains available across all
five columns, including empty ones, under applied filters. Preserve existing
pending-card, conflict, uncertain-write and keyboard behavior. Filter-only changes
never issue a mutation. If a focused card disappears after a save or refreshed
selection, move focus to a predictable available board/filter control and announce
the result; never leave focus on a removed element.

### Documentation and compatibility

Update the tool README's board usage and HTTP query documentation.
No new CLI command is added, so no generated Workspace guide change is required
unless an existing example becomes inaccurate. Existing create/edit/state routes,
unfiltered clients and user-edited Workspace guidance remain compatible.

## Acceptance criteria

AC1: Search selects Actions matching title OR description using the same rules
as CLI 0014. Blank UI search removes the text constraint. Results retain order,
complete records and unique IDs.

AC2: All owners, direct Workspace/Project/Outcome selection and recursive scope
work as defined. Combined search and owner scope use AND, including nested
Outcomes and sibling-prefix exclusion. Duplicate owner names remain distinguishable.
Owner discovery failure retains selection and provides Retry.

AC3: Apply/Enter apply filter drafts; picker Enter selects only its owner.
Clear restores the unfiltered board. Five columns remain visible with matching
counts and an accurate empty-result message. No filter interaction writes data.

AC4: Applied filters and control drafts survive refresh/return/error. Superseded
query responses cannot overwrite the latest results; previous data is labeled
accurately. Errors are not successful empty results. Existing confirmed-write
protection remains effective across query changes.

AC5: Create/edit still save normally. A confirmed saved Action is displayed only
when the applied selection includes it. Exclusion is announced after successful
membership determination; refresh failure cannot imply save failure. Editor drafts
survive and selection exclusion is not confused with deletion/conflict.
Dragging and keyboard focus remain usable under filtering.

AC6: HTTP queries use the shared application path, preserve literal encoded
values and reject malformed/repeated/unknown parameters with 400.
No query preserves endpoint compatibility. Nonmatching corrupt data and unavailable
stores remain errors with no mutations or partial results.

## Verification plan

- Reuse 0014 and owner-list application acceptance evidence for selection rules.
  Add scenarios only for genuinely new behavior; do not repeat the matching matrix.
- HTTP integration checks for serialization, validation, combined selection,
  no-query compatibility, corruption outside selection and unchanged store (AC1–AC2, AC6).
- Component/client tests for draft/apply/clear, counts, owner errors, response races,
  successful-write exclusion, membership-read failure, editor retention and focus
  (AC3–AC5). Use controlled response order for concrete stale-read regressions.
- One focused Chromium journey with real server/CLI: search description text,
  select a Project including descendant Outcomes, clear filters, edit a card out
  of selection and create an excluded Action. Exercise keyboard controls and move
  a remaining card. Extend existing journeys where that avoids redundant setup.
- Run `npm run verify` before implementation handoff; record revision, actual
  platform and results. Manually inspect the filter area on desktop and narrow
  viewport and check keyboard navigation.

Manual trial: create two Projects and nested Outcomes with distinct Actions.
Give one Action matching text only in its description. Apply text and recursive
Project filters, compare IDs with CLI list using the same flags, change an Action
through CLI and return to the tab. Edit a displayed card so it no longer matches,
verify the success notice, then Clear to find it again.

## Open questions

No blocking question is assumed in this draft. Apply-based interaction and
session-only filters are proposed implementation choices for review.
A separate state filter and persistent/saved Views are deferred.

## Implementation and review outcome

Pending design approval, implementation, independent review and verification.

## Decision changes and follow-up

CLI text search was deliberately delivered first as 0014. This increment adds
the board experience and HTTP access, reusing its agreed semantics.
