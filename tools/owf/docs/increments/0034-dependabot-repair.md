# 0034 — Repair Dependabot dependency findings

> Status: completed
> Description: Repair the reported dependency vulnerabilities while preserving OWF behavior and the local development and release workflows.
> Depends on: [0015 — Development dependency audit repair](0015-dependency-audit.md).

Approved for implementation by the user on 2026-11-05.

## Goal and scope

Resolve the open GitHub Dependabot alerts affecting the repository's committed
dependency graph, including development dependencies. Apply the smallest coherent
set of dependency updates and necessary compatibility changes.

The dependency manifest and lockfile are in `tools/owf/`. Follow the
[architecture](../architecture.md) and
[development guidelines](../development-guidelines.md). This increment adds no
OWF features, store migration, CI, release, tag or publishing operation. Routine
version refreshes unrelated to the findings are outside scope.

## Findings baseline

Inspected on 2026-11-05 against main revision
`5faed415b966d337a2fc69600299ee46537307f7` and the exported open
[Dependabot alerts](https://github.com/tomas-machacek/open-work-format/security/dependabot).
The baseline contains **30 open alerts covering 21 distinct advisories**:
10 high, 14 medium and 6 low; 12 runtime and 18 development alerts.
All identify `tools/owf/package-lock.json`. Missing alert numbers are not part
of this open-alert snapshot.

The patched versions below are the advisory minimums for the corresponding
version line, not a claim that the eventual combined dependency graph has
already been verified. Use compatible fixed versions at or above these minimums
and recheck current advisories during implementation.

| Alert                                                                            | Advisory                                                                 | Package        | Locked version | Severity | First patched version |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------- | -------------- | -------- | --------------------- |
| [#1](https://github.com/tomas-machacek/open-work-format/security/dependabot/1)   | [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv) | vite           | 8.3.1          | medium   | 8.3.3                 |
| [#2](https://github.com/tomas-machacek/open-work-format/security/dependabot/2)   | [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm) | vite           | 8.3.1          | high     | 8.3.3                 |
| [#3](https://github.com/tomas-machacek/open-work-format/security/dependabot/3)   | [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw) | vite           | 8.3.1          | medium   | 8.3.3                 |
| [#4](https://github.com/tomas-machacek/open-work-format/security/dependabot/4)   | [GHSA-vfpm-58rq-9qcg](https://github.com/advisories/GHSA-vfpm-58rq-9qcg) | vite           | 8.3.1          | medium   | 8.3.3                 |
| [#5](https://github.com/tomas-machacek/open-work-format/security/dependabot/5)   | [GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22) | vite           | 8.3.1          | medium   | 8.3.3                 |
| [#6](https://github.com/tomas-machacek/open-work-format/security/dependabot/6)   | [GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw) | vite           | 8.3.1          | low      | 8.3.3                 |
| [#7](https://github.com/tomas-machacek/open-work-format/security/dependabot/7)   | [GHSA-xp26-3454-mjgp](https://github.com/advisories/GHSA-xp26-3454-mjgp) | @vitest/mocker | 5.0.1          | medium   | 5.0.3                 |
| [#8](https://github.com/tomas-machacek/open-work-format/security/dependabot/8)   | [GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8) | @vitest/mocker | 5.0.1          | medium   | 5.0.3                 |
| [#10](https://github.com/tomas-machacek/open-work-format/security/dependabot/10) | [GHSA-389g-gv7q-r4x8](https://github.com/advisories/GHSA-389g-gv7q-r4x8) | fastify        | 5.12.5         | low      | 5.12.6                |
| [#11](https://github.com/tomas-machacek/open-work-format/security/dependabot/11) | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) | zod            | 4.6.5          | high     | 4.6.6                 |
| [#12](https://github.com/tomas-machacek/open-work-format/security/dependabot/12) | [GHSA-333x-w4r6-6crp](https://github.com/advisories/GHSA-333x-w4r6-6crp) | fast-uri       | 3.1.8          | low      | 3.1.9                 |
| [#13](https://github.com/tomas-machacek/open-work-format/security/dependabot/13) | [GHSA-333x-w4r6-6crp](https://github.com/advisories/GHSA-333x-w4r6-6crp) | fast-uri       | 4.2.1          | low      | 4.2.3                 |
| [#14](https://github.com/tomas-machacek/open-work-format/security/dependabot/14) | [GHSA-wjr9-j795-jxcr](https://github.com/advisories/GHSA-wjr9-j795-jxcr) | fast-uri       | 3.1.8          | medium   | 3.1.9                 |
| [#15](https://github.com/tomas-machacek/open-work-format/security/dependabot/15) | [GHSA-wjr9-j795-jxcr](https://github.com/advisories/GHSA-wjr9-j795-jxcr) | fast-uri       | 4.2.1          | medium   | 4.2.3                 |
| [#16](https://github.com/tomas-machacek/open-work-format/security/dependabot/16) | [GHSA-xhq7-xmqj-769h](https://github.com/advisories/GHSA-xhq7-xmqj-769h) | fast-uri       | 3.1.8          | low      | 3.1.9                 |
| [#17](https://github.com/tomas-machacek/open-work-format/security/dependabot/17) | [GHSA-xhq7-xmqj-769h](https://github.com/advisories/GHSA-xhq7-xmqj-769h) | fast-uri       | 4.2.1          | low      | 4.2.3                 |
| [#18](https://github.com/tomas-machacek/open-work-format/security/dependabot/18) | [GHSA-w74x-v6f9-j3xg](https://github.com/advisories/GHSA-w74x-v6f9-j3xg) | fast-uri       | 3.1.8          | medium   | 3.1.9                 |
| [#19](https://github.com/tomas-machacek/open-work-format/security/dependabot/19) | [GHSA-w74x-v6f9-j3xg](https://github.com/advisories/GHSA-w74x-v6f9-j3xg) | fast-uri       | 4.2.1          | medium   | 4.2.3                 |
| [#24](https://github.com/tomas-machacek/open-work-format/security/dependabot/24) | [GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c) | undici         | 7.29.1         | high     | 7.30.1                |
| [#25](https://github.com/tomas-machacek/open-work-format/security/dependabot/25) | [GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c) | undici         | 8.11.2         | high     | 8.12.2                |
| [#28](https://github.com/tomas-machacek/open-work-format/security/dependabot/28) | [GHSA-9fm3-97px-rjf6](https://github.com/advisories/GHSA-9fm3-97px-rjf6) | undici         | 7.29.1         | medium   | 7.30.1                |
| [#29](https://github.com/tomas-machacek/open-work-format/security/dependabot/29) | [GHSA-9fm3-97px-rjf6](https://github.com/advisories/GHSA-9fm3-97px-rjf6) | undici         | 8.11.2         | medium   | 8.12.2                |
| [#30](https://github.com/tomas-machacek/open-work-format/security/dependabot/30) | [GHSA-qrxm-fqhp-jwvm](https://github.com/advisories/GHSA-qrxm-fqhp-jwvm) | undici         | 7.29.1         | high     | 7.30.1                |
| [#31](https://github.com/tomas-machacek/open-work-format/security/dependabot/31) | [GHSA-qrxm-fqhp-jwvm](https://github.com/advisories/GHSA-qrxm-fqhp-jwvm) | undici         | 8.11.2         | high     | 8.12.2                |
| [#32](https://github.com/tomas-machacek/open-work-format/security/dependabot/32) | [GHSA-2m5v-pch6-74hx](https://github.com/advisories/GHSA-2m5v-pch6-74hx) | undici         | 7.29.1         | high     | 7.30.1                |
| [#33](https://github.com/tomas-machacek/open-work-format/security/dependabot/33) | [GHSA-2m5v-pch6-74hx](https://github.com/advisories/GHSA-2m5v-pch6-74hx) | undici         | 8.11.2         | high     | 8.12.2                |
| [#34](https://github.com/tomas-machacek/open-work-format/security/dependabot/34) | [GHSA-4w7w-5xrc-9h26](https://github.com/advisories/GHSA-4w7w-5xrc-9h26) | undici         | 7.29.1         | high     | 7.30.1                |
| [#35](https://github.com/tomas-machacek/open-work-format/security/dependabot/35) | [GHSA-4w7w-5xrc-9h26](https://github.com/advisories/GHSA-4w7w-5xrc-9h26) | undici         | 8.11.2         | high     | 8.12.2                |
| [#36](https://github.com/tomas-machacek/open-work-format/security/dependabot/36) | [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) | glob           | 13.0.6         | medium   | 14.0.2                |
| [#37](https://github.com/tomas-machacek/open-work-format/security/dependabot/37) | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) | minimatch      | 10.2.6         | medium   | 11.0.1                |

### Dependency paths and repair targets

Paths below were traced through the committed lockfile. Versions on intermediate
parents identify the baseline, not mandatory target versions. Inspect all resolved
copies and consumers when implementing, including shared development consumers.

| Alerts                  | Usage and baseline path                                                                                                                                                     | Intended repair                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| #1–#6                   | Development: direct `vite@8.3.1`.                                                                                                                                           | Update direct pin to a compatible fixed Vite, minimum 8.3.3; include its bundled editor fixes.                                         |
| #7–#8                   | Development: `vitest@5.0.1 → @vitest/mocker@5.0.1`.                                                                                                                         | Update Vitest to a fixed 5.x release resolving mocker >=5.0.3; keep the Vitest package family compatible.                              |
| #10                     | Runtime: direct `fastify@5.12.5`.                                                                                                                                           | Update direct pin to fixed Fastify 5.x, minimum 5.12.6.                                                                                |
| #11                     | Runtime: direct `zod@4.6.5`.                                                                                                                                                | Update direct pin to fixed Zod 4.x, minimum 4.6.6.                                                                                     |
| #12, #14, #16, #18      | Runtime: `fastify → @fastify/ajv-compiler@4.0.6 → ajv@8.20.0 → fast-uri@3.1.8`; additional copies via `fast-json-stringify@7.0.1 → ajv` and `ajv-formats@3.0.1 → ajv`.      | Resolve every 3.x copy to >=3.1.9.                                                                                                     |
| #13, #15, #17, #19      | Runtime: `fastify → @fastify/ajv-compiler@4.0.6 → fast-uri@4.2.1`.                                                                                                          | Resolve the 4.x line to >=4.2.3 without forcing Ajv's 3.x consumers onto 4.x.                                                          |
| #24, #28, #30, #32, #34 | Development: `release-it@21.0.3 → undici@7.29.1`, pinned by the 0015 override.                                                                                              | Revise the scoped override to fixed 7.x, minimum 7.30.1, or adopt an upstream parent that resolves a fixed version.                    |
| #25, #29, #31, #33, #35 | Development: `jsdom@30.1.1 → undici@8.11.2`.                                                                                                                                | Resolve this independent 8.x line to >=8.12.2; do not replace it with the release-it 7.x override.                                     |
| #36                     | Runtime: `@fastify/static@10.1.4 → glob@13.0.6`.                                                                                                                            | Resolve to fixed glob >=14.0.2 through a compatible parent update or a justified scoped override; verify the major-version transition. |
| #37                     | Runtime: `@fastify/static → glob → minimatch@10.2.6`. The same resolved minimatch is consumed by ESLint, `@eslint/config-array` and `@typescript-eslint/typescript-estree`. | Resolve every affected consumer to fixed minimatch >=11.0.1; verify compatibility wherever the declared 10.x range is crossed.         |

The Vite findings include Windows editor command handling and development-server
file access. The Vitest findings concern mock registration and path traversal.
Fastify/fast-uri affect validation and URI handling; Zod can exhaust memory on
oversized constrained collections. Undici findings cover redirects/cache, TLS,
WebSocket buffering and content decoding. Glob/minimatch findings concern
cancellation and pattern-processing resource consumption. Usage classification
does not replace checking each advisory's exploitation conditions.

The manifest retains `release-it@21.0.3` with scoped overrides for
`undici@7.29.1` and `get-uri@8.0.1 > basic-ftp@6.2.1`, introduced in 0015.
The old undici fix is now insufficient for this baseline. Preserve the basic-ftp
security fix unless an updated upstream graph makes that override unnecessary.

## Proposed solution

1. Use the confirmed baseline and repair targets above to determine
   the smallest compatible repair. Prefer patched versions and upstream parent
   updates that resolve the affected chain. Keep exact pins for direct
   dependencies and regenerate the lockfile with npm.
2. Review the existing overrides against the newly resolved graph. Retain them
   where still necessary; remove or revise them only when the resulting graph
   demonstrably retains their security fixes. Prefer a narrow, explained override
   when upstream dependency declarations cannot otherwise provide a compatible
   repair. Do not blindly apply `npm audit fix --force`.
3. Make only compatibility edits needed by the selected updates. A required
   major update must describe its compatibility impact and verification. If a
   finding has no usable fix or requires a broader technology/runtime decision,
   record the blocker and resolve it before declaring the increment complete.
4. Preserve existing CLI, HTTP, browser, verification and local release behavior.
   Do not suppress findings, dismiss alerts, weaken security defaults or weaken
   checks to achieve a clean report.

Documentation impact: maintain this increment and its index row. Update existing
setup or development guidance only if supported commands or prerequisites change.
No generated Workspace topic, help, example or AGENTS.md change is expected for
a dependency-only repair.

## Acceptance criteria

AC1: Every one of the 30 baseline alerts is mapped to its implemented repair and
resolved dependency path. Refresh the alert/audit snapshot at implementation start
and record changes rather than silently dropping any baseline alert.

AC2: After a clean `npm ci`, the committed graph contains no vulnerable version
for any baseline advisory. Full `npm audit` and `npm audit --omit=dev` report
zero vulnerabilities. Any newly reported finding is investigated and documented;
an unresolved finding prevents claiming a clean result.

AC3: Manifest and lockfile changes are consistent and limited to the repair and
its necessary transitive consequences. Existing 0015 security fixes remain
effective. No blanket audit suppression, dismissed alert, unrelated dependency
refresh or insecure compatibility setting substitutes for a repair.

AC4: `npm run verify` passes on the final implementation revision. The normal
local Windows validation is recorded with actual Node/npm versions; checks on
other platforms are reported accurately, without claiming unperformed checks.

AC5: Verify the updated undici 7.x and 8.x consumers with focused local HTTP/jsdom
checks and the release-it dry run from 0015, with all Git/npm/remote release
actions disabled. If get-uri/basic-ftp changes, repeat the affected local FTP
compatibility probe; otherwise retain its historical evidence with a checked
dependency diff. No actual release or remote release action occurs.

AC6: Verify any glob/minimatch major transition against its actual consumers:
static asset serving from a disposable built board, file matching for the
configured static root, lint/type-aware lint and affected test discovery. Preserve
existing static-root restrictions, matching behavior and quality gates. Add a
focused regression only where the compatibility change exposes a concrete risk.

AC7: After merge and GitHub dependency-graph processing, recheck the baseline
alerts for closure as fixed. Before merge, retain their status as pending this
check and record local evidence; do not dismiss alerts to close them. This is a post-merge
confirmation, not a requirement to make GitHub close default-branch alerts from
an unmerged implementation branch.

## Verification plan

Capture the initial alert inventory and full audit, inspect dependency paths with
`npm ls` / `npm explain`, then review the manifest and lockfile diff. Use a clean
`npm ci`, both audits and risk-based compatibility checks. Follow the
[verification workflow](../verification.md) for focused checks during development,
then run the full existing `npm run verify` before code handoff. Prefer existing
behavioral tests; do not add tests that merely assert package version strings.

Human trial from `tools/owf/`: `npm ci`, `npm audit`,
`npm audit --omit=dev`, `npm run verify`. Record actual results and the verified
revision. Review formatting, relative links, table continuity and the final diff.

## Implementation and review outcome

Implemented on `increment/0034-dependabot-repair`, based on
`ad1cbcba086440e6c6333da90555aa70847bcb44`. Independent review completed with no
findings, as confirmed by the user on 2026-11-05. Runtime evidence below identifies that base
plus the `package.json` / npm-generated `package-lock.json` repair in this branch;
no application, test, verification or release configuration changed.

### Refreshed findings and resolved paths

On 2026-11-05, `gh api
repos/tomas-machacek/open-work-format/dependabot/alerts?state=open&per_page=100`
returned the same 30 open alerts and advisory minimums as the baseline; none were
added, removed or dismissed. The first sandbox audit reported zero without useful
online evidence. Repeating it with network access returned 21 vulnerable package
entries (3 high, 17 moderate, 1 low, including propagated parent findings).
The authenticated GitHub inventory and online audit are the implementation-start
snapshot; the sandbox result is not evidence that the original graph was safe.

Every baseline alert maps to the following final graph. Paths shared with the
baseline retain their intermediate parent versions unless explicitly shown.

| Baseline alerts         | Implemented repair and resolved path                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| #1–#6                   | Direct `vite@8.3.3`, also shared by Vitest/mocker; includes the bundled editor fixes.                                                          |
| #7–#8                   | Direct `vitest@5.0.3 → @vitest/mocker@5.0.3 → @vitest/spy@5.0.3`.                                                                              |
| #10                     | Direct `fastify@5.12.6`.                                                                                                                       |
| #11                     | Direct `zod@4.6.6`.                                                                                                                            |
| #12, #14, #16, #18      | All three Ajv 8.20.0 paths under `@fastify/ajv-compiler`, `ajv-formats` and `fast-json-stringify` resolve `fast-uri@3.1.9`.                    |
| #13, #15, #17, #19      | `fastify → @fastify/ajv-compiler@4.0.6` and `fast-json-stringify@7.0.1` share `fast-uri@4.2.3`. Ajv stays on 3.x.                              |
| #24, #28, #30, #32, #34 | `release-it@21.0.3 → undici@7.30.1`, through the revised release-it-scoped override.                                                           |
| #25, #29, #31, #33, #35 | Unchanged parent `jsdom@30.1.1 → undici@8.12.4`, within its declared 8.x range.                                                                |
| #36                     | Direct `@fastify/static@10.1.9 → glob@14.0.3 → path-scurry@3.0.0`; upstream 10.1.9 is the first inspected static patch declaring glob 14.      |
| #37                     | `glob@14.0.3`, `eslint@10.10.0`, `@eslint/config-array@0.23.5` and `@typescript-eslint/typescript-estree@8.70.0` all share `minimatch@11.0.4`. |

The online audit additionally reported undici advisories
[GHSA-4qv8-2p9j-2685](https://github.com/advisories/GHSA-4qv8-2p9j-2685),
[GHSA-f72v-6w45-q472](https://github.com/advisories/GHSA-f72v-6w45-q472) and
[GHSA-55wc-3pg8-jfw6](https://github.com/advisories/GHSA-55wc-3pg8-jfw6),
resolved by the same 7.30.1 / 8.12.4 updates. It also found
[GHSA-rxp7-6hxx-x8q5](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5):
`release-it → proxy-agent@8.0.2 → socks-proxy-agent@10.1.0 → socks@2.8.10 →
ip-address` now resolves 10.7.6 instead of 10.7.2 (fixed minimum 10.7.4).
These were audit additions, not additional alerts in the refreshed GitHub list.

The only new override is `minimatch@^10.2.2: 11.0.4`, restricted to the affected
10.x declarations of the three lint consumers. Glob uses its upstream 11.x
declaration. The consumers still use the named `minimatch` function and/or
`Minimatch` class; local checks below cover those APIs. This crosses their 10.x
ranges without refreshing the lint toolchain. All selected engines support the
existing Node 24.21.0 prerequisite. Remove the override when upstream declarations
adopt fixed minimatch, with fresh audit and compatibility evidence.

Lockfile changes are confined to these repairs and required consequences:
`@fastify/send@4.2.1`, the Vite rolldown/native-binding/Oxc family,
`@vitest/spy`, Vitest's `why-is-node-running@3.2.1` (removing its obsolete
siginfo/stackback dependencies), path-scurry and minimatch's nonrecursive matcher.
The unrelated magic-string refresh was reverted before npm revalidated the lock.
The 0015 get-uri 8.0.1/basic-ftp 6.2.1 chain, override and source-map-js 1.2.2
entries are unchanged; its historical FTP/MLSD compatibility evidence is retained.
No FTP probe was repeated because those inputs did not change.

### Verification evidence

Executed on Windows (`Windows_NT 10.0.26300`), Node.js `v24.21.0`, npm `11.4.1`:

- Final clean `npm ci` passed: 571 installed packages, 572 audited.
- Online `npm audit` and `npm audit --omit=dev` both passed with zero
  vulnerabilities after that clean install.
- `npm ls` / `npm explain` inspected the affected paths.
  `npm ls --all --json` passed; a lockfile scan checked all 14 affected resolved copies against
  their advisory minimums, including both fast-uri and undici lines.
- `npm run typecheck` and `npm run lint` passed. `npm run build` passed outside
  the sandbox after its first sandbox attempt failed with process `spawn EPERM`.
- Disposable local Node probes passed HTTP status/content, redirects and exact
  gzip decoding through each consumer's actual undici; `JSDOM.fromURL` followed
  a redirect, parsed the document and loaded external CSS with the expected style.
- A disposable copy of the built board served its index, JS and CSS byte for byte
  through OWF's configured static root. An extra nested asset with spaces, `#`
  and `%` also served correctly. Missing and encoded traversal requests could
  not expose a sibling file outside that root.
- Glob 13/14 produced identical raw Windows paths and file sets for the static
  plugin's `**/**` options. Explicit `wildcard: false` route enumeration also
  served the three built files. Its extra encoded-name fixture returned 404 in
  both baseline and updated plugins; OWF's configured wildcard mode served it.
  Initial probe attempts corrected the relocated baseline import, Windows path
  normalization and that pre-existing explicit-route limitation before passing.
- 576 old/new minimatch function/class comparisons passed for source/test,
  brace/extension, dotfile, ignore and negation patterns. A negative ESLint probe
  still rejected a floating promise with the type-aware rule. Vitest
  `list --filesOnly --json` exactly matched the 39 intended source/integration/CLI
  test files from an independent filesystem inventory.
- `node node_modules/release-it/bin/release-it.js patch --dry-run --ci --no-git
--no-npm --no-github --no-gitlab` passed; no release or version change occurred.
- The single final `npm run verify` passed all stages in 277.878 seconds:
  typecheck, lint, formatting, code-map budget (924/1500 words), architecture
  (65 modules / 225 dependencies, no violations), build, 213 unit/component tests,
  295 integration tests, 40 acceptance scenarios / 222 steps, 36 CLI tests and
  all 31 Chromium browser tests. No full-gate failure or rerun occurred.
- Full-gate dependency inputs are Git blobs
  `9a5c04fcf6dbd360f81228e17032ae1ce10d0b91` (`package.json`) and
  `b63bcd6282ccdc72160c43b97969b87c07b01a12` (`package-lock.json`). Subsequent
  edits only record the result in repository prose and reuse this runtime evidence.
- Formatting and `git diff --check` passed; all 41 repository-relative links in
  the changed documents resolve within the repository. Documentation checks were
  repeated after recording the full-gate result.

npm 11.4.1 twice failed during initial lockfile generation with an internal
Arborist `edgesOut` error while resolving Vitest peers, including without the old
node_modules. Temporary npm 11.21.2 generated the lock with normal peer checks;
no force/legacy-peer flags or project prerequisite changes were used. An initial
set of three parent-specific minimatch overrides made npm 11.4.1 report a
deduplicated override conflict. The final version-range override eliminated it;
normal npm 11.4.1 revalidated the lock, clean-installed it and passed the whole
dependency-tree check. Temporary probes and baseline copies are removed at handoff.

### Review and post-merge confirmation

Independent code review: **completed with no findings**, as confirmed by the user
on 2026-11-05. The user authorized completion and merge. The reviewed branch head
was `56962f8cd064e65992e701d03f1e8b28f522cd4b`; its manifest and lockfile blob IDs
match the passing full-gate inputs recorded above. Completion changes only
repository prose and reuses that runtime evidence.

GitHub closure of all 30 baseline alerts after merge and dependency-graph
processing: **pending**. This follow-up remains separate from implementation and
review completion. No release, tag, publishing or alert dismissal is part of this
increment. Local audit evidence does not claim default-branch alerts closed.

Validation is Windows-only. Probes exercised local plain HTTP, redirects, gzip,
jsdom resource loading and static files; external proxy/PAC, TLS attack scenarios,
FTPS and remote release actions were not exercised. No application compatibility
edits or concrete regression requiring a permanent new test were identified;
existing behavioral suites remain the handoff gate.
