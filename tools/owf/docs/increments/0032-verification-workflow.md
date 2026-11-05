# 0032 — Native session analysis and focused verification

> Status: completed
> Description: Diagnose agent overhead from existing Codex sessions, retain lightweight verification timing and focused checks, and preserve a compact, useful code map.
> Depends on: 0031 — Code map and agent navigation (completed).

The initial scope was agreed on 2026-11-02 and revised on 2026-11-04 to start
with existing local Codex session evidence before selecting optimizations.
The user approved implementation on 2026-11-04. Independent code review and its
AC9 evidence follow-up were completed on 2026-11-05.
Planning branch: `increment/0032-verification-workflow`.
Dependency [0031 — Code map and agent navigation](0031-code-map.md) is completed
and its code map is present on this branch.

## Goal and scope

Investigate the suspicion that agent implementation time grows with successive
increments. Separate orientation, editing, verification and repair overhead before
choosing changes. Neither repository growth nor longer elapsed sessions alone
establishes inefficient navigation: task complexity, model/settings, environment
and human waiting can change.

Start with a one-off retrospective of existing local Codex sessions. Use the
agent's native records rather than instrumenting each read/edit or introducing a
monitoring system. The analysis is diagnostic evidence, not an agent efficiency
score or a mandatory process for every future increment.

Retain a small portable verifier with per-stage timings, a task-to-check guide
and the agreed code-map word budget with maintenance instructions. Stage timing
answers how long checks take inside a single aggregate command; session analysis
answers how often the agent invokes them and what else happens around them.
Preserve all required checks and observable CLI, HTTP, domain and UI behavior.

The stored [0030 verification log](evidence/0030/verification-refresh-fix-windows.txt)
records about 6.5 seconds for unit/component tests, 10.2 for integration, 5.9 for
acceptance, 82.9 for built-CLI E2E and 2.3 minutes for Chromium. The latter two
account for approximately 90% of recorded test-group duration, not 90% of agent
implementation time. This historical Windows evidence identifies candidates for
investigation, not proof of redundant tests or the cause of overall slowdown.

A detailed expensive-test audit and test execution/setup optimization are
conditional on the retrospective demonstrating material verification overhead.
Orientation and repair findings may instead justify documentation improvements
within this scope or recommendations for separately agreed work. Production
restructuring, including the later 00xx frontend brief, is outside this increment.
No service, dashboard, database, OTel collector, per-action instrumentation,
new framework or dependency is introduced.

References: [development guidelines](../development-guidelines.md),
[architecture](../architecture.md), [package scripts](../../package.json),
[Vitest configuration](../../vitest.config.mjs),
[Playwright configuration](../../playwright.config.ts).

## Proposed solution

### Start with native Codex session evidence

Analyze 3–5 completed increments where logs are available, preferring tasks of
roughly comparable scope and identifying why each was selected. Use local
`rollout-*.jsonl` session records under `$CODEX_HOME/sessions/`
(`~/.codex` is the default home). Locate records in the environment that actually
ran Codex: native Windows, WSL and containers can have different homes.
Check the installed `codex --version` and inspect one representative record before
assuming which events, timestamps, usage fields or durations are available.
Internal rollout formats may vary by version or include compressed records;
document supported inputs and gaps rather than assuming a stable parser API.
Do not treat `history.jsonl` as a complete tool execution trace.

Keep the normal interactive workflow. For future non-interactive runs,
`codex exec --json` is an optional event source, not a required migration or
replacement for missing historical evidence. Do not enable OTel export or
diagnostic logging solely to satisfy this retrospective.

First inspect records directly. Add a small offline, dependency-free analysis
script only if repeated extraction warrants it and the actual format is known.
Such a script reads explicitly selected files and writes a local report; it is
not an OWF product feature, a full log viewer, a new verification gate or an
ongoing telemetry pipeline. Preserve original logs. Save only a concise,
sanitized findings report in the repository, not raw prompts, source dumps,
credentials or complete session transcripts.

Record increment/revision, selected sessions and relevant turn ranges, task
scope, Codex version, model and reasoning effort, platform and machine/cache
conditions where known. Mark unknown metadata explicitly. Account for resumed
sessions and delegated work where present, avoiding duplicate shared history.
Separate implementation from independent review, user waiting and unrelated work.

Use available evidence to examine:

| Question              | Diagnostic evidence                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| Orientation overhead  | Time and search/read commands before the first relevant edit; explain planning mixed into this interval.        |
| Repeated navigation   | Repeated searches or reads of unchanged regions, interpreted in their task context.                             |
| Verification overhead | Focused/full check invocations, observed durations and repetitions on unchanged revisions.                      |
| Repair overhead       | Edit → failure → repair → recheck cycles and their concrete failure causes.                                     |
| Context growth        | Available input/cached/output token usage and compaction events, without equating tokens with unique code read. |

Distinguish measured values, manual classifications and estimates. Do not
invent unavailable command durations or phase boundaries. Timestamp gaps can
contain model/service latency, waiting or overlapping work; they are not direct
measurements of model thinking. Count resumed/delegated activity and cumulative
token counters without double counting. When calculating elapsed tool time,
account for overlapping intervals rather than adding parallel durations.
A repeated read or a long planning interval is not automatically waste.

