# 0032 sanitized evidence — 2026-11-04, updated 2026-11-05

## Local session retrospective

The initial 2026-11-04 inspection established local JSONL format and availability,
but its aggregate command-text counts did not satisfy AC9. Independent review on
2026-11-05 identified that evidence gap. The follow-up
[native-session retrospective](retrospective.md) selects and individually analyzes
completed increments 0028–0031, with sanitized session aliases, UTC turn/line
ranges, revision metadata, model/settings, resumed/aborted work and explicit
separation of implementation, independent review and inter-turn waiting.

It records concrete navigation and failure → repair → recheck examples, observed
suite durations and an unchanged-revision rerun, plus cumulative-token endpoint
differences without double counting. Historical machine/cache attribution and
active phase totals remain unavailable; those limitations do not prevent manual
classification of the available events. No raw transcripts, personal paths,
credentials, monitoring service or permanent analysis script are added.

The sample demonstrates material CLI/browser verification and repair activity,
especially in 0030, and bounded navigation costs. It does not establish a causal
slowdown from repository growth. The resulting decision is to retain the bounded
journey-risk audit below, timing, focused recipes and useful public-entry mapping;
execution/setup optimizations remain deferred because no safe speed improvement
is demonstrated. The initial aggregate text counts are superseded as AC9 evidence.

## Baseline

Source: `38b78a8` (clean initial checkout, completed 0031 already integrated).
Command: original `npm run verify`, original ordered npm chain; original serial
CLI and one-worker Chromium configurations. Windows 10.0.26300, AMD Ryzen 7 5800H,
16 logical CPUs, approximately 14 GiB memory; Node 24.21.0, npm 11.4.1,
Playwright 1.63.0, installed Chromium 153.0.8010.12 (revision 1243).
Existing node_modules/browser/cache; no reinstall or cold-cache reset. Other host
load was uncontrolled. Documentation/tooling implementation began after baseline
format/build stages; original suite files and configurations remained unchanged.

Initial sandbox attempt failed in Vite process creation (EPERM); it is not a
passing baseline. The complete rerun outside the sandbox exited 0:

| Original stage                                   | Available elapsed evidence                      | Result                         |
| ------------------------------------------------ | ----------------------------------------------- | ------------------------------ |
| typecheck, lint, formatting, architecture, build | Original runner did not time these individually | all passed                     |
| unit/component                                   | Vitest 8.53s                                    | 15 files, 213 tests passed     |
| integration                                      | Vitest 10.63s                                   | 18 files, 291 tests passed     |
| acceptance                                       | Cucumber 5.353s                                 | 40 scenarios, 222 steps passed |
| built CLI                                        | Vitest 89.65s                                   | 5 files, 36 tests passed       |
| Chromium                                         | Playwright rounded 2.6m                         | 31 tests passed                |

Baseline stage timings are incomplete because the original gate had no timing
instrumentation; do not manufacture missing durations or compare these suite-only
numbers directly with final stage wall times (which include npm startup).

## Expensive-journey risk audit and decisions

| Journeys                                                     | Distinct protected risk and retained boundary                                                                                                         | Decision                                                                                                                                           |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| cli.test.ts                                                  | Cross-process persistence/discovery with Unicode/space paths; flag parsing, error/JSON/text envelopes and generated command examples outside checkout | Retain built processes. Replacing these calls with application setup would remove the boundary explicitly asserted by these journeys.              |
| views-cli.test.ts, view-move-cli.test.ts                     | Definitions, descendant discovery, independent instance placement/order across process restarts and CLI errors/schema compatibility                   | Retain serial processes and all assertions.                                                                                                        |
| delete-cli.test.ts, guidance-cli.test.ts                     | Noninteractive deletion errors/atomic persistence; installed package without source checkout generates offline/versioned guides                       | Retain isolated workspaces, artifacts and CLI launches.                                                                                            |
| board.spec.ts, board-blocking.spec.ts                        | Built server/static assets, CLI/web parity, external CLI refresh, real keyboard/pointer transitions and blocking editor persistence                   | Retain process setup: this is actual CLI/HTTP/browser integration coverage. Some server ports are fixed (e.g. 14321); no worker increase.          |
| layout.spec.ts, quiet-feedback.spec.ts                       | Desktop/mobile geometry, persistent controls, modal focus and error recovery in both board modes                                                      | Already use direct bootstrap fixtures and ephemeral in-process servers; no CLI setup saving remains here. Retain viewports and assertions.         |
| view-move-interaction.spec.ts                                | Native selection/copy, pointer/touch/keyboard distinctions, visible insertion positions, pending writes, dialog focus and refresh failure             | Already direct fixtures/port 0. Real gesture delays protect timing-sensitive native behavior; removing them without a replacement proof is unsafe. |
| views.spec.ts, view-move.spec.ts, view-create-delete.spec.ts | Cross-mode persistence/retained hidden-board state, CLI organization and browser creation/deletion                                                    | Retain boundary and cleanup coverage.                                                                                                              |
| integration/board-proxy.test.ts                              | Real Vite proxy/Origin protection against a fixed backend port                                                                                        | Independent workspaces alone do not make concurrent whole-gate runs safe.                                                                          |

