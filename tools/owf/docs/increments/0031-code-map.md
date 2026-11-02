# 0031 — Code map and agent navigation

> Status: completed
> Description: Provide a compact map of current implementation entry points and task-specific reading and verification paths.
> Depends on: [0030 — Quiet web operation feedback](0030-quiet-web-feedback.md).

Scope and sequencing were agreed on 2026-11-02. The user confirmed design review
and approved this document for implementation on 2026-11-02.
Implementation and independent implementation review completed on 2026-11-02.
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

None blocking implementation. Wording and section organization are routine
editorial choices within the reviewed scope.

## Implementation and review outcome

Design review and implementation approval were confirmed by the user on
2026-11-02 and recorded separately in commit `67898aa`. Documentation implementation
is delivered on `increment/0031-code-map`. Independent implementation review
completed without findings; the document and index are `completed`.

### Delivered navigation and architecture alignment

- `docs/code-map.md` provides current layer/public-entry navigation, CLI/HTTP/web
  execution paths, task-to-code/rules/tests routes and existing focused commands.
  It identifies transactional Action/View effects, differing refresh policies,
  retained Default-board state and API-client event producers/consumers (AC1).
- Repository `AGENTS.md` starts with the current increment and map, then relevant
  sections. Authority, scope, architecture boundaries, meaningful tests and full
  code-handoff verification remain mandatory. The guidelines document map
  maintenance and the developer README links to it (AC2, AC5).
- Architecture now separates the implemented baseline, deferred capabilities and
  historical delivery decisions. It corrects stale View/read-only claims, current
  schema and HTTP protection status, and the unimplemented React Router/URI-handler
  paths. Decision rationale links to owning increments and domain documents (AC3).
- Changes are confined to seven repository Markdown documents; production source,
  generated Workspace instructions/guides, dependencies and test configuration
  are unchanged. No substantive design deviation was needed (AC5).

### Reading-set evidence

Using non-trailing-blank physical lines, the baseline common reading at main
`b1a5761` was 1,133 lines: repository AGENTS.md 58, architecture 448, guidelines
322, increment index 60 and MVP scope 245. The new common orientation is 179
lines: AGENTS.md 67 and code map 112. Both counts exclude the current increment
and task-specific reading; the index is now conditional on locating/checking the
increment. This measures the prescribed reading set, not actual agent reads,
tokens, implementation time or guaranteed savings.

### Local navigation walkthrough

Starting from the new entry point and task map, a source-backed local walkthrough
located the following routes and existing checks (AC4). This was the implementer's
walkthrough; a separate reviewer should repeat it independently.

| Task                      | Located starting code and rules                                                                                                                                                      | Focused verification route                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI Action change         | Action and CLI task rows → `domain/actions`, `application/actions`, `interfaces/cli`, contracts/bootstrap; Core Action and store operation contract                                  | `npx vitest run src/domain/actions`; CLI journey selection in the map after a current build, plus affected integration tests from the row.                       |
| View ordering change      | View movement/order row → `moveViewAction`, `insertViewMember`, `recordViewOrder`, `moveAction`, `reconcilePlacements`; Views profile manual order and current architecture boundary | `npx vitest run src/domain/views tests/integration/view-order.test.ts`; acceptance name selection is a narrower development aid, not the full gate.              |
| Web refresh regression    | Default refresh and View interaction rows → `Board`, `useBoard`, `useView`, `Workspace`; lifecycle and UI-test guidelines, including hidden-board events                             | `npx vitest run src/web/Board.test.tsx src/web/Notifications.test.tsx`; the View row identifies additional ViewBoard/Workspace coverage when its policy changes. |
| Generated-guidance change | Guidance row → `markdown/agents.ts`, `guides.ts`, `workspaceDocuments.render`, application initialization; guidance policy                                                           | `npx vitest run tests/integration/workspace-guidance.test.ts`; row also identifies `tests/support/guidance.ts` and the built-CLI guidance journey.               |

### Verification and limitations

Verification platform: Windows 10.0.26300, PowerShell 7.6.9, Node 24.21.0,
npm 11.4.1. Checks performed:

- Parsed local Markdown links and heading anchors in all seven changed documents
  using the installed CommonMark parser; targets resolved. Also checked 26
  shorthand test names, 17 named entry-point symbols and 13 public module paths
  against source. The first run reached the source-inventory step and hit sandbox
  `spawnSync git EPERM`; the successful rerun used approved execution outside the
  sandbox. No permanent validator or gate was added.
- Inspected the four navigation routes, source wiring, event producers/consumers,
  SQLite schema/snapshot boundaries, package scripts and runner discovery. Focused
  command examples were checked against those definitions; behavior suites were
  not executed or claimed as passing.
- Focused Prettier validation of the seven changed Markdown documents and
  `git diff --check` passed. Diff scope was checked for repository prose only.
- Full `npm run verify` was not run for this documentation-only increment, as
  specified in its verification plan. The earlier audit architecture result is
  historical evidence and is not presented as a new check of this change.

Human check: open `AGENTS.md`, select one of the four tasks and follow the code
map to the named source, rule section and existing focused command. No unresolved
documentation error was found in the local checks. Independent review on
2026-11-02 checked the actual diff, four navigation routes against source and test
configuration, and 178 local links including heading anchors. Focused Prettier
and `git diff --check` passed; no findings required correction. Runtime suites
and full verify were not run for this documentation-only change. The user
accepted the review and authorized PR creation and merge. No release is claimed.

## Decision changes and follow-up

Planned 0032 measures and improves verification after this navigation work. Planned
0033 remains a brief until 0032 is completed. Their proposals are prepared in
separate branches; this document does not authorize their implementation.
