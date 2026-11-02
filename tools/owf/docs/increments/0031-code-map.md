# 0031 — Code map and agent navigation

> Status: draft
> Description: Provide a compact map of current implementation entry points and task-specific reading and verification paths.
> Depends on: [0030 — Quiet web operation feedback](0030-quiet-web-feedback.md).

Scope and sequencing were agreed on 2026-11-02. This document proposes the
detailed design and acceptance criteria; implementation has not started.
Planning branch: `increment/0031-code-map`, based on main at `b1a5761`.

## Goal and scope

An agent currently starts with architecture, development guidelines, the increment
index and MVP scope: approximately 1,080 lines before the current increment and
relevant specification sections. Architecture combines planned paths, current
constraints and implementation history. It does not provide a short route from
a particular change to its implementation and tests.

Add a maintained code map and revise repository navigation so an agent can locate
the relevant modules without reconstructing the whole project. Preserve essential
cross-cutting instructions and the authority of specification and design documents.
The audit establishes a navigation problem, not measured agent reading time.

Scope is repository documentation under `tools/owf/`. Runtime behavior, public
APIs, dependencies, tests and test discovery remain unchanged. Test measurement
and optimization belong to planned increment 0032; frontend restructuring belongs
to the later 0033 brief. Generated Workspace instructions and Knowledge guides
serve tool users and are outside this increment.

References: [architecture](../architecture.md),
[development guidelines](../development-guidelines.md),
[MVP scope](../../../../docs/design/mvp-scope.md).

## Proposed solution

### One compact implementation map

Create `docs/code-map.md` as the primary implementation navigation document. Aim
for roughly 80–120 readable lines, as an editorial target rather than a new gate.
Use stable module paths and selected entry-point symbols rather than line numbers
or an exhaustive function inventory.

Include:

- Current layers, their responsibilities, public entry points and bootstrap wiring.
- A task table linking common changes to starting files and relevant tests:
  Workspace initialization and generated guidance; context/owner discovery;
  Action editing, state and blocking; View definition/evaluation/movement/order;
  persistence and transaction boundaries; CLI and HTTP contracts; Default board
  filters/refresh; View interaction; shared editor and feedback.
- Short descriptions of the CLI and HTTP request paths through application,
  domain and adapters, plus the browser-to-contract/API path.
- Important nonlocal effects: Action writes reconcile View organization in one
  transaction; reads are superseded after writes; the hidden Default board retains
  state; API-client creation/deletion events currently update retained board data.
- Focused verification examples that run with the existing package scripts and
  link to the guidelines for complete handoff verification.

The map describes implemented code. Mark deferred areas explicitly and avoid
suggesting that illustrative Inbox or URI-handler paths already exist. Keep
business rules, architecture decisions and historical evidence in their existing
authoritative documents.

### Task-specific reading

Revise the repository `AGENTS.md` entry point to start with the current increment
and code map. Retain concise mandatory orientation on scope, document authority,
layer boundaries, meaningful tests, required handoff checks and honest reporting.
Link to the architecture and guidelines sections needed for those constraints.
Route detailed domain, persistence, UI and release reading by the actual task;
completed increments are consulted for relevant decisions or regressions.

This must reduce the unconditional reading set, not add the map on top of the
existing full-document list. Narrower reading does not waive existing engineering
rules or authorize changes outside the agreed increment. Inspect adjacent callers,
contracts and tests when the selected change crosses their boundaries.

Clarify `docs/architecture.md` so current structure and constraints are distinct
from deferred capabilities and historical delivery notes. Correct stale statements
about already implemented capabilities while retaining decision rationale and
links to the owning increments. Avoid a second detailed code inventory. Update
`docs/development-guidelines.md` with map ownership: changes to entry points or
responsibilities update the map in the same increment; routine implementation
edits do not require map churn. Add a short developer-facing README link.

Repository guidance changes are justified by orientation before topic selection.
They do not change generated Workspace `AGENTS.md`, its 4096-byte ceiling, topic
guides, CLI help or Workspace examples.

## Acceptance criteria

- **AC1 — Current map:** `docs/code-map.md` covers the current layers, wiring,
  representative task routes, test locations and important nonlocal effects.
  Referenced implementation paths and entry-point symbols exist.
- **AC2 — Bounded entry reading:** repository `AGENTS.md` gives a concise common
  starting path and task-specific links, without requiring every agent to read
  full architecture, guidelines, MVP and historical documents for every task.
  Scope, authority, boundaries and verification obligations remain explicit.
- **AC3 — Clear authority and status:** current architecture is distinguishable
  from plans and history. The map links to rules rather than duplicating them;
  deferred capabilities are not presented as delivered.
- **AC4 — Useful navigation:** an independent walkthrough can locate starting
  code, relevant rules and focused checks for a CLI Action change, a View ordering
  change, a web refresh regression and a generated-guidance change, using the entry
  document and map before opening the selected sources.
- **AC5 — Maintainable scope:** map maintenance responsibility and a README link
  are documented. The diff changes repository documentation only and leaves
  generated Workspace guidance and runtime behavior unchanged.

## Verification plan

- Check AC1 and AC3 against the actual source tree, public exports and package
  scripts. Resolve relative file links from each document and verify section
  anchors; inspect the named entry-point symbols.
- For AC2 and AC4, record the four representative navigation routes, the initial
  common reading set and any missing or misleading links. Report document size
  changes as navigation evidence, without claiming unmeasured time/token savings.
- For AC5, review the diff and run focused Prettier checks on changed Markdown
  plus `git diff --check`. No behavior tests or new documentation gate are needed
  for this documentation-only implementation.
- Human check: start at `AGENTS.md`, choose a representative change and follow its
  route to code and the existing focused verification command.

## Open questions

None blocking the proposed design. Wording and section organization are routine
editorial choices within this scope. The detailed proposal remains draft.

## Implementation and review outcome

Pending implementation and review. The audit's successful architecture check is
historical evidence, not verification of this future change. Record the delivered
navigation routes, changed reading set, checks, platform and review outcome here.

## Decision changes and follow-up

Planned 0032 measures and improves verification after this navigation work. Planned
0033 remains a brief until 0032 is completed. Their proposals are prepared in
separate branches; this document does not authorize their implementation.
