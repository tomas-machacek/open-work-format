# 0019 — Compact blocking detail

> Status: reviewed
> Description: Replace the oversized blocking editor with one compact prerequisite list and an on-demand picker.
> Depends on: [0018 — Board blocking and dependencies](0018-board-blocking.md).

Proposed on 2026-10-16 following the user's review of the delivered Kanban and
screenshot. The user agreed with the compact direction and requested a separate
increment because 0018 is already merged. The user reviewed and approved this
design for implementation on 2026-10-17.

## Goal and scope

The current editor displays each saved prerequisite twice, exposes full URIs,
keeps candidate results permanently open, and surrounds them with explanatory
text and large padded boxes. Even one prerequisite consumes almost a screen.
Make the ordinary case small and readable while preserving all editing and
freshness guarantees from 0018.

References: [architecture](../architecture.md),
[development guidelines](../development-guidelines.md), and the
[0018 implementation contract](0018-board-blocking.md).

Included: a single Blocking section and prerequisite list, compact rows with
owner path before title, identifier tooltips, explicit inline pending changes,
on-demand search, and one refresh action. This supersedes 0018's separate saved
and draft list presentation; the distinction between saved data and pending
changes remains visible without duplicate lists.

Deferred: configurable Views, a Blocked column, domain-rule changes, navigation
to/editing prerequisite Actions from this dialog, broad editor redesign, new
filters, schema migrations and CLI changes. No new package or release is needed.

## Proposed solution

### One section and one list

Use one section headed `Blocking`, with a short saved-status summary on the same
line where space permits: `Not blocked`, `Blocked · manual`,
`Blocked · 1 prerequisite`, or a combined summary. Place a small accessible
Refresh action at the opposite end of the header.

Remove the separate `Saved blocking` prerequisite cards and `Prerequisites to
save` heading. Render each prerequisite once in a common list. Include satisfied
prerequisites, not just blocking ones. Preserve stable canonical-URI ordering.

Keep the manual checkbox on one compact line labeled `Manual block`. Render its
reason textarea only while enabled; preserve its draft text when toggling off
then on. Terminal eligibility and explicit clearing rules remain unchanged.
Avoid large nested panels, repeated headings and default vertical whitespace.

Each prerequisite row contains, in reading order:

- A muted owner path followed inline by the stronger Action title.
- A compact state label and explicit satisfaction indication (`Satisfied` or
  `Unresolved`), without repeating `Selected` on unchanged rows.
- A small Remove action, or Undo for a pending removal, with an accessible name
  identifying the target. Icons may be used with a text alternative.

Use one line where it fits; allow controlled wrapping on narrow screens and for
long titles. Do not shrink text or hit targets until they are difficult to use.
Ordinary rows have no individually padded card containers. When there are no
prerequisites, use a short empty hint beside the add affordance rather than a
large empty panel.

### Identity and owner path

Use the same compact owner-before-title presentation in selected rows and search
results. The owner path comes from the target Action's stored owner URL, not the
currently edited source's owner and not inferred from its title. Render it as a
readable path prefix; omit the standalone Workspace `/` prefix. Do not require
Markdown owner discovery to display existing Actions or invent friendly names.

Long paths may be visually shortened, with the full stored owner URL available
in the row tooltip. Decode URL escapes only for display using existing safe URL
handling; retain the canonical stored URL for references and comparisons.
A display path is not a newly constructed filesystem path.

Remove permanently visible UUID/URI lines from prerequisites and candidates.
Expose the full canonical Action URI and owner URL in a tooltip on the Action
label, reachable on hover and keyboard focus. A tap/click on the label may toggle
this same identity disclosure for touch users; it must not edit/navigate to the
target or submit the form. Do not rely solely on the native title attribute for
keyboard/touch access. Escape dismisses the disclosure before closing the editor.

Equal titles and owners remain distinguishable through identity disclosure;
selection and removal always use the canonical URI. Keep the main Action's
existing metadata outside this section unchanged.

The current dependency facts do not include owner. Obtain owner from the
existing Workspace lookup and retain it with target observations; do not add a
new persistence field or duplicate domain ownership rules. A target-only owner
change must refresh the displayed path just like title/state. Before owner data
is available, show the title and a compact loading/unavailable indication rather
than guessing `/`. Retain stale known paths with the same freshness indication
as other target facts. Source projections lacking owner must not erase a known
owner or falsely mark an older owner observation fresh.

### Pending changes without duplicate representations

The header summary continues to describe saved blocking. When there are edits
in this section, show a small `Unsaved changes` marker next to it; do not imply
that removal or manual clearing has already unblocked the saved Action.

Mark newly added rows `Added`. Keep an existing row pending removal visible once,
muted and marked `Removed`, with Undo. Remove then undo restores membership;
add then remove drops the unsaved row entirely. A saved row removed then selected
again returns to unchanged membership. Compute the same net add/remove request
as in 0018. Do not send a write for presentation or picker changes.

Manual draft changes participate in the section's unsaved marker. The original
reason need not be repeated in a second read-only panel; Cancel/reload retains
its established behavior. Save changes remains the single atomic commit for the
whole Action detail.

