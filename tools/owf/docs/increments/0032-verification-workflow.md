# 0032 — Measured and focused verification workflow

> Status: draft
> Description: Measure verification stages, document focused checks and optimize demonstrated test overhead while preserving complete handoff verification.
> Depends on: Completion of 0031 — Code map and agent navigation.

Scope and sequencing were agreed on 2026-11-02. This document proposes the
detailed design and acceptance criteria; implementation has not started.
Planning branch: `increment/0032-verification-workflow`, independently based on
main at `b1a5761`. The 0031 proposal is in `increment/0031-code-map`; integrate
completed 0031 before implementation and add its document link at that point.

## Goal and scope

The cost of an increment includes orientation, implementation, verification and
repair. Repository history alone cannot establish how much code an agent reads
or how those phases contribute to elapsed implementation time. This increment
makes verification cost observable and makes focused development checks easier
to choose without treating them as complete handoff evidence.

The stored [0030 verification log](evidence/0030/verification-refresh-fix-windows.txt)
records about 6.5 seconds for unit/component tests, 10.2 for integration, 5.9 for
acceptance, 82.9 for built-CLI E2E and 2.3 minutes for Chromium. The latter two
account for approximately 90% of recorded test-group duration. This is historical
Windows evidence, not a new benchmark or proof of redundant tests. Whole-file CLI
parallelism is disabled and Playwright uses one worker.

Scope includes portable verification timing, a task-to-check guide, an audit of
the expensive journeys and evidence-backed improvements to test setup or execution.
Preserve all required checks and the observable CLI, HTTP, domain and UI behavior.
Frontend production restructuring is reserved for the later 0033 brief.

References: [development guidelines](../development-guidelines.md),
[architecture](../architecture.md), [package scripts](../../package.json),
[Vitest configuration](../../vitest.config.mjs),
[Playwright configuration](../../playwright.config.ts).

## Proposed solution

### Stage timing with complete verification

Use a small portable Node runner under `scripts/` behind `npm run verify`. Keep
the existing required stages and their order: typecheck, lint, formatting,
architecture, build, unit/component, integration, acceptance, CLI E2E and browser
E2E. Invoke the existing npm scripts as child processes, streaming their output;
do not build a second test discovery or selection system.

Expose CLI E2E as a named `test:cli` script so it can be timed and selected
independently. Retain `test:e2e` as the aggregate CLI-plus-browser command and
`test:browser` as the existing browser-only command. The top-level verifier must
run each required suite once and build once before suites requiring built output.
Focused commands that require a build must document that precondition.

Report stage name, elapsed wall time, result/exit code and total elapsed time.
On failure, report the failed stage and do not claim later stages ran. Preserve
fail-fast behavior and a nonzero aggregate result; interruption must not become
success or leave child servers running. Use cross-platform process invocation,
without requiring PowerShell, Bash or a new dependency. Keep timing diagnostic:
there is no machine-dependent duration threshold, automatic retry, persistent
telemetry service or timing database.

### Focused development checks

Add `docs/verification.md` as the primary owner of task-specific verification
recipes. Link it from the code map delivered by 0031, the developer README and
the guidelines; retain the rules and required full handoff command in guidelines.

Cover documentation-only changes, domain rules, application/persistence,
CLI/HTTP contracts, board data/refresh, editor/feedback, View interaction and
generated Workspace guidance. Give concrete existing file/suite selections,
build prerequisites and the reason for broader checks when shared contracts,
transaction boundaries or runner/configuration changes are involved.

Selection is a development aid, not an automatic proof of change impact. Explain
how to inspect adjacent callers and nonlocal effects. Full `npm run verify`
remains required for code handoff. Reuse verification of an unchanged revision
during independent review; a concrete changed risk determines further checks.

### Measure first, then make bounded improvements

Capture a baseline on the implementation checkout before optimization, identifying
the source revision, exact command/configuration, Node/npm/browser versions,
platform and relevant machine/cache conditions. Compare with a final complete
run under comparable conditions. Separate instrumentation changes from actual
speed improvements; record noise and limitations rather than asserting a precise
improvement from incomparable runs. Additional benchmark repetitions need a
concrete uncertainty to resolve.

