# 0032 native-session retrospective — 2026-11-05

## Selection and source boundaries

This follow-up replaces aggregate command-text counts as the AC9 evidence.
It manually examines four **completed increments**, not four arbitrary sessions:
[0028](../../0028-web-action-create-delete.md),
[0029](../../0029-workspace-agent-guidance.md),
[0030](../../0030-quiet-web-feedback.md) and [0031](../../0031-code-map.md).
0028 and 0030 both change asynchronous web behavior across board modes and retain
CLI/browser boundaries. 0029 provides a bounded initialization/generated-guidance
comparison with installed-CLI checks. 0031 is a documentation-only contrast,
excluded from runtime-speed comparisons. These are consecutive recent deliveries
with implementation and review records; they are not equal-sized tasks.

The source is explicitly selected local `rollout-*.jsonl` records from the native
Windows Codex home. Aliases below replace filenames, UUIDs and personal paths.
All times are UTC; `L` denotes the one-based JSONL record line, and `T` the
ordinal `task_started` turn within that file. Dates, turn starts and source lines
allow local tracing without committing transcripts. Original files were read
only. No `history.jsonl`, replayed implementation or new telemetry was used.

| Alias | Local session date / first task start (UTC) | Metadata base | Codex CLI | Model / effort                                         |
| ----- | ------------------------------------------- | ------------- | --------- | ------------------------------------------------------ |
| 28I   | 2026-10-29 19:07:18.061                     | `70190a0`     | 0.165.0   | gpt-6.1-sol / high                                     |
| 28R   | 2026-10-29 20:25:18.851                     | `c582e4e`     | 0.166.0   | gpt-6.1-sol / high                                     |
| 29A   | 2026-10-30 15:27:41.553                     | `ed4c597`     | 0.166.0   | gpt-6.1-sol / high                                     |
| 29I   | 2026-10-30 15:28:13.440                     | `ee000f5`     | 0.166.0   | gpt-6.1-sol / high                                     |
| 29R   | 2026-10-30 16:03:19.183                     | `787950b`     | 0.166.0   | gpt-6.1-sol / high                                     |
| 30I   | 2026-10-31 12:31:18.985                     | `9ac702b`     | 0.166.0   | gpt-6.1-sol / high                                     |
| 30R   | 2026-10-31 17:42:33.475                     | `15cfe09`     | 0.166.0   | gpt-6.1-sol / high in T1; gpt-6-luna / medium in T2–T5 |
| 31M   | 2026-11-02 20:25:52.450                     | `d3bc55d`     | 0.166.0   | gpt-6.1-sol / high                                     |
| 31R   | 2026-11-02 21:09:48.556                     | `5b9cfd4`     | 0.166.0   | gpt-6.1-sol / medium                                   |

The base is the session-start Git metadata, **not** a fingerprint of every later
working tree. Later source identities below come from recorded command results.
The records identify native Windows/PowerShell through turn context and command
output. Historical CPU load, machine identity, cold/warm caches and complete
Node/npm/Chromium version sets are unknown for these selected ranges; the later
0032 baseline's hardware/cache description must not be applied retroactively.
The installed `codex --version` returned `codex-cli 0.166.0` during this analysis;
historical versions above come from each record's `session_meta.cli_version`.

Representative format inspection found timestamped `session_meta`, `turn_context`,
`event_msg`, `response_item` and `token_usage_record` records. Calls use both
`custom_tool_call`/output and `function_call`/output. JavaScript `exec` can contain
multiple sequential/parallel shell calls, patches or commands only quoted in
documentation. Outputs include yielded cells, process-session IDs, later polls
and sometimes truncated text. Native task completion also has `duration_ms`,
but it is not an editing or verification timer. Recent selected inputs are plain
JSONL; the local inventory also contains `.jsonl.zst` archives, readable with the
installed Node's `zstdDecompressSync`. No stable public rollout-parser API is
assumed, and no analysis script is added as a product or verification gate.

## Implementation, review and waiting

These are timestamp envelopes, rounded to seconds, not active-work phase totals.
They may include approvals, service latency or other waiting inside a turn.
Manual classification follows the user request and subsequent actual actions.

