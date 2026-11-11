# 0039 — Bound CLI test journeys

> Status: completed
> Description: Keep CLI process coverage while separating independent cases that accumulate startup time in one test.
> Depends on: [0038 verification blocker](0038-inbox-capture-polish.md#verification-and-visual-inspection).

## Goal and scope

The user approved this repair on 2026-11-11 after reviewing the diagnostic
proposal. Three Action CLI tests each launch 13 processes inside the default
5-second test budget. A diagnostic Windows run passed at 3.85–3.97 seconds per
test; individual commands, including help and argument rejection, took
280–326 ms. The failed 0038 gate also records waiting-state and blocking-journey
timeouts. These observations support reducing accumulated process startup work;
they do not establish a production performance regression.

Repair the affected CLI journeys and their local process helper. Preserve all
behavioral assertions, required suites, serial CLI execution and existing timeout
ceilings. Production code, dependencies, retries and global runner settings are
outside scope. Generated Workspace guidance, command help and examples are unchanged.

## Proposed solution

Separate successful journeys, argument tables and help checks in
`tests/e2e/cli.test.ts`. Use independently named `test.each` cases with a fresh
Workspace and unchanged-data assertions for each rejection. Prepare supporting
data through the existing bootstrap application operations, as other CLI suites
already do. Keep the operation being tested in a real built CLI process and keep
the create/get persistence round trip across separate processes.

Separate the blocking journey into cohesive manual-block, prerequisite lifecycle
and cycle cases. Retain its JSON/text projections, completion rejection, atomicity
and subsequent state-change checks. Give the local synchronous process helper an
explicit child timeout and report command, error, signal and stderr on execution
failure so a hung child cannot block indefinitely.

## Acceptance criteria

- **AC1 — Preserved boundaries:** create/get still crosses CLI processes; successful
  writes, reads, help and every existing invalid-argument case retain their real
  CLI boundary, output/exit checks and relevant persisted-data assertions.
- **AC2 — Bounded cases:** independent argument cases receive independent test
  budgets and isolated Workspaces; supporting fixture setup avoids unnecessary
  process startup. Waiting-state and blocking cases follow the same discipline.
- **AC3 — Bounded child execution:** the helper has a finite child timeout and
  actionable process-error diagnostics. No test timeout is increased, assertion
  relaxed, automatic retry introduced or required check omitted.
- **AC4 — Verification:** the changed file passes repeated focused runs, all built
  CLI tests pass and full `npm run verify` passes on the final runtime revision.

## Verification plan

Inspect the before/after diff case by case to account for existing assertions.
Run the changed file twice to check the original timeout risk and record timings,
then the complete CLI suite. Exercise the process helper against a controlled
hung child with a short diagnostic bound and check its error/termination behavior.
Remove temporary probes before final verification. Run typecheck, lint and
formatting before the full gate. Follow the existing verification workflow;
review the final diff in a separate agent session and reuse unchanged-revision
evidence. Platform evidence is Windows/Node 24.21.0; other platforms are unverified.

To try the repair: build, then run
`npx vitest run tests/e2e/cli.test.ts --no-file-parallelism --reporter=verbose`.

## Implementation and review outcome

Implemented on 2026-11-11 on the existing 0038 branch, as authorized by the user.
Only `tests/e2e/cli.test.ts` changes executable behavior; production code,
dependencies and runner configuration are unchanged. The reviewed test blob is
`7c3656259e3b9045451b74859f14fc92b2e4ad39`, based on repository commit
`770f941011cb1bd3cb3de469645e34ac97e24662`. Later outcome edits are prose only.

Delivered independent argument cases, populated application fixtures, cohesive
blocking/state/edit/list/help journeys and the retained all-process create/get
round trip. Each rejection still invokes the built CLI and compares the Workspace
snapshot. The helper uses a 5,000 ms child timeout with `SIGKILL` and reports the
command, execution error/cause, signal and stderr. Existing test timeout ceilings
were retained or lowered through splitting; no retries or coverage gates changed.

The first intermediate focused run had 71 passing cases and two timeouts: the
initially reduced blocking journey took 6.728 seconds at the default 5-second
limit, and the unchanged owner/conflict/log-warning test took 5.225 seconds.
The repair therefore also separates that same-file owner/warning case and further
splits blocking projections from completion rejection. Supporting process setup
was removed from the nearby listing/store test (4.444 seconds in that run), and
guide prerequisites now use application setup with context help checked separately
(the guide journey had taken 26.747 seconds at its unchanged 30-second ceiling).
All guide examples still execute through the built CLI. These bounded same-file
adjustments address observed timing risk without changing product behavior.

### Verification and review

Platform: Windows x64, Node.js `24.21.0`, npm `11.4.1`.

- The final changed file passed twice: **79/79** tests in 76.91 and 77.63 seconds.
  The create/get round trip took 1.799 and 1.564 seconds; populated listing took
  0.822 and 0.876 seconds; combined edits took 0.834 seconds in both runs.
  These are observed diagnostic times, not new performance thresholds or a
  controlled whole-suite speedup claim.
- An ephemeral probe exercised the actual helper against a child that remained
  alive and handled `SIGTERM`. It asserted the configured 5,000 ms timeout and
  `SIGKILL`, shortened only the probe's execution bound to 1,000 ms, checked
  `ETIMEDOUT`/cause, command/signal/stderr diagnostics and confirmed the child PID
  had exited. The probe ran from standard input and created no test source files.
- Typecheck, lint, formatting and `git diff --check` passed on the prepared change.
  Build passed earlier in this task; production build inputs remain unchanged.
- The complete `npm run test:cli` passed: **94/94** tests in six files,
  142.58 seconds, exit 0.
- Full `npm run verify` passed on the final reviewed test blob: **423.845 seconds,
  exit 0**. All stages passed: types, lint, formatting, code-map (1,006/1,500 words),
  architecture, build, **226 unit/component tests**, **310 integration tests**,
  **44 acceptance scenarios / 243 steps**, **94 CLI tests** and **35 Chromium
  journeys**. Within this gate, CLI took 128.229 seconds including runner overhead
  (Vitest reported 127.31 seconds) and browser took 219.327 seconds. This was the
  first full-gate attempt for 0039; the earlier failed full gates belong to 0038.
- Separate agent review inspected the actual before/after diff and fixture states.
  Two P2 findings were corrected: restore the create-help snapshot guard and use
  uncatchable child termination. Re-review of the final test blob found no
  remaining findings. This review covers 0039, not the preceding 0038 UI changes.

AC1–AC4 are satisfied; implementation, separate review and verification are
complete with no unresolved findings for 0039. No Linux or physical-device
execution is claimed. Sandbox process creation was blocked by `spawn EPERM`, so
process-based checks ran outside it. The user authorized commit and push; the
0038 UI review remains separate and that increment stays `in_progress`.