The selected-session follow-up justifies auditing the implicated expensive
CLI/browser boundaries; the retained risk mapping above supplies that bounded audit.
No suite execution/setup speed optimization was justified. No
concurrency, timeouts, retries, discovery or production code changed.
The delivered improvements are direct stage diagnostics, independently selectable
CLI checks and documented selections; no percentage speedup is claimed. Additional
benchmark repetitions would not resolve the missing historical phase labels.

For 00xx: frontend interaction and refresh coordination have substantial real
browser coverage and differing read/gesture policies. Preserve the map's hidden
Default-board events, queued View reads and focus/recovery risks when agreeing its
design. Browser fixture setup is already cheap in the geometry/interaction suites;
production splitting cannot be justified as a measured test-speed improvement here.

## Navigation, links and probes

Implementer walkthrough retained all four 0031 routes: CLI Action → domain/action
use cases/CLI contracts and transaction reconciliation; View order → domain move/
insert/order, application reconciliation and SQLite; web refresh → Board/useBoard,
useView/Workspace/client events with hidden-board warning; guidance → agents/guides,
workspace rendering/init, guidance policy and real installed-package journey.
The map retains rule/test links and build prerequisites. Only duplicated command
recipes moved to verification.md, linked by map, README and guidelines.

Focused process tests exercise actual children: success; exit 7 and no later
marker; launch failure; oversize map causing aggregate failure; Unicode/table/
wrapping/CRLF counts; below/exactly/above 1,500; missing file and directory read
failure. Temporary files are removed. SIGINT/SIGTERM handler probes terminate a
real child and grandchild and reject later stages. On Windows, IPC emits the
signal event in the runner because Node kill() does not deliver console signals;
actual console Ctrl+C delivery remains a manual limitation. POSIX process-group
code has not been run on Linux.

Focused `npx vitest run src/domain/actions tests/integration/verification-tools.test.ts`
passed before the SIGTERM extension (23 tests); final full gate includes the
extended process probes. Typecheck and focused ESLint passed after initial fixes.
Documentation path inspection excludes fenced examples: README's `work-board.md`
is a sample link inside generated Workspace Markdown, not a repository link.
Final link/format/map/diff results and complete stage timings are recorded below.

## Final verification

Instrumented baseline source identity: base `38b78a8` plus the working changes in this increment.
The LF-normalized SHA-256 of sorted path + NUL + contents for `package.json`,
`tsconfig.json`, `scripts/verify.mjs`, `scripts/code-map-check.mjs` and
`tests/integration/verification-tools.test.ts` is
`99c89848b709a41361ba74347767082a517aef3fc54603f70bdead634eaf16f6`.
This first timed complete run passed. A subsequent portability inspection found
that the Windows IPC test harness should only open IPC on Windows, to avoid keeping
the POSIX probe alive. The fixture was corrected; no production/test journey or
runner behavior changed. This concrete test risk justifies the second complete
run. The portability-rerun code/test/configuration fingerprint is `d95a286bd11cf72512bf1db75e265c4fe3e47bba64c3de2e2068d4e6031c118e` using
the same hashing procedure. Documentation changes are checked separately afterward.

All 112 relative repository links/anchors in the changed developer documents
resolved after excluding fenced Workspace examples. `git diff --check` passed.
The map counts 924 words (original: 886); the increase retains readable maintenance
rules while removing duplicated recipes. All four source-backed routes above
remain discoverable. No essential rule/test links were removed.

Two initial final-run attempts stopped before runtime suites: a moved evidence
file during formatting (exit 2), then an unformatted outcome paragraph (exit 1).
Both correctly reported the failed stage/aggregate and did not start later stages.
These were preparation errors, not passing verification. The documentation was
corrected before the complete rerun; no automatic retry was added.

The portability-check rerun failed one existing keyboard browser journey (30/31
browser tests passed), returning aggregate exit 1. Earlier suites passed. The
failure was at the second cross-column keyboard drop: the test pressed ArrowRight
then Space without awaiting the target announcement, unlike its first gesture.
The trace/error snapshot showed the card still in Source with an empty Target.
This is not recorded as a passing final run.

Correction within test scope: wait for the existing live-region `Target, position 1`
announcement before committing the second drop. The first focused probe exposed
an incorrect new expectation of append; unlike the first gesture (after ArrowDown),
the second gesture starts at position 1. Only the newly added precondition was
corrected; original outcome assertions are unchanged. This strengthens the precondition
and retains the persisted order, focus and UI assertions. No fixed delay, timeout
increase, assertion relaxation or retry was added. The named risk is sequential
keyboard target selection versus asynchronous render/drag processing. Production
behavior is unchanged. A targeted browser check and another complete gate verify
the correction; their results are recorded below. Independent review was pending
at that handoff.

## Instrumented baseline stage wall times

First complete instrumented run, same machine/cache/configuration as above,
all stages exit 0 (includes npm startup, unlike original suite durations):