| Increment | Implementation / authorized follow-up                                                                                                                                                                   | Independent review and excluded work                                                                                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0028      | 28I T1–T2, L2–873: 19:07:18–20:22:31 (75m13s), including daemon recovery. 28R T2, L218–704: 20:42:25–21:09:41 corrective implementation (27m16s).                                                       | 28R T1, L2–216: 20:25:18–20:40:25 (15m07s). The following approximately 2-minute inter-turn gap is excluded from correction time.                                                                                                                                |
| 0029      | 29I T1, L2–550: 15:28:13–16:01:51 (33m38s). 29R T2, L181–428: 16:08:25–16:24:31 corrective implementation and publication (16m06s).                                                                     | 29R T1, L2–179: 16:03:19–16:08:17 (4m59s); 8-second inter-turn gap excluded. 29A L2–18 is an aborted 4-second start on main, not a second implementation.                                                                                                        |
| 0030      | 30I T1, L2–1478: 12:31:18–17:00:46 (4h29m27s). T3, L1510–1742: 17:14:00–17:42:03 authorized CLI-test split (28m03s). 30R T2–T5, L202–325 are separately classified post-review repair requests/actions. | 30R T1, L2–197: 17:42:33–18:35:05 (52m32s), including temporary failure probes. 30I T2 is a question/diagnosis (1m18s), not implementation. Its preceding 6m26s gap and the 5m29s before T3 are excluded. The 37m05s between 30R review and T2 is also excluded. |
| 0031      | 31M **T5 only**, L290–470: 20:50:37–21:01:10 (10m34s), starting from the approved design on main `b1a5761` and producing `5b9cfd4`.                                                                     | 31R **T1 only**, L2–66: 21:09:48–21:10:33 (45s). Earlier 31M audit/proposals cover several increments; later turns concern discussion/0032. 31R T2 publication and T3 rebases of other branches are excluded; the 10m24s before publication is not review time.  |

28I L666–672 explicitly records an aborted turn, daemon restart and continuation
within the same file. Its history is counted once, not as two implementations.
No agent-spawn calls occur in the selected ranges, so no unobserved delegated
token totals or parallel child-task durations are added. In 30R the model change
belongs to later user turns in the same session, not delegated review. T2 is
aborted; T3–T4 contain discussion rather than a completed fix; edits/checks occur
in T5 (L267–325). This distinction prevents assigning that whole evening to
high-effort implementation or treating every repair request as a repair cycle.

## Navigation before and during edits

| Increment | First status edit attempt      | First substantive code/map edit | Interpretation                                                                                                                                           |
| --------- | ------------------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0028      | 28I L35, +23.1s                | L72, +81.6s                     | Reads span application, HTTP, contracts and both boards, as required by cross-layer creation/deletion.                                                   |
| 0029      | 29I L38, +28.2s                | L92, +101.7s                    | After the status change, ports, initialization, Markdown, bootstrap and installed-CLI tests are inspected.                                               |
| 0030      | 30I L49, +37.2s                | L63, +86.3s                     | The notification implementation begins after existing UI/error paths are inspected.                                                                      |
| 0031      | 31M L318, +33.5s from T5 start | L345, +172.8s                   | The first structural patch at L339 (+150.0s) fails; the corrected patch succeeds at L345. Approval/status text is not counted as the delivered map edit. |

These measured timestamp differences include planning and edit preparation;
they are not measured orientation CPU time. They do not demonstrate that initial
navigation dominates the much longer 0030 implementation. Later navigation is
mixed with implementation and repair, so no total navigation fraction is claimed.

There are specific navigation costs, rather than just read-count suspicions:
28I L35 requests nonexistent `application/actions/create-action.ts` and
`application/views/move-action.ts`; L41 corrects to the public `index.ts` files.
It rereads `ActionEditor.tsx` in L49/L59/L67 before its substantive edit.
The L53/L63 outputs explicitly report truncation, so narrowed rereads recover
missing context rather than prove careless redundant reading. Similarly, 29I
L62/L70 reread bootstrap CLI/runtime while adding installed-CLI examples and test
context. 31M T5 uses symbol searches at L332 after broader inventory at L311.
The code map's public entry points and focused routes address the demonstrated
wrong-path/truncation costs. These examples do not establish a repository-wide
trend or justify deleting required boundary reading.

## Verification and concrete repair cycles

Counts below are manually checked full-gate launch sites, not text occurrences,
completed-green-run counts or a sum of polling calls. A failed patch before a
command is excluded. Selected output lines give actual outcomes and suite
durations; reading an existing log does not execute the suite again.