If the records cannot support a metric, report that limitation. If fewer than
three usable increments are available, analyze those available and document the
shortfall; do not manufacture comparability, rerun completed implementations or
build infrastructure to fill the gap. When local records are inaccessible,
identify the missing inputs and defer the empirical conclusion and conditional
optimizations; repository history alone is not a substitute.

Conclude which overhead is demonstrated, which remains uncertain and which
bounded action follows. A small observational sample cannot establish a causal
trend across all increments or prove that a larger codebase caused slowdown.

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

### Select improvements from demonstrated overhead

Use the retrospective findings to decide whether expensive CLI/browser journeys
need a detailed audit in this increment. Record the decision and evidence.
Do not audit every expensive journey or change parallelism simply because its
historical duration is high. If verification is not demonstrated as material
overhead, deliver the diagnostic findings, lightweight timing, focused guide and
code-map discipline, and defer test optimizations with a reason.

When a test optimization is justified, capture a baseline before that change,
identifying source revision, exact command/configuration, Node/npm/browser
versions, platform and relevant machine/cache conditions. Compare with a final
complete run under comparable conditions. Separate instrumentation changes from
speed improvements. Additional benchmark repetitions need a concrete uncertainty
to resolve; there is no required speedup or mandatory benchmark campaign when
no execution/setup optimization is made. The final timed verification still
provides a reference observation.

Limit the audit to implicated journeys and record the distinct process,
integration or browser risk each protects. Prefer cheaper fixture setup only
when the exercised boundary remains covered; consider parallelism only after
checking independent Workspaces, ports, cleanup and process ownership, including
shared resources such as the fixed-port proxy integration test.

Implement only safe, bounded test/tooling improvements supported by these
findings. Retain serial execution where isolation or resources do not support
parallelism. A finding that an apparent optimization is unsafe is a valid result.
Defer broader architecture or workflow changes for separate agreement; findings
do not authorize production refactoring.

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
- **AC4 — Evidence-led optimization decision:** the outcome explains whether
  session evidence warrants an expensive-test audit. If warranted, the bounded
  audit records protected risks, retained coverage, improvements and deferrals;
  execution/setup optimizations have comparable before/after timing evidence.
  Otherwise the audit and optimization are explicitly deferred. Final stage
  timings identify revision/environment; no fixed speedup is required.
- **AC5 — Preserved confidence:** required checks and acceptance behavior remain
  intact. Any execution/setup optimization demonstrates isolation, cleanup and
  retained boundary coverage. No skipped checks, relaxed assertions, timeout
  increases or automatic retries are introduced.
- **AC6 — Complete handoff:** full `npm run verify` passes on the final code/test/
  configuration revision; focused checks and historical evidence are distinguished
  from that result. The outcome supplies findings useful for detailing 00xx.
- **AC7 — Bounded code map:** `npm run code-map:check` accepts at most 1,500 counted
  words, reports path/count/ceiling, rejects oversize or unreadable input and runs
  once within the timed full verification. Its counting rules are documented and
  unaffected by table padding, wrapping or line-ending differences.
- **AC8 — Useful maintenance:** the guidelines and map explain how to reduce size
  while retaining essential words, names, links, routes and readable explanations.
  The four representative 0031 navigation routes remain usable after any map
  edits. Passing the size check does not substitute for navigation/link review.
- **AC9 — Native-session retrospective:** a sanitized report analyzes 3–5
  selected completed increments, or explicitly records unavailable inputs and a
  smaller sample/deferred conclusion. It separates implementation/review/waiting,
  reports available navigation, verification, repair and context signals, and
  distinguishes observations from estimates and causal claims. It records
  versions/settings, comparison limits and a justified next action. No ongoing
  monitoring infrastructure or mandatory non-interactive workflow is added.

## Verification plan

- For AC1–AC2, use controlled child commands to check success, nonzero exit,
  interruption and that later stages do not execute after failure. Exercise the
  actual process boundary and stage selection without repeatedly launching the
  entire suite for these cases. Demonstrate a deliberately failing check is
  reported as a failed aggregate, then remove any temporary probe.
- For AC3, inspect package scripts and test paths, resolve documentation links,
  and exercise representative focused recipes. Document build prerequisites and
  preserve the distinction between selected checks and complete verification.
- For AC4–AC5, check the optimization decision against the retrospective.
  If no optimization is warranted, verify the reason for deferral rather than
  requiring a test audit or before/after benchmark. For execution/setup changes,
  review comparable timing evidence and retained risk coverage. Where parallelism
  changes, demonstrate isolated resources and cleanup after a controlled failure;
  one successful concurrent run is insufficient.
- For AC9, trace representative reported observations back to local source events.
  Check turn boundaries, missing data, cumulative usage and overlapping commands.
  Verify that the committed report contains only sanitized findings. If an offline
  script is added, use small sanitized fixtures to verify the supported format
  and meaningful missing-data/aggregation cases; do not add a generic log platform.
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
  portable without claiming an unperformed Linux run. Keep sanitized retrospective
  and applicable timing evidence under `docs/increments/evidence/0032/` and link it from the outcome.