```text
[verify] PASS typecheck 6.216s exit=0
[verify] PASS lint 14.257s exit=0
[verify] PASS format:check 4.573s exit=0
[verify] PASS code-map:check 0.353s exit=0
[verify] PASS architecture:check 1.202s exit=0
[verify] PASS build 3.246s exit=0
[verify] PASS test 9.189s exit=0
[verify] PASS test:integration 11.391s exit=0
[verify] PASS test:acceptance 7.062s exit=0
[verify] PASS test:cli 90.725s exit=0
[verify] PASS test:browser 153.493s exit=0
[verify] TOTAL 301.709s exit=0
```

## Failed portability-check rerun stage times

```text
[verify] PASS typecheck 6.152s exit=0
[verify] PASS lint 13.347s exit=0
[verify] PASS format:check 4.660s exit=0
[verify] PASS code-map:check 0.340s exit=0
[verify] PASS architecture:check 1.150s exit=0
[verify] PASS build 3.177s exit=0
[verify] PASS test 8.959s exit=0
[verify] PASS test:integration 10.687s exit=0
[verify] PASS test:acceptance 6.375s exit=0
[verify] PASS test:cli 85.078s exit=0
[verify] FAIL test:browser 160.727s exit=1
[verify] TOTAL 300.654s exit=1
```

## Final corrected source and focused check

Final source is base `38b78a8` plus this working diff. Using the same path/NUL/LF
hash procedure, now also including `tests/e2e/view-move-interaction.spec.ts`,
the final code/test/configuration fingerprint is `cc64826ecfbfa2a90d8cf20bb64f3e481f67f2129109722c018a7da16bb4325b`.

`npm run test:browser -- view-move-interaction.spec.ts --grep "keyboard announces exact insertion"`
passed (1 test, Playwright 3.5s) after the synchronization correction. The final full rerun passed (283.646s, aggregate exit 0). This is a manual diagnostic check after a concrete fix, not an automatic
retry policy. The full gate remains required.

## Final corrected complete verification

Windows, same environment and configurations as above; command `npm run verify`.
All 11 required stages ran once, including one build. Passed: 213 unit/component
tests, 295 integration tests (including four tooling cases), 40 acceptance
scenarios / 222 steps, 36 built CLI tests and 31 Chromium tests. No skipped checks,
retries, relaxed assertions or timeout increases were introduced.

```text
[verify] PASS typecheck 5.442s exit=0
[verify] PASS lint 12.642s exit=0
[verify] PASS format:check 4.610s exit=0
[verify] PASS code-map:check 0.344s exit=0
[verify] PASS architecture:check 1.014s exit=0
[verify] PASS build 2.807s exit=0
[verify] PASS test 8.021s exit=0
[verify] PASS test:integration 10.362s exit=0
[verify] PASS test:acceptance 6.131s exit=0
[verify] PASS test:cli 82.780s exit=0
[verify] PASS test:browser 149.492s exit=0
[verify] TOTAL 283.646s exit=0
```

The observed 283.646s versus the first timed 301.709s is not attributed to a speed
optimization: machine load/cache noise was uncontrolled, and fixture correctness
changed between runs. No claim about overall implementation time follows.
After this run only documentation evidence was updated and checked for formatting,
links/anchors, map size and diff whitespace. Source/configuration fingerprints
identify the verified working revision without pretending it is a new commit.

At the original handoff, independent review was pending. The follow-up below
records its outcome. Linux execution, physical Windows console Ctrl+C and the
human recipe walkthrough remain unperformed; controlled signal delivery is
distinguished from a physical keyboard check. Historical phase totals remain
unknown, with available per-increment evidence now analyzed separately.

## Independent review and AC9 follow-up — 2026-11-05

Independent review compared the actual diff with main and the acceptance
criteria. It found one P1 evidence gap: the original aggregate session report
did not fulfill AC9. No concrete implementation defect was confirmed. The four
code-map routes remained usable; 104 relative links/anchors in the developer
entry documents and 20 explicit recipe paths resolved, and the map check passed
at 924 words. Required checks, fail-fast ordering and test assertions were retained.

The code/test/configuration fingerprint was independently recomputed as
`cc64826ecfbfa2a90d8cf20bb64f3e481f67f2129109722c018a7da16bb4325b`,
and the native source output confirmed the original 283.646s full-gate pass.
That unchanged-revision result was reused. A controlled Windows console probe
delivered Ctrl+C to an isolated console/process tree: the runner returned 130,
did not start the later stage and left the checked descendant terminated.
This is one controlled delivery/cleanup case, not a Linux or physical-keyboard test.

The user authorized the recommended evidence correction. The linked retrospective
now provides four selected completed increments and source-traceable observations,
including specific unavailable metrics and justified next actions. The follow-up
changes repository documentation only; no production, test, runner, configuration
or dependency changed. Its source references, token arithmetic, links and
formatting are checked separately from the reused full gate.

Follow-up verification on Windows: source checks passed for 12 token ranges,
29 full-gate launch sites, 16 selected output anchors, the unchanged-rerun edit
interval and the original source fingerprint. All 50 relative links/anchors in
the four changed/new increment documents resolved. Focused Prettier checks and
`git diff --check` passed. The document and index now both record `completed`;
the AC9 finding is resolved, with the stated historical/platform limits retained.
