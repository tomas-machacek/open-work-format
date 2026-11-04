# 0032 — Measured and focused verification workflow

> Status: in_progress
> Description: Measure verification stages, document focused checks, keep the code map compact and optimize demonstrated test overhead while preserving complete handoff verification.
> Depends on: Completion of 0031 — Code map and agent navigation.

Scope and sequencing were agreed on 2026-11-02. The user approved implementation on 2026-11-04; implementation is in progress.
Planning branch: `increment/0032-verification-workflow`, independently based on
main at `b1a5761`. Completed [0031](0031-code-map.md) is integrated through commit `8c0b972`.
On 2026-11-02 the user also agreed to include a code-map size check and maintenance
instructions preserving essential navigation and readable text.

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

Scope includes portable verification timing, a task-to-check guide, a code-map
word budget with maintenance instructions, an audit of the expensive journeys
and evidence-backed improvements to test setup or execution.
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
E2E. Add the code-map check described below after formatting, keeping the relative
order of the existing stages. Invoke npm scripts as child processes, streaming
their output; do not build a second test discovery or selection system.

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

### Code-map size and maintenance discipline

Add a lightweight `npm run code-map:check` command for `docs/code-map.md`, delivered
by 0031, and include it as a timed required stage of `npm run verify`. Set a maximum
of **1,500 counted words**, including the boundary value. Keep the limit in one
authoritative location in the checker, document it and add no dependency.

Use a deterministic count of whitespace-separated Markdown source tokens that
contain at least one Unicode letter or digit. Headings, table content, code and
path/link text count; standalone punctuation and table separators do not. Extra
table padding, line wrapping and LF versus CRLF must not change the count. This
is an approximate word budget, not a measurement of model tokens or reading time.

The command reports the path, actual count when readable and ceiling, and fails
when the count exceeds the ceiling or the file cannot be read. Read failures have
an explicit diagnostic. The oversize failure message directs the
agent to preserve useful navigation while moving excess detail to its primary
documentation home. Documentation-only recipes include this command whenever
the map changes, alongside formatting, link and diff checks.

Extend the code-map maintenance guidance introduced by 0031 in
`docs/development-guidelines.md` and the map's Maintenance section with these rules:

- Preserve important entry-point names, task routes, authoritative rule/test
  links, nonlocal-effect warnings and verification/build prerequisites. Retain
  enough explanation for an unfamiliar agent to choose the correct route.
- When the budget is exceeded, first remove duplication or stale material and
  move detailed explanations to their primary architecture, topic or increment
  document, retaining a concise useful summary and direct link in the map.
- Keep natural, readable prose. Do not delete important words or links, use opaque
  abbreviations, concatenate words, or relocate essential orientation into another
  mandatory map merely to satisfy the numeric check.
- Do not raise or bypass the ceiling silently. If essential navigation cannot fit
  after sensible editing, record the trade-off for a separately agreed budget or
  navigation-design change instead of weakening the map.

The automated check measures size only. Review must also verify that the selected
task routes remain discoverable and their important links remain intact; a smaller
file alone is not a successful outcome.

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
- **AC7 — Bounded code map:** `npm run code-map:check` accepts at most 1,500 counted
  words, reports path/count/ceiling, rejects oversize or unreadable input and runs
  once within the timed full verification. Its counting rules are documented and
  unaffected by table padding, wrapping or line-ending differences.
- **AC8 — Useful maintenance:** the guidelines and map explain how to reduce size
  while retaining essential words, names, links, routes and readable explanations.
  The four representative 0031 navigation routes remain usable after any map
  edits. Passing the size check does not substitute for navigation/link review.

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
- For AC7, exercise counts below, exactly at and above 1,500, Unicode text,
  Markdown table padding/wrapping, LF/CRLF and missing/unreadable input. Check
  diagnostics and nonzero propagation through the aggregate. Demonstrate a
  representative oversize map fails without weakening the limit, then remove the
  temporary probe. Keep tests focused on the contractual boundary and failure
  behavior, not implementation call sequences.
- For AC8, inspect the maintenance instructions and repeat 0031's CLI Action,
  View ordering, web refresh and generated-guidance navigation walkthroughs.
  Check important rule/test links and summaries against the pre-edit map. Confirm
  any size reduction came from removing duplication/stale material or extracting
  detail with retained summaries/links, rather than losing essential orientation.
- Run applicable focused checks during implementation and full `npm run verify`
  before handoff. Record actual Windows results; command design must remain
  portable without claiming an unperformed Linux run. Keep benchmark evidence
  under `docs/increments/evidence/0032/` and link it from the outcome.
- Human check: choose a changed area in the guide, run its focused command, then
  run the aggregate and inspect the stage summary and exit status.
  For a map edit, also run `npm run code-map:check` and review retained task routes
  and links; a passing count alone does not establish useful navigation.

## Open questions

None blocking the proposed design. The measured bottlenecks determine the exact
safe setup/execution optimizations during implementation. Parallel worker counts
and test consolidation are not pre-approved outcomes. Implementation follows the approved design.

## Implementation and review outcome

Implementation is delivered for independent review; status remains `in_progress`.
The user approved implementation on 2026-11-04. Local session availability/format
was inspected first; only [sanitized findings and verification evidence](evidence/0032/findings.md)
are retained. Historical phase timings cannot be reliably reconstructed.

Delivered: portable timed fail-fast Node runner; named CLI suite with unchanged
aggregate E2E coverage; Unicode-aware inclusive code-map budget; process/budget
regression probes; focused verification guide linked from developer entry points;
readable map maintenance rules and retained navigation routes. No production or
test-journey assertions were relaxed; worker counts, timeouts, retries and
dependencies are unchanged. A discovered keyboard test race now waits for the
existing target announcement before the second drop, retaining all outcome checks.
The audit justified retaining expensive boundaries and existing serial execution;
no suite speedup or reduced overall agent implementation time is claimed.

The original full Windows gate passed at baseline. The final complete Windows
`npm run verify` passed in 283.646s (exit 0): 213 unit/component tests, 295 integration
tests, 40 acceptance scenarios, 36 CLI tests and 31 Chromium tests. The map has
924 counted words. Failure probes, focused checks and one intermediate browser
failure with its synchronization correction are recorded in the evidence. Its missing per-stage timing
instrumentation is an explicit evidence limitation. Final full-gate results,
source identity, environment, focused checks, navigation walkthrough and probe
results are recorded in the linked evidence. Independent review, actual Windows
console Ctrl+C delivery and Linux execution remain outstanding; completion awaits
independent review and resolution of any findings.

## Decision changes and follow-up

On 2026-11-02, the user expanded 0032 to include the 1,500-word code-map gate and
explicit maintenance instructions protecting useful prose, names and links.
This adds a documentation check to the verification workflow; it does not extend
the separate generated Workspace AGENTS.md ceiling to repository files or change
0031's delivered documentation scope. Implementation is recorded above; independent review remains pending.

After 0032 is completed, revisit the 0033 frontend-coordination brief using the
current source tree, navigation map and verification evidence. Agree its detailed
scope and acceptance criteria before implementation. Other backend/file splitting
remains deferred until a concrete change justifies it.