- **0028:** 28I has seven full-gate launch sites (L215, L261, L283, L298,
  L506, L645, L684). Repairs include missing `VIEW_CONFLICT` typing and duplicated
  `remove` wiring (L97/L113), test element types (L294), and browser selectors
  still expecting the former creation controls (L484–506). The late gate at
  L645 stops at unformatted outcome documentation (L662); recovery observes the
  same failure at L680, formats it and launches L684. That is not a duplicate
  completed implementation or a second observation of a browser failure.
  Its final readbacks show CLI 103.21s (L764) and 27 browser tests / 2.8m (L848).
  28R T1 uses focused browser/integration checks and finds focus-restoration and
  hidden-board notification defects; T2 fixes them. Six further full gates
  actually launch in T2 (L299, L308, L325, L425, L522, L617); L286's failed patch
  prevents its following command from running and is excluded. In particular,
  L325 fails two unchanged CLI cases on five-second timeouts (L377/L386), focused
  probes at L390 follow, and L425 reruns the full gate without an intervening
  code/test edit. This is a documented unchanged-revision rerun prompted by a
  concrete failure, not evidence that every repeated verification is waste.
- **0029:** 29I launches three full gates (L315, L395, L425). The first completes
  with 203 unit/component tests, 287 integration tests, CLI 95.77s (L353) and
  29 browser tests / 2.8m (L391). A later initialization-render-failure regression
  changes the revision; the next gate stops at that new test's unsafe-assignment
  lint error (L413). The repaired isolated test passes in 799ms and the final
  full gate is launched after commit `623f460` (L425–429): CLI 95.44s (L476),
  browser 2.7m (L511). Earlier selected CLI runs fail three cases (L269, including
  timeouts and a snapshot-fixture problem), then pass 32 tests in 100.84s after
  fixture/environment corrections (L309); neither is an unchanged full-gate
  rerun. Independent review uses focused checks and reuses the implementation
  evidence. Its corrective T2 adds an escaping-link regression that fails three
  cases in 1.08s (L195–199); the boundary fix passes 47 focused tests in 2.71s
  (L203–208). One full gate at L226 verifies `7615b78`, including CLI 100.61s
  (L306) and browser 2.7m (L357). The extra gates follow changes or failures;
  there is no demonstrated redundant green full run on an unchanged revision.
- **0030:** 30I T1 contains eleven full-gate launches (L511, L539, L554, L586,
  L680, L707, L729, L914, L945, L1178, L1255), plus L1571 in the authorized
  test-split follow-up. Some stop before tests: lint fails on awaited non-Promises
  (L550), formatting fails on timer tests (L582), then a later test type error
  (L703) and its formatting correction (L725) stop subsequent attempts. Other
  runs expose stale success-notice expectations and UI focus/notification
  behavior: targeted browser failures at L393/L446, then 2 tests pass in 10.4s
  (L488); six full-browser failures are recorded at L917. This is a substantial
  verification/repair workload, not twelve successful full runs. At source
  `8e72375`, CLI ends with 31 passed / 1 timeout in 109.00s (L1331), while a
  separately executed browser suite passes 31 tests in 3.0m (L1427). The timed-out
  deletion case bundles 15 CLI processes and 26 snapshots under a five-second
  case timeout (L1489–1505). The user explicitly authorizes splitting it in T3;
  six file tests pass in 10.12s and 9.55s (L1538/L1569), preserving the checks.
  The later complete gate has 36 CLI tests / 108.95s (L1658), then 31 browser
  tests / 2.9m (L1708), following split source `460991b`. This repair changes
  timeout granularity, **not** demonstrated whole-suite speed. Review T1 later
  creates controlled notification/refresh probes; their failures are review
  diagnostics, not additional implementation-suite failures. The luna follow-up
  at L301/L308 hits sandbox `EPERM` and a lint correction; it is not a passing
  complete post-review verification. Later completed-increment evidence is
  separate from this deliberately bounded session sample.
- **0031:** 31M T5 and 31R T1 contain no full-gate launches. Formatting, relative
  links, source symbols/routes and diff checks match the documentation-only
  scope. The invalid multi-operation patch (L339–341) is corrected at L345;
  a later link/source inspection hits sandbox `spawnSync git EPERM` and is
  repeated outside it. No runtime suite is necessary to prove prose changes.
  Review reuses that evidence and performs focused formatting/link inspection
  at 31R L36/L50. Later publication formatting/cwd repairs are not silently
  added to implementation or independent-review duration.

