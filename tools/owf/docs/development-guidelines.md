# OWF Tool Development Guidelines

> Status: Agreed engineering baseline, 2026-09-15.
> Commands and configurations are established by increment 0001.

## Working model and document ownership

AI agents implement code and perform code review; the human supervises direction,
scope and observable behavior. Architecture owns structural decisions and
technology choices; this document owns development, testing and release practice.
AGENTS.md is the short entry point, not a duplicate specification.

Mandatory rules use "must"; recommendations use "should". Open decisions are
explicitly labeled. Examples do not create requirements. Record substantive
changes to agreed decisions; do not silently invent missing domain semantics.

Work only on the agreed increment. Avoid unrelated refactors, speculative
abstractions, dependencies and features. Report conflicts with the
[architecture](architecture.md), [MVP scope](../../../docs/design/mvp-scope.md)
or domain documents. The first increment's
[definition](increments/0001-workspace-init.md) records its completed outcome.

## Increment documents

Every planned implementation increment, for the MVP or later features, has a
separate document in [increments/](increments/README.md). Use the
[template](increments/template.md) and add an index row with a one-line
description. Keep scope, proposed solution and acceptance criteria concrete
enough for another agent to implement and review without reconstructing a chat.

The workflow is:

1. Human and agent discuss the next increment and record a draft.
2. Record the agreed scope, solution and acceptance criteria before development.
   Agreement already given in the conversation is sufficient; do not request
   duplicate approval merely to update the document status.
3. The implementation agent works from that document and marks it in_progress.
   Report substantive scope/behavior changes and resolve them with the human;
   routine implementation choices within the agreed design need no new approval.
4. The review agent checks the actual diff against the same document.
5. Record delivered behavior, deviations, verification evidence, review outcome
   and limitations. Mark completed and update the index after implementation,
   review and required verification; a release is a separate action.

Use stable sequential NNNN-short-title.md names. Statuses and their meanings are
listed in the index. Keep cancelled proposals with a reason; do not recycle IDs.
Document length follows complexity, not a fixed quota.

Retain completed documents as design and implementation history. Record the
actual outcome rather than leaving a misleading proposal. Substantive decision
changes must retain their rationale; Git preserves detailed revision history.
Later behavioral changes belong in a new increment linked to earlier work.
Keep shared architecture/guidelines current when a cross-cutting decision changes;
increment documents do not override those documents or the domain specification.

Gherkin can initially be drafted in the proposal. Once executable .feature files
exist, link to their scenarios as the canonical executable criteria instead of
maintaining duplicate scenario text. Keep criterion intent, traceability and
material changes visible in the increment document.

## Development technologies

| Area                   | Decision                                                         |
| ---------------------- | ---------------------------------------------------------------- |
| Runtime                | Node.js 24 LTS, with a pinned concrete version                   |
| Language/modules       | TypeScript, strict mode, ESM                                     |
| Package management     | npm, one committed package-lock.json under tools/owf/            |
| Backend build/types    | tsc                                                              |
| Development execution  | tsx; type checking remains a separate step                       |
| Frontend build         | Vite                                                             |
| Unit/integration tests | Vitest                                                           |
| Gherkin acceptance     | Cucumber.js with TypeScript step definitions                     |
| Browser E2E            | Playwright Test, initially Chromium                              |
| Lint                   | ESLint recommended plus typescript-eslint recommendedTypeChecked |
| Formatting             | Prettier, with conflicting ESLint formatting rules disabled      |
| Architecture checks    | dependency-cruiser                                               |
| Releases               | release-it                                                       |
| CI                     | Deferred; no GitHub Actions in the initial setup                 |

Use npm ci for reproducible installs. Separate backend, frontend and test
TypeScript configurations as needed so browser globals do not leak into core.
Tests must be type-checked and linted, but excluded from production output.
Scripts must work on Windows and Linux without assuming Bash; use Node scripts
when shell-independent orchestration is needed.

Primary validation is local on Windows. Cross-platform command design is
required; an automated two-OS test matrix is not currently required.
Record the actual platform used rather than claiming unperformed Windows checks.

## Tests and acceptance criteria

Tests are developed with behavior, not postponed until implementation is done.
Every test must protect a named rule, meaningful boundary or concrete regression.
Each additional case needs a distinct failure reason. There is no tests-per-class
quota, mandatory test file for every module or coverage percentage target.
Coverage is diagnostic, not the goal.

| Level            | Purpose                                                                   |
| ---------------- | ------------------------------------------------------------------------- |
| Domain unit      | Invariants, state transitions, derived rules and meaningful edges         |
| Application unit | Coordination and failure handling through simple test ports               |
| Integration      | Real SQLite mapping, filters, transactions, rollback and Markdown reading |
| Acceptance       | Observable OWF behavior through the application API                       |
| E2E              | A small set of real CLI-process and browser journeys                      |

Unit tests are colocated as *.test.ts. Other suites live under tests/ as defined
by architecture. Prefer real domain objects and small test implementations of
ports. Do not assert internal call sequences unless order is part of correctness.
Avoid trivial getter tests, implementation-mirroring tests, and repeating the
same combination at every layer.

Write Gherkin in English, matching project terminology. Scenarios describe
domain behavior, not selectors, CLI flags or SQL. Bind them to the real
application and domain with an isolated temporary Workspace and SQLite database
per scenario. Steps orchestrate calls and assertions; they must not reimplement
domain rules. Use ordinary tests for detailed technical combinations.

An acceptance scenario and a unit test may protect different risks in the same
feature, but do not mechanically duplicate every scenario in Vitest.
Test rejection/no-partial-save paths as well as successful transitions.

