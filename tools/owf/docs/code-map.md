# OWF Tool Code Map

Current implementation navigation; start with [AGENTS.md](../AGENTS.md) and the current
[increment](increments/README.md). Full paths are relative to `tools/owf/`;
short module paths/filenames in task and execution rows follow their linked layer.
Use the task row to choose code, authoritative rules and tests; inspect adjacent
callers when a change crosses a boundary. This is a map, not a second specification.

## Layers and entry points

| Layer          | Responsibility and entry points                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain         | Pure rules in `src/domain/{workspaces,contexts,actions,views}/index.ts`; time, IDs and related facts arrive as values.                                                                                                          |
| Application    | Use cases in `src/application/{workspaces,contexts,owners,actions,views}/index.ts`; port contracts in [ports/index.ts](../src/application/ports/index.ts). View reconciliation is internal and re-exported by `views/index.ts`. |
| Infrastructure | Public `index.ts` exports in `src/infrastructure/{configuration,markdown,sqlite,runtime}/`; filesystem/metadata, store access, clock and IDs. Concrete adapters are assembled in bootstrap.                                     |
| Interfaces     | [CLI `runCli`](../src/interfaces/cli/index.ts) parses commands; [HTTP `createBoardServer`](../src/interfaces/http/index.ts) validates requests and maps results. Both call injected application operations.                     |
| Contracts      | [contracts/index.ts](../src/contracts/index.ts): Zod boundary schemas and transport types shared with web; no domain rules.                                                                                                     |
| Bootstrap      | [cli.ts](../src/bootstrap/cli.ts) is the executable; [workspaces.ts](../src/bootstrap/workspaces.ts) wires use cases and ports; [server.ts](../src/bootstrap/server.ts) binds HTTP operations to one Workspace.                 |
| Web            | [main.tsx](../src/web/main.tsx) mounts [Workspace](../src/web/Workspace.tsx); boards, forms, local hooks and [client.ts](../src/web/client.ts) use contracts and HTTP.                                                          |