Remove always-visible implementation explanations such as `Draft membership`
and the paragraph explaining target observations. Keep useful field labels and
show concise validation, stale-data, conflict and failure messages when relevant.
Do not hide information needed to recover from an actual error.

### On-demand Add prerequisite

Initially render only `+ Add prerequisite` below the rows. Clicking it opens a
search input and focuses it. Results appear in a bounded dropdown while that
control is active, not a permanently allocated candidate panel. Empty search may
show existing default candidates while the picker is open; opening Action detail
alone must not reveal them. Preserve Workspace-wide title/description matching,
including terminal, self and cyclic targets, and independence from board filters.

Selecting a candidate updates draft membership, closes and clears the picker,
and returns focus to Add prerequisite. Already selected targets cannot be added
twice. Closing without selection does not change membership. Escape closes the
picker first without triggering editor discard/close; clicking outside the picker
closes it while preserving the rest of the draft. Preserve the existing editor
outside-click behavior when the click is outside the dialog itself.

Support keyboard search, candidate selection and dismissal without accidentally
submitting the Action form. Results scroll within available viewport space and
are not clipped beyond the dialog. Opening/closing the dropdown cannot lose target
observations or let late responses reopen it. Loading, no matches and failed
search/Retry states exist only within the active picker.

### Refresh and consistency

Replace the two independent visible refresh links with one section Refresh action.
It refreshes saved source facts and required target observations, including unsaved
selected targets, using the existing application paths. It preserves all drafts,
pending removals and picker state. Disable duplicate refresh activation while in
flight; indicate progress compactly.

Independent underlying requests need not form a distributed transaction. If only
one fails, retain its last known facts and label them stale; a partial success
must not clear the other source's failure indication. Keep Retry available through
the section refresh or the active failed search as appropriate.

Preserve the 0018 review fix: reconcile target observations by request freshness,
never overwrite newer search facts with older Workspace lookup facts, and never
interpret absence from filtered search as a missing target. Extend this discipline
to owner data. Closing the search UI must not disable refresh of selected targets.

Target-only changes refresh facts without a source-edit conflict or draft loss.
Source revisions still protect saves, and uncertain-write handling remains intact.
Do not change atomic save, shared validation, board filtering, drag rules, or
confirmed-write reconciliation. Do not create new events on refresh or UI changes.

## Acceptance criteria

AC1: With one prerequisite, no manual reason, no error/pending edit and a closed
picker, the section contains one heading/summary, one manual checkbox line, one
prerequisite row and Add prerequisite. No duplicate list, visible ID line,
permanent candidate area or explanatory paragraph remains. On a desktop-sized
dialog this should occupy roughly four compact rows plus ordinary spacing; long
content, narrow screens and error messages may legitimately wrap.

AC2: Selected rows and candidates show the correct target owner path before the
title, omit the Workspace root prefix, and expose full canonical identity on
hover, focus and touch. Duplicate titles remain selectable by distinct identity.
Long paths/titles do not force horizontal dialog overflow. Owner loading/failure
and target-only owner changes are handled without fabricated or stale-as-fresh data.

AC3: Added/Removed/Undo and the section unsaved marker accurately represent the
draft while the summary remains saved-state information. Manual toggling retains
its draft reason. Net no-op membership, Cancel/discard/reload and atomic Save
retain 0018 semantics. Each target appears at most once in the common list.

AC4: Candidates are visible only while adding. Selection, dismissal and reopening
preserve the intended draft/focus behavior. Late search responses cannot reopen
a closed picker or overwrite newer results. Keyboard selection never submits
and Escape closes the innermost disclosure/picker before the Action dialog.

AC5: One refresh action updates saved and unsaved target observations without
losing edits. Partial failures are honest and recoverable; 0018 race, stale-source,
uncertain-write and confirmed-write safeguards remain effective. These controls
perform no writes until Save.

## Verification plan

- Adapt existing component tests to the consolidated list and on-demand picker;
  retain existing race/conflict regression coverage rather than cloning it.
- Add focused checks for pending-removal Undo, picker close with a late response,
  owner observation freshness, partial refresh failure and accessible identity.
- Update the existing real-store blocking journey for the compact controls,
  keyboard/escape behavior and unchanged domain outcomes. No new domain test
  matrix or schema tests are needed for presentation-only changes.
- Visually inspect the ordinary one-prerequisite case and a multi-row/pending/error
  case at the existing desktop and 390px viewports. Capture before/after evidence
  or record the section height to demonstrate the reduction; do not impose a
  brittle exact-pixel test. Check readable text, touch targets and dropdown clipping.
- Run `npm run verify` before implementation handoff and record actual revision,
  platform and results. Update README descriptions of the changed interaction.

## Open questions

No blocking questions remain. The user approved the detailed increment on
2026-10-17. No domain or storage decision is reopened.

## Implementation and review outcome

Design reviewed and approved for implementation on 2026-10-17. Implementation
and code review have not started; no runtime verification is claimed.
