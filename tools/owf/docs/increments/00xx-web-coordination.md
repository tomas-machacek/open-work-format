# 00xx — Web coordination modularity brief

> Status: draft
> Description: Outline a bounded frontend refactor of refresh and confirmed-write coordination for detailed design after 0032.
> Depends on: Completion of 0031 — Code map and agent navigation, and 0032 — Measured and focused verification workflow.

Brief requested on 2026-11-02. Parked under placeholder 00xx on 2026-11-05;
no implementation number is reserved. Detailed design and acceptance criteria are
deliberately deferred until 0032 is completed. This is a planning brief, not an
implementation-ready increment.

Planning branch: `increment/00xx-web-coordination`, independently based on main at
`b1a5761`. Earlier proposals are in `increment/0031-code-map` and
`increment/0032-verification-workflow`. Integrate their completed work and add
document links when elaborating this brief.

## Problem and intended outcome

The audit found sound layer boundaries but concentrated frontend coordination.
`Board.tsx` and `ViewBoard.tsx` combine rendering with mutations, refresh, navigation
and focus. `useBoard.ts` and `useView.ts` repeat parts of request supersession,
refresh coalescing and completed-write error context, with significant differences
for filtering and frozen reads. `client.ts` also dispatches creation/deletion
events consumed by the retained Default board, making effects indirect.

The intended outcome is an explicit, smaller set of owners for reading,
confirmed-write effects and board synchronization. A change to refresh or error
policy should require understanding fewer independent state transitions. File
length or the number of extracted hooks is not a success measure.

## Candidate scope and boundaries

Investigate separating read/write coordination from board rendering and replacing
implicit API-client-to-board notifications with explicit ownership of confirmed
changes. Extract only mechanisms that are actually shared. Keep the distinct
filter-membership and View freeze/reconciliation policies visible.

Preserve current behavior and contracts: confirmed writes versus uncertain
outcomes; stale and superseded reads; filter membership; View ordering; hidden
Default-board state; editor drafts; navigation guards; focus; silent success and
persistent recovery state after transient errors. Existing
[0030 behavior](0030-quiet-web-feedback.md) is a regression baseline.

Backend architecture, CLI/domain file splitting, database schema, HTTP contracts,
new state/query frameworks, polling and automatic mutation retries are outside
the proposed direction. Complete editor decomposition, drag-and-drop redesign and
CSS reorganization are also deferred; they must not accumulate into this refactor.

## Inputs needed after 0032

- The current code map and updated source tree, including intervening changes.
- Verification timings and focused recipes, with the expensive journeys and their
  protected risks identified.
- A trace of a confirmed write through the active board, retained Default board,
  refresh lifecycle and failure reporting, including current event consumers.
- Existing regression coverage for stale reads, confirmed-write/read failures,
  switching boards, drafts, pending writes and focus restoration.

Use these inputs to decide which coordination boundary to change first. Do not
choose a generic hook API or commit to merging `useBoard` and `useView` in advance.

## Elaboration and verification direction

When this work is selected after evaluating 0032 and subsequent evidence, assign
an available increment number and turn this brief into a standard increment with concrete module
responsibilities, the selected mutation/synchronization flow, stable acceptance
criteria, compatibility constraints and a focused/full verification plan. Split
the work further if the selected boundary cannot be changed and reviewed without
also redesigning unrelated interactions.

Prioritize existing behavior regressions over implementation-mirroring tests.
The eventual code handoff requires full verification under the then-current
guidelines. No new checks, benchmark results, implementation or review outcome
are claimed by this brief. Keep the document and index in draft until the detailed
design is agreed.