Cross-layer imports use public exports. See [dependency boundaries](architecture.md#dependency-boundaries)
and the [architecture gate](../.dependency-cruiser.cjs); production cycles are forbidden.
Inbox, URI dispatch, Workspace registration and dedicated shared-reference modules
are deferred; their illustrative paths are not implemented. See [deferred decisions](architecture.md#open-details-and-next-gate).

## Execution paths

- CLI: `bootstrap/cli.ts` → `interfaces/cli/index.ts` → callbacks wired in
  `bootstrap/workspaces.ts` → application → domain and ports → concrete adapters.
  CLI operations work without a server; `serve` starts the HTTP composition.
- HTTP: `bootstrap/server.ts` → `interfaces/http/index.ts` → injected Workspace-bound
  use cases → the same application/domain/adapters as CLI.
- Browser: `main.tsx` → `Workspace.tsx` → `Board.tsx` or `ViewBoard.tsx` and shared
  forms → `client.ts` → HTTP. Contracts validate transport shapes at the boundary.

## Choose a task route

Read the linked rules for the chosen row; architecture owns decisions, domain
specifications own semantics and [guidelines](development-guidelines.md) own practice.
Unit/component tests live beside source; the table lists selected additional tests.

| Change                               | Starting implementation                                                                                                                                                                                                                                                           | Rules and selected tests                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Workspace initialization/discovery   | [application/workspaces](../src/application/workspaces/index.ts), `domain/workspaces`, `infrastructure/configuration`, `markdown/index.ts`                                                                                                                                        | [Persistence](architecture.md#execution-and-persistence); [Workspace identity](../../../spec/core-v0.md#5-workspace-and-identity); [workspace integration](../tests/integration/workspace.test.ts), `initialize-failure.test.ts`, `workspace-init.feature`.                                                                                                                                                        |
| Generated Workspace guidance         | [markdown/agents.ts](../src/infrastructure/markdown/agents.ts), [guides.ts](../src/infrastructure/markdown/guides.ts), `workspaceDocuments.render`, `application/workspaces`                                                                                                      | [Guidance policy](development-guidelines.md#workspace-agent-guidance); [workspace-guidance integration](../tests/integration/workspace-guidance.test.ts), [guidance audit helper](../tests/support/guidance.ts), `guidance-cli.test.ts`.                                                                                                                                                                           |
| Context creation or owner discovery  | [application/contexts](../src/application/contexts/index.ts), [application/owners](../src/application/owners/index.ts), `domain/contexts`, configuration/Markdown context adapters                                                                                                | [Core ownership](../../../spec/core-v0.md#71-structural-ownership); [contexts](../tests/integration/contexts.test.ts), [owners](../tests/integration/owners.test.ts), `context-creation.feature`, `OwnerPicker.test.tsx`.                                                                                                                                                                                          |
| Action fields, state or blocking     | [domain/actions](../src/domain/actions/index.ts), [application/actions](../src/application/actions/index.ts), `sqlite/actions.ts`                                                                                                                                                 | [Core Action](../../../spec/core-v0.md#63-action), [dependencies and blocking](../../../spec/core-v0.md#72-execution-dependencies); [Action operation contract](../../../docs/design/operational-store-notes.md#112-action-operations); colocated tests, [actions](../tests/integration/actions.test.ts), [blocking](../tests/integration/blocking.test.ts), `action-state.feature`, `action-blocking.feature`.    |
| View definitions or evaluation       | [domain/views](../src/domain/views/index.ts): `validateViewDefinition`, `evaluateView`; [application/views](../src/application/views/index.ts): `showView`, `displayView`; `markdown/views.ts`                                                                                    | [Views profile](../../../docs/design/views-profile-notes.md), [current View boundary](architecture.md#view-evaluation-and-write-command-boundary); `index.test.ts`, `evaluation.test.ts`, [view-definitions](../tests/integration/view-definitions.test.ts), [view-evaluation](../tests/integration/view-evaluation.test.ts), `view-evaluation.feature`.                                                           |
| View moves, placement or order       | `domain/views`: `moveViewAction`, `insertViewMember`, `recordViewOrder`; `application/views`: `moveAction`; [reconciliation.ts](../src/application/views/reconciliation.ts); `sqlite/views.ts`                                                                                    | [View boundary](architecture.md#view-evaluation-and-write-command-boundary); [manual order](../../../docs/design/views-profile-notes.md#7-manual-ordering); colocated `move.test.ts`, `order.test.ts`, [view-move](../tests/integration/view-move.test.ts), [view-order](../tests/integration/view-order.test.ts), `view-move.feature`, `view-order.feature`.                                                      |
| Persistence, snapshots or deletion   | [sqlite/index.ts](../src/infrastructure/sqlite/index.ts), [actions.ts](../src/infrastructure/sqlite/actions.ts), [actions-read.ts](../src/infrastructure/sqlite/actions-read.ts), [views.ts](../src/infrastructure/sqlite/views.ts); application ports and domain deletion guards | [Persistence](architecture.md#execution-and-persistence), [snapshot discipline](development-guidelines.md#boundary-and-verification-discipline), [store operation contract](../../../docs/design/operational-store-notes.md#11-minimum-operation-contract); [log-failure](../tests/integration/log-failure.test.ts), [deletion](../tests/integration/deletion.test.ts), `views-store.test.ts`, `deletion.feature`. |
| CLI syntax/output or HTTP contracts  | `interfaces/cli/index.ts`, `interfaces/http/index.ts`, `contracts/index.ts`, bootstrap callbacks                                                                                                                                                                                  | [Boundary validation](architecture.md#application-technologies); [CLI journeys](../tests/e2e/cli.test.ts), `views-cli.test.ts`, `view-move-cli.test.ts`, `delete-cli.test.ts`; [board HTTP](../tests/integration/board.test.ts), [View HTTP](../tests/integration/view-http.test.ts), `board-proxy.test.ts`.                                                                                                       |
| Default board filters/refresh        | [Board.tsx](../src/web/Board.tsx), [useBoard.ts](../src/web/useBoard.ts), `client.ts`                                                                                                                                                                                             | [Read/write lifecycle](architecture.md#browser-read-and-write-lifecycle), [UI test discipline](development-guidelines.md#tests-and-acceptance-criteria); [Board.test.tsx](../src/web/Board.test.tsx), `Workspace.test.tsx`, `board.spec.ts`.                                                                                                                                                                       |
| View selection, movement or gestures | `Workspace.tsx`, [ViewBoard.tsx](../src/web/ViewBoard.tsx), [useView.ts](../src/web/useView.ts), [ViewDragBoard.tsx](../src/web/ViewDragBoard.tsx), `ViewSelector.tsx`                                                                                                            | [Lifecycle](architecture.md#browser-read-and-write-lifecycle); [ViewBoard.test.tsx](../src/web/ViewBoard.test.tsx), `Workspace.test.tsx`, [interaction journeys](../tests/e2e/view-move-interaction.spec.ts), `view-move.spec.ts`, `views.spec.ts`.                                                                                                                                                                |
| Shared editor, creation or feedback  | [ActionEditor.tsx](../src/web/ActionEditor.tsx), `ActionForm.tsx`, `PrerequisitePicker.tsx`, `OwnerPicker.tsx`, [Notifications.tsx](../src/web/Notifications.tsx); shared `Board.module.css`                                                                                      | [UI discipline](development-guidelines.md#tests-and-acceptance-criteria), [0030 feedback contract](increments/0030-quiet-web-feedback.md); colocated editor/picker/notification tests, [quiet-feedback](../tests/e2e/quiet-feedback.spec.ts), `view-create-delete.spec.ts`, `layout.spec.ts`.                                                                                                                      |

Test-name shorthand resolves within the same row: domain tests beside its domain
module, component tests in `src/web/`, technical integration in `tests/integration/`,
CLI/browser journeys in `tests/e2e/` and `.feature` scenarios in `tests/acceptance/features/`.
Acceptance bindings are in `tests/acceptance/steps/`; shared fixtures in `tests/support/`.

## Nonlocal effects to inspect

- Action creation/state/blocking edits can affect membership and order in several
  Views and dependent Actions. [reconcilePlacements](../src/application/views/reconciliation.ts)
  runs inside the SQLite writer transaction with Action/organization/event changes.
  Definitions come from Markdown outside the database snapshot; reads do not repair data.
- View display joins Action projections, placements and order from one store read
  snapshot. API adapters and React preserve domain routing and received order.
- `useBoard` tracks confirmed snapshots separately from server-confirmed filter
  membership. `useView` freezes/queues reads during gestures and reason input.
  Both manage superseded reads and confirmed-write/refresh-failure context; their
  policies differ, so inspect both when changing a shared refresh/feedback rule.
- `Workspace` keeps Default Kanban mounted but hidden while a View is selected,
  suspending its automatic reads/sensors and retaining filters. `client.ts` emits
  `owf-action-created` after View creation and `owf-action-deleted` after deletion;
  `useBoard` consumes these even while hidden. Follow producers and consumers.
- Shared forms and notification surfaces run in both modes and dialogs. Navigation,
  pending writes, drafts, focus restoration and recovery restrictions must survive
  a transient error's dismissal; see the [UI guidelines](development-guidelines.md#tests-and-acceptance-criteria).

## Focused checks

Run from `tools/owf/` after `npm ci`. Select the row's actual files; these examples
are development checks, not a complete impact analysis or handoff verification:

```sh
npx vitest run src/domain/actions
npx vitest run src/domain/views tests/integration/view-order.test.ts
npx vitest run src/web/Board.test.tsx src/web/Notifications.test.tsx
npx vitest run tests/integration/workspace-guidance.test.ts
npm run test:acceptance -- --name "order"
```

Built-CLI and browser journeys require `npm run build` first (and an installed
Chromium for browser checks); avoid reusing output older than relevant source changes:

```sh
npx vitest run tests/e2e/cli.test.ts --no-file-parallelism
npm run test:browser -- view-move-interaction.spec.ts
```

Before code handoff run full `npm run verify`; reuse unchanged-revision evidence
for review. See [verification commands](development-guidelines.md#planned-command-interface)
and [handoff](development-guidelines.md#independent-review-and-handoff).
Repository-doc-only changes use the increment's formatting, link and diff checks.

## Maintenance

Update this map in the same increment when entry points, responsibilities or
important cross-module effects change. Routine internal edits need no map churn.
Keep one primary home for details: [architecture](architecture.md) for decisions,
[guidelines](development-guidelines.md) for practice and increment documents for history.