The 95–109-second CLI and approximately 2.7–3.0-minute browser observations show
material costs for individual sampled runs. Repeated failure → edit → recheck
cycles are directly demonstrated, especially in 0030. They do not establish
how much time could safely be saved. No stage totals are synthesized from
timestamp gaps, wrapper `wall_time_seconds` or repeated suite-output readbacks.
Commands can overlap (for example 28R L390 launches selected CLI/browser checks
together); their durations are **not added** into a serial elapsed estimate.
There is no reliable whole-session verification/repair percentage here.

## Context signals without double counting

The following are exact `token_count.info.total_token_usage` endpoint differences
for the selected ranges, in **input / cached input / output** tokens. Cached
input is a subset of input. For a first turn the baseline is zero; for a later
range it is the last preceding total in that same file. Repeated cumulative
reports and `token_usage_record` entries are not added again. Counters do not
decrease in these ranges. No totals from separate sessions are combined into
a unique-code-read or model-efficiency score.

| Range                           |      Input | Cached input | Output |
| ------------------------------- | ---------: | -----------: | -----: |
| 28I T1–T2, L2–873               | 16,678,365 |   16,260,736 | 40,952 |
| 28R review T1, L2–216           |  2,279,991 |    2,144,384 | 12,376 |
| 28R corrections T2, L218–704    | 12,215,345 |   12,160,128 | 26,917 |
| 29I T1, L2–550                  |  8,610,368 |    8,479,616 | 58,808 |
| 29R review T1, L2–179           |  1,553,072 |    1,455,488 |  9,079 |
| 29R corrections T2, L181–428    |  4,842,669 |    4,816,000 | 10,897 |
| 30I implementation T1, L2–1478  | 39,548,243 |   39,333,376 | 98,913 |
| 30I split T3, L1510–1742        | 11,240,383 |   11,223,296 | 16,745 |
| 30R review T1, L2–197           |  2,367,175 |    2,248,832 | 11,706 |
| 30R post-review T2–T5, L202–325 |  2,058,009 |    1,776,128 |  2,485 |
| 31M implementation T5, L290–470 |  3,379,438 |    3,338,112 | 29,113 |
| 31R review T1, L2–66            |    316,357 |      279,040 |  1,765 |

For example, 30I T3 subtracts the cumulative totals after T2 (40,474,018 input,
40,253,312 cached, 101,303 output), so neither implementation nor the diagnostic
question is counted twice. Last-request input grows from 18,134 to 197,378 in
28I, 18,212 to 184,263 in 29I, and 17,979 to 303,712 in 30I T1. These are available
context-growth signals, with much reused cached input, not counts of distinct
source tokens read. The selected ranges have no explicit compaction events;
that does not prove no internal summarization occurred. 31M inherits the earlier
audit/design discussion, and 30R changes model/effort after review. Their token
deltas must not be compared as equivalent fresh-context implementations.

## Diagnostic conclusion and bounded action

**Observed:** wrong guessed entry paths and truncated broad reads occur; initial
pre-edit envelopes are approximately 1–3 minutes; expensive CLI/browser checks
and repeated concrete repair/recheck cycles are present. 0030 has more recorded
repair and verification activity than the selected smaller deliveries. Neither
inter-turn waiting, review probes nor changed-model follow-ups are implementation
time. **Unknown:** active editing/navigation/verification shares, uncontrolled
machine/cache effects, counterfactual safe time savings and a causal trend across
all increments. The sample cannot establish that repository growth caused delay.

This evidence warrants a **bounded CLI/browser risk audit**, rather than deferring
all inspection because historical phases lack labels. The retained
[journey-risk audit](findings.md#expensive-journey-risk-audit-and-decisions) covers
the implicated built-process/HTTP/browser boundaries and fixed-port constraints.
It supports preserving those checks and serial settings; it does not identify
a justified execution/setup speed optimization for 0032. The earlier 0030 split
is a distinct, user-authorized timeout repair, not a new 0032 optimization or a
comparable before/after speed benchmark.

The bounded actions are the delivered stage timing, focused recipes before
full handoff, reuse of unchanged-revision evidence, and public-entry code-map
navigation. Address cheap type/lint/format or affected-UI failures with focused
checks before paying for another full handoff. Retain every required gate and
browser/CLI risk; no retries, higher timeouts or worker-count changes follow.
Defer execution/setup optimization and production restructuring until a specific
change can preserve the audited boundary with comparable evidence. For 00xx,
the demonstrated refresh/notification repairs justify detailing coordination
risks, **not** promising a speedup from splitting production files.