- Human check: choose a changed area in the guide, run its focused command, then
  run the aggregate and inspect the stage summary and exit status.
  For a map edit, also run `npm run code-map:check` and review retained task routes
  and links; a passing count alone does not establish useful navigation.

## Open questions

Availability and detail of historical local Codex records must be established
during the retrospective. Missing records limit conclusions and conditional
optimizations, but do not justify new monitoring infrastructure. No specific
parallel worker count, test consolidation or production restructuring is
pre-approved. Implementation follows the approved design.

## Implementation and review outcome

Implementation and independent review are complete; status is `completed`.
The user approved implementation on 2026-11-04. Local session availability/format
was inspected first; only [sanitized findings and verification evidence](evidence/0032/findings.md)
are retained. The [per-increment retrospective](evidence/0032/retrospective.md)
analyzes four completed increments with source-traceable observations and explicit
limits; historical active-work phase totals cannot be reliably reconstructed.

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
failure with its synchronization correction are recorded in the evidence. The
original baseline's missing per-stage timing instrumentation is an explicit
evidence limitation. Final full-gate results,
source identity, environment, focused checks, navigation walkthrough and probe
results are recorded in the linked evidence. Independent review confirmed no
concrete implementation defect and identified one P1 evidence gap in AC9. A
controlled Windows console Ctrl+C probe returned 130, stopped later stages and
terminated the checked descendant. Linux execution, a physical-keyboard Ctrl+C
check and the human recipe walkthrough remain unperformed; none is claimed passed.
The unchanged code/test/configuration fingerprint matches the recorded full gate,
which was reused rather than rerun for the documentation-only follow-up.

During push, two remote design commits were discovered and integrated. They add
AC9 and make the detailed audit conditional. The first report's aggregate counts
were insufficient; independent review explicitly kept AC9 open. The user then
authorized the recommended correction. The 2026-11-05 follow-up analyzes 0028,
0029, 0030 and 0031 individually, with selection reasons, session/turn/line aliases,
implementation/review/waiting boundaries, known settings, navigation examples,
failure/repair/recheck cycles, observed suite times and token endpoint differences.
Source checks verified 12 token ranges, 29 full-gate launch sites and 16 selected
output anchors, including one unchanged-revision rerun. This resolves the AC9
finding without inventing historical active-phase durations or cache conditions.

The sample demonstrates material CLI/browser verification and repair activity,
especially in 0030, warranting the retained bounded journey-risk audit. That audit
supports keeping required process/browser boundaries and serial settings; it
does not justify an execution/setup speed optimization. The delivered timing,
focused recipes and public-entry navigation address the observed costs. No causal
trend from repository growth, suite speedup or production-refactor benefit is
claimed. For 00xx, concrete refresh/notification repair examples supplement the
preserved coordination-risk map. All review findings are resolved; platform and
manual-check limitations remain explicit in the evidence.

Documentation follow-up on 2026-11-05: the user authorized making the observed
workflow explicit in developer guidance. Guidelines now own focused development,
cheap preflight checks, failure diagnosis, final-revision full verification and
unchanged-revision review reuse; verification.md gives the practical loop and
AGENTS.md links to it. Handoff records the verified revision and reasons for
additional full gates in the existing outcome. No runtime gate, test, dependency
or monitoring infrastructure changes in this follow-up. Earlier runtime evidence
remains scoped to its recorded revision; this prose follow-up requires
documentation checks and is not included in the earlier independent review.
Follow-up validation: diff whitespace and changed-link/anchor inspection passed.
Prettier was unavailable in the editing environment (offline package cache miss).
On 2026-11-05 the user subsequently reported that local `npm run verify` passed
in approximately 140 seconds and authorized merging this branch into main.
This user-reported full-gate result covers the documentation follow-up, including
formatting; no raw output or additional environment details were supplied.
The remote branch head at authorization was `f969fb7`; the exact local working-tree
identity was not supplied. The 140-second observation is not a controlled speedup
comparison with earlier runs. This evidence update changes repository prose only.

## Decision changes and follow-up

On 2026-11-02, the user expanded 0032 to include the 1,500-word code-map gate and
explicit maintenance instructions protecting useful prose, names and links.
This adds a documentation check to the verification workflow; it does not extend
the separate generated Workspace AGENTS.md ceiling to repository files or change
0031's delivered documentation scope. Implementation, review and the evidence
correction are recorded above.

On 2026-11-04, the scope was revised to diagnose overhead from existing native
Codex records first. Lightweight stage timing, focused checks and the code-map
budget remain; the detailed test audit and optimizations depend on demonstrated
overhead. This replaces the unconditional expensive-test audit and baseline/final
optimization exercise, without creating a monitoring system.

The frontend-coordination brief is parked as 00xx on branch
`increment/00xx-web-coordination`; it reserves no implementation number.
Revisit it only when findings justify selecting that work, using the current
source tree, navigation map and verification evidence. Assign an available number
and agree detailed scope and acceptance criteria before implementation. Other backend/file splitting
remains deferred until a concrete change justifies it.
