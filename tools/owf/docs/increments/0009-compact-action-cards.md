# 0009 — Compact Action cards

> Status: in_progress
> Description: Make board cards smaller by removing the visible ID and placing metadata values beside their labels.
> Depends on: [0008 — Create Actions on the board](0008-board-action-create.md).

## Goal and scope

The user reviewed and approved this design for implementation on 2026-09-27.

Show more Actions at a glance without making cards harder to read. The current
card uses a separate row for the ID and places owner and waiting values under
their labels, leaving considerable empty space. This increment changes only
the board card presentation, following the user's feedback after 0008.

References: [architecture](../architecture.md),
[development guidelines](../development-guidelines.md),
[0006 board behavior](0006-read-only-action-board.md),
[0008 board creation](0008-board-action-create.md) and
[MVP scope](../../../../docs/design/mvp-scope.md).

Included: card markup and styling for all five columns, including the Waiting
reason, and updates to tests that currently assume the ID is visible. This
supersedes the visible-ID card requirement in 0006 and the visible-ID wording
in 0008. It does not change the stored Action or its transport representation.

Deferred: opening Action detail, copying an ID, editing or moving Actions,
truncating fields behind a tooltip, changing the creation form, owner selection,
filters and mobile navigation. No schema, CLI or HTTP change is required.

## Proposed solution

Keep the title as the card's strongest visual element. Remove the visible ID
row entirely. Show **Owner: value** on one compact metadata line, and for a
Waiting Action with `waiting_for`, show **Waiting for: value** in the same
label/value style. "On one line" describes their inline layout: long URLs and
long or multiline reasons may wrap onto further visual lines without clipping,
horizontal overflow, hidden content or forced ellipsis. Preserve the stored
reason's whitespace/newlines when it is meaningful. Do not add a waiting row
when the reason is absent, and do not show a placeholder ID.

Reduce unnecessary card padding, title-to-metadata spacing and row gaps while
retaining the board's light appearance, readable text and clear separation
between adjacent cards. Use semantic label/value markup (for example a compact
description list) so assistive technology can associate each value with its
label. Titles, owner URLs and waiting reasons are text, not injected HTML.
Cards remain legible in the five-column desktop layout and stacked narrow
layout. Do not rely on hover to reveal a value.

The Action ID remains in the persisted object, GET/list/POST JSON, CLI output,
React keys and sorting tie-breaker. Only the board card stops displaying it.
Creation, refresh, ordering, counts, stale/error handling and focus behavior
remain as in 0006/0008. Existing tests that extract an ID from a card should
obtain it through the CLI or API instead, without adding hidden card IDs or
test-only DOM attributes. Update board text/documentation only where it
currently promises a visible card ID; keep historical increment documents as
records of their original scope and note the supersession here.

## Acceptance criteria

AC1: Every Action card shows its full title and owner URL without a visible
ID. A Waiting card with a stored reason also shows the full reason; one without
a reason has no waiting row. Owner and Waiting for values follow their labels
inline, wrapping naturally when needed.

AC2: Cards are visibly more compact at ordinary desktop width. Long titles,
owner URLs and multiline reasons remain readable at desktop and narrow
widths, with no clipped text or horizontal page overflow. Labels remain
associated with values for assistive technology.

AC3: The ID and all other Action fields remain available through CLI and
HTTP contracts. Board ordering, card identity across quiet refresh, creation
through each column, counts and error/stale behavior are unchanged.

AC4: Automated tests no longer depend on reading an ID from the card. There
is no new Playwright journey for this presentation-only change and no schema
or API migration.

## Verification plan

- Focused board component assertions for absence of the displayed ID,
  inline label/value semantics, Waiting reason present/absent and long text
  remaining in the DOM (AC1–AC2). Avoid CSS pixel snapshots as routine tests.
- Adapt the existing Playwright creation journey so it retrieves the saved
  ID through CLI/API rather than a card's `dd`; retain its persisted-result
  assertions. Do not add a new browser scenario (AC3–AC4).
- Manually inspect representative cards (Open and Waiting, short and long
  values) at desktop and narrow widths, and compare their density to the
  current board. Verify full text, wrapping and no horizontal overflow.
  Run `npm run verify` before handoff and record actual platform/results.

Manual trial: serve a Workspace with short and long Action titles, a long
owner URL and Waiting Actions with and without reasons. Check the compact
cards at desktop and narrow widths, then refresh and confirm the same data
and stable board behavior. Use `owf get action {id}` for the ID when needed.

## Open questions for review

No blocking question. A later Action detail or copy-ID control can provide
an in-UI way to retrieve IDs if that becomes necessary; this increment does
not add one.

## Implementation and review outcome

Pending implementation and review.