Inspect the most expensive CLI and browser journeys and record which distinct
process, integration or browser risk each protects. Prefer cheaper fixture setup
when it does not remove the CLI boundary being exercised, reduce repeated setup,
and consider parallelism only after checking independent Workspaces, ports,
cleanup and process ownership. The fixed-port proxy integration test is an
example of a shared resource that must be considered.

Implement safe, measured improvements found within this test/tooling scope.
Retain serial execution where isolation or available resources do not support
parallelism. A documented finding that an apparent optimization is unsafe is a
valid audit result, not a reason to weaken the gate. Record remaining expensive
but necessary journeys and any work deferred to a separately scoped increment.

Do not remove acceptance obligations, skip tests, relax assertions, raise existing
timeouts or add retries to improve timing. Moving a technical assertion to a
cheaper layer requires a named risk mapping and retained appropriate boundary
coverage. No production refactor, CI, release change or new test framework.

Repository developer documentation changes; generated Workspace guides, help,
examples and the generated AGENTS.md ceiling are unaffected.

## Acceptance criteria

- **AC1 — Complete timed gate:** `npm run verify` runs every required stage once
  on success, reports stage and total elapsed times and preserves existing build
  prerequisites, checks and fail-fast/nonzero behavior.
- **AC2 — Reliable failure reporting:** failed commands and interruption cannot
  produce a successful aggregate result or a claim that unrun checks passed.
  Process invocation is portable and cleanup responsibility is explicit.
- **AC3 — Focused recipes:** `docs/verification.md` covers the listed change
  categories with valid commands, test paths, prerequisites and reasons to broaden
  selection. The 0031 map and developer entry points link to this primary guide.
- **AC4 — Evidence-backed audit:** baseline and final stage timings identify their
  revisions and environment. The expensive-journey audit records protected risks,
  retained coverage, implemented improvements and justified deferrals. Timing
  claims distinguish observed results from noise and projections; no fixed speedup
  percentage is required.
- **AC5 — Preserved confidence:** required checks and acceptance behavior remain
  intact. Any execution/setup optimization demonstrates isolation, cleanup and
  retained boundary coverage. No skipped checks, relaxed assertions, timeout
  increases or automatic retries are introduced.
- **AC6 — Complete handoff:** full `npm run verify` passes on the final code/test/
  configuration revision; focused checks and historical evidence are distinguished
  from that result. The outcome supplies findings useful for detailing 0033.

## Verification plan

- For AC1–AC2, use controlled child commands to check success, nonzero exit,
  interruption and that later stages do not execute after failure. Exercise the
  actual process boundary and stage selection without repeatedly launching the
  entire suite for these cases. Demonstrate a deliberately failing check is
  reported as a failed aggregate, then remove any temporary probe.
- For AC3, inspect package scripts and test paths, resolve documentation links,
  and exercise representative focused recipes. Document build prerequisites and
  preserve the distinction between selected checks and complete verification.
- For AC4–AC5, review before/after evidence and changes to test risk coverage.
  Where parallelism changes, test concurrent execution with separate resources
  and demonstrate cleanup after a controlled failure. Do not enable concurrency
  solely because one successful run happened to pass.
- Run applicable focused checks during implementation and full `npm run verify`
  before handoff. Record actual Windows results; command design must remain
  portable without claiming an unperformed Linux run. Keep benchmark evidence
  under `docs/increments/evidence/0032/` and link it from the outcome.
- Human check: choose a changed area in the guide, run its focused command, then
  run the aggregate and inspect the stage summary and exit status.

## Open questions

None blocking the proposed design. The measured bottlenecks determine the exact
safe setup/execution optimizations during implementation. Parallel worker counts
and test consolidation are not pre-approved outcomes. The proposal remains draft.

## Implementation and review outcome

Pending implementation and review. Record baseline/final revisions and timings,
the expensive-test risk mapping, implemented changes or justified deferrals,
actual checks/platform, failure-probe results and review findings. Do not claim
reduced overall agent implementation time from test timings alone.

## Decision changes and follow-up

After 0032 is completed, revisit the 0033 frontend-coordination brief using the
current source tree, navigation map and verification evidence. Agree its detailed
scope and acceptance criteria before implementation. Other backend/file splitting
remains deferred until a concrete change justifies it.
