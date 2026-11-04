# Verification recipes

Run commands from `tools/owf/` after `npm ci`. These are development selections;
full `npm run verify` is required before code handoff. Inspect the selected
[code-map route](code-map.md), adjacent callers, shared contracts and nonlocal
consumers before choosing checks. A file selection is not an impact proof.

## Select checks during development

| Changed area                       | Focused command                                                                                                                                                            | Why broaden selection                                                                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository documentation           | `npx prettier --check docs/verification.md` (substitute changed files), relative-link inspection and `git diff --check`; add `npm run code-map:check` when the map changes | Check linked rule sections and all four navigation routes after map edits. Runtime suites are unnecessary for prose alone.                                   |
| Domain Action rules                | `npx vitest run src/domain/actions`                                                                                                                                        | State/blocking affects View membership and reconciliation; add Action integration, affected View tests and acceptance scenarios.                             |
| Domain View rules/order            | `npx vitest run src/domain/views tests/integration/view-order.test.ts tests/integration/view-move.test.ts`                                                                 | Read/write ordering spans domain, application reconciliation and persisted placements.                                                                       |
| Application/persistence            | `npx vitest run tests/integration/actions.test.ts tests/integration/log-failure.test.ts tests/integration/deletion.test.ts`                                                | Transaction, rollback and snapshot changes also need View store/evaluation/order tests, affected application unit tests and acceptance.                      |
| CLI/HTTP contracts                 | `npx vitest run tests/integration/board.test.ts tests/integration/view-http.test.ts tests/integration/board-proxy.test.ts`                                                 | Inspect contracts, CLI parsing and bootstrap callbacks; add built CLI journeys and affected browser consumers.                                               |
| Board data/refresh                 | `npx vitest run src/web/Board.test.tsx src/web/Workspace.test.tsx`                                                                                                         | Shared client/events affect hidden Default Kanban and View reads; add `ViewBoard.test.tsx`, then `npm run test:browser -- board.spec.ts`.                    |
| Editor/feedback                    | `npx vitest run src/web/ActionEditor.test.tsx src/web/Notifications.test.tsx`                                                                                              | Shared forms appear in both boards/dialogs; add picker tests, `npm run test:browser -- quiet-feedback.spec.ts layout.spec.ts`.                               |
| View interaction                   | `npx vitest run src/web/ViewBoard.test.tsx src/web/Workspace.test.tsx`                                                                                                     | Queued reads, pending gestures, focus and ordering require real browser coverage: `npm run test:browser -- view-move-interaction.spec.ts view-move.spec.ts`. |
| Generated Workspace guidance       | `npx vitest run tests/integration/workspace-guidance.test.ts`                                                                                                              | Generated AGENTS, Knowledge links, installed version and topic examples cross boundaries; add built `guidance-cli.test.ts` and inspect guidance policy.      |
| Verification tooling/configuration | `npx vitest run tests/integration/verification-tools.test.ts`                                                                                                              | Process invocation, discovery, build order and failure propagation affect the whole gate; run full verification after changes.                               |

For acceptance selection, for example `npm run test:acceptance -- --name "order"`,
inspect scenario names in `tests/acceptance/features/` first. Selected Gherkin
scenarios protect observable application behavior, not just technical plumbing.

## Built boundaries and prerequisites

Before any CLI/browser selection, run `npm run build`; rebuild after relevant
source changes. Browser tests additionally require installed Playwright Chromium
(`npx playwright install chromium` when absent).

```sh
npm run build
npx vitest run tests/e2e/guidance-cli.test.ts --no-file-parallelism
npm run test:browser -- view-move-interaction.spec.ts
```

`test:cli` runs all built CLI journeys serially. For one file, use the direct
Vitest selection above; appending a filename to the package script would retain
its existing `tests/e2e` filter as well. `test:browser` runs Chromium with one worker. `test:e2e` aggregates both
and also requires the prior build. Keep the fixed-port proxy integration test and
browser servers in mind before overlapping runs. Tests own normal fixture/server
cleanup; the verifier terminates the active process tree on SIGINT/SIGTERM
(Windows `taskkill /T /F`, POSIX process group). Killing the verifier forcibly
outside its signal handlers cannot guarantee cleanup.

## Complete handoff gate

`npm run verify` streams and times each required stage once: types, lint,
formatting, code-map budget, architecture, build, unit/component, integration,
acceptance, CLI and browser. It builds once before built-output suites. Failure
stops subsequent stages and returns nonzero; the total is diagnostic wall time,
not a speed threshold. No retry or telemetry store is involved.

Reuse a passing run for an unchanged code/test/configuration revision in independent
review; rerun checks for a concrete changed risk. Record platform, exact revision
(or base plus working diff), commands, results and limitations. Full verification
does not replace independent diff/criteria review.

## Code-map budget and navigation review

`npm run code-map:check` checks `docs/code-map.md`. The checker owns the inclusive
1,500-word ceiling. It counts whitespace-separated Markdown source tokens containing
at least one Unicode letter or digit. Headings, code, paths and link text count;
standalone punctuation and table separators do not. Table padding, line wrapping
and LF/CRLF do not affect the count. This approximates words, not model tokens.
An unreadable or oversized map fails with a diagnostic.

Retain entry names, routes, authoritative links, nonlocal warnings and build/check
prerequisites in readable prose. Remove duplication/stale content first; move
detail to its primary document with a concise summary and direct link. Do not
abbreviate away meaning, concatenate words or move essential orientation to another
mandatory map. Do not silently raise/bypass the ceiling: record an unresolved
trade-off for a separately agreed design change if necessary.

For map edits, inspect CLI Action, View ordering, web refresh and generated-guidance
routes against [0031](increments/0031-code-map.md), resolve links and run formatting,
`code-map:check` and `git diff --check`. A passing count measures size alone.