CLI E2E tests use Vitest to launch the built CLI and inspect output, exit code
and persisted results. Playwright covers a few key browser flows and is added
with the first web journey. Actual Windows protocol dispatch and opening
Obsidian also require a documented manual integration check.

Scope test discovery explicitly to the intended source/test directories. Gitignore
and linter exclusions do not configure the test runner. Keep disposable source
copies outside the package where possible; verify that artifacts cannot become
additional test suites when changing discovery configuration.

Review tests for both missing important cases and redundant/brittle cases.
Do not weaken checks, skip tests or rewrite acceptance expectations simply to
make an implementation pass. If a criterion is wrong, identify the conflict and
record the resolution explicitly.

## Boundary and verification discipline

Treat URLs, filesystem paths and identifiers according to their semantics.
Convert explicitly at adapter boundaries using standard conversion APIs; do not
pass an encoded URL directly to filesystem operations. Test representative
encoding cases where these boundaries are crossed.

Derive changing values, such as the tool version, from their authoritative source
in tests. Fixed expectations remain appropriate for contractual constants such as
an agreed store schema version.

When adding or changing a quality gate, demonstrate that a representative
forbidden example fails, then remove the probe. Architecture checks must also
cover direct external dependencies that could bypass internal layer boundaries,
such as a database driver imported by an input adapter.

## Lint and architecture rules

Mandatory baseline:

- TypeScript strict mode.
- No explicit any; use unknown and validate untrusted data.
- No floating promises or misused asynchronous callbacks.
- No unused imports/variables; intentionally unused parameters may start with _.
- Exhaustive switches over closed variants such as Action states.
- No @ts-ignore. Exceptional @ts-expect-error needs an explanation.
- No debugger or empty catch that silently discards a failure.
- No console output in domain/application; CLI output is allowed.
- Domain code must not obtain current time or random IDs itself.
- Enforce the architecture's layer matrix, public exports and no production
  module cycles, including relative paths and aliases.

Use dependency-cruiser as the single owner of the dependency matrix, not a
duplicate copy in ESLint. Use ESLint for runtime-usage restrictions.

Local rule suppressions must be narrow and explain the reason; report unused
suppressions. Tests share the baseline, with targeted framework exceptions only.
Formatting is automatic. Do not introduce arbitrary maximum file/function sizes,
method-count limits, blanket magic-number bans or strict naming frameworks.
Add further rules only for a concrete recurring problem.

Enabled rules are enforced rather than accumulated as ignored warnings.
No dependency or configuration may bypass a layer check to make a build pass.

## Planned command interface

| Command                    | Purpose                              |
| -------------------------- | ------------------------------------ |
| npm run typecheck          | Types including tests                |
| npm run lint               | ESLint                               |
| npm run format:check       | Formatting                           |
| npm run architecture:check | Module boundaries and cycles         |
| npm test                   | Unit tests                           |
| npm run test:integration   | Technical integration                |
| npm run test:acceptance    | Cucumber scenarios                   |
| npm run test:e2e           | Applicable CLI and browser journeys  |
| npm run build              | Production output                    |
| npm run verify             | All applicable required checks above |
| npm run release            | Local version commit and tag         |

Use focused checks during development, then verify before handoff. Suites are
introduced with the behavior they cover; do not claim nonexistent tests ran.
There are no GitHub Actions, automatic push-triggered reruns or mandatory hooks.
A future CI workflow may call the same commands if explicitly adopted.

## Independent review and handoff

Review should happen in a separate agent session, based on the agreed increment,
acceptance criteria and actual diff. The implementer's summary is a guide, not
evidence. Inspect domain correctness, layer boundaries, failure paths, persistence
behavior and test value. A green test run alone does not establish correctness.

Keep the PR description, increment status/outcome and relevant README consistent
with the actual diff. Distinguish historical verification from checks of the
current revision and state which findings remain unresolved.

For each review finding, consider a correction, a focused regression test and a
general guideline. Add only what addresses the actual risk; not every finding
needs all three. Extend existing guidance rather than accumulating one rule per
bug or duplicating it in AGENTS.md.

Each handoff records:

- What changed and which agreed behavior it implements.
- A short way for the human to try it.
- Checks actually executed, their outcome and platform.
- Known limitations, unperformed checks and unresolved findings.

Reuse relevant verification results when the reviewed code has not changed.
Run additional checks to resolve concrete uncertainty; do not repeat the entire
suite merely because a second agent is reviewing it.

## Local releases

Tool versions are independent of specification versions. Use release-it from
tools/owf/ to select a patch/minor/major or explicit version, update package.json
and package-lock.json, and create a release commit and tag.

- Commit example: chore(owf): release 0.1.0
- Tag format: owf-v0.1.0
- npm publishing: disabled
- Automatic push and GitHub Release creation: disabled; explicit later steps
- A possible first usable version is 0.1.0, not a selected increment

Require a clean working tree. Release code must already have passed verify;
do not automatically rerun the full suite inside release. Reverify after changes
to implementation, tests, dependencies or configuration. The intentional
version-only release update does not itself require repeating the same suite.
Record which revision was verified; a release does not imply checks ran on
another OS.

This process creates a versioned source revision. Installer/binary packaging
and publication remain separate decisions.

## References

- [Node releases](https://nodejs.org/en/about/previous-releases)
- [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/)
- [tsx](https://github.com/privatenumber/tsx)
- [Vitest](https://vitest.dev/guide/)
- [Cucumber.js](https://github.com/cucumber/cucumber-js)
- [Playwright](https://playwright.dev/docs/intro)
- [typescript-eslint](https://typescript-eslint.io/users/configs/)
- [Prettier integration](https://prettier.io/docs/integrating-with-linters)
- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser)
- [release-it](https://github.com/release-it/release-it)
