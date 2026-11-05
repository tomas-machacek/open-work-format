# 0034 — Repair Dependabot dependency findings

> Status: draft
> Description: Repair the reported dependency vulnerabilities while preserving OWF behavior and the local development and release workflows.
> Depends on: [0015 — Development dependency audit repair](0015-dependency-audit.md).

## Goal and scope

Resolve the open GitHub Dependabot alerts affecting the repository's committed
dependency graph, including development dependencies. Apply the smallest coherent
set of dependency updates and necessary compatibility changes.

The dependency manifest and lockfile are in `tools/owf/`. Follow the
[architecture](../architecture.md) and
[development guidelines](../development-guidelines.md). This increment adds no
OWF features, store migration, CI, release, tag or publishing operation. Routine
version refreshes unrelated to the findings are outside scope.

## Findings baseline — pending confirmation

The exact open-alert inventory has not yet been verified. This draft does not
claim an alert count, affected package, severity or fixed version. Confirm and
record the baseline below before approving implementation, using the
[repository's Dependabot alerts](https://github.com/tomas-machacek/open-work-format/security/dependabot).

For each alert, record its number/link, GHSA or CVE, severity, package, affected
manifest, resolved vulnerable version, fixed-version range and direct/transitive
dependency path. Identify runtime versus development usage. Multiple alerts for
one package remain individually traceable even if one update fixes them all.
Record the inspection date and base revision. Reconcile this inventory with a
fresh full `npm audit --json`; an empty audit or absence of bot PRs does not
establish that GitHub has no open alerts.

Existing baseline inspected on 2026-11-05: main revision `5faed415b966d337a2fc69600299ee46537307f7`.
The manifest retains `release-it@21.0.3` with scoped overrides for
`undici@7.29.1` and `get-uri@8.0.1 > basic-ftp@6.2.1`, introduced in 0015.
These are historical repairs, not evidence of the current alerts.

## Proposed solution

1. Trace each confirmed finding through the committed lockfile and determine
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

AC1: The confirmed baseline contains every open Dependabot alert at inspection
time, with an explicit mapping from each alert to its dependency path and repair.

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

AC5: If the release-it/proxy/get-uri/basic-ftp/undici chain changes, verify the
affected behavior with focused compatibility probes and the release-it dry run
described in 0015. If that chain is unchanged, reuse the historical compatibility
evidence with a checked dependency diff rather than rerunning unrelated probes.
No actual release or remote release action occurs.

AC6: After merge and GitHub dependency-graph processing, recheck the baseline
alerts for closure as fixed. Before merge, retain their status as pending this
check and record local evidence; do not dismiss alerts to close them.

## Verification plan

Capture the initial alert inventory and full audit, inspect dependency paths with
`npm ls` / `npm explain`, then review the manifest and lockfile diff. Use a clean
`npm ci`, both audits and risk-based compatibility checks. Follow the
[verification workflow](../verification.md) for focused checks during development,
then run the full existing `npm run verify` before code handoff. Prefer existing
behavioral tests; do not add tests that merely assert package version strings.

Human trial from `tools/owf/`: `npm ci`, `npm audit`,
`npm audit --omit=dev`, `npm run verify`. Record actual results and the verified
revision. Review formatting, relative links, table continuity and the final diff
for this documentation-only proposal; runtime suites are required for the later
dependency implementation.

## Open questions

- Confirm the exact Dependabot alert inventory and concrete repair targets.
  This blocks implementation approval.

## Implementation and review outcome

Not implemented. Dependency files are unchanged. Runtime verification and
independent implementation review have not run.
