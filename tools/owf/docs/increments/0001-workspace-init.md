# 0001 — Workspace initialization and CLI foundation

> Status: in_progress
> Description: Establish the CLI project and development checks, and initialize
> a named local OWF Workspace from the current directory.
> Depends on: No earlier implementation increment.

The scope, solution and acceptance criteria are approved. Implementation is underway; independent review is required before completion.

## Goal and scope

A user can install/build the local tool, enter an existing directory and run
`owf init`. The result is a named Workspace with Markdown metadata and a local
SQLite store. The same CLI recognizes that Workspace from a descendant directory.

This increment also establishes the actual project layout, build, tests, lint,
architectural checks and release configuration. These are deliverables, not
prerequisites assumed to exist.

References:

- [Architecture](../architecture.md)
- [Development guidelines](../development-guidelines.md)
- [MVP scope](../../../../docs/design/mvp-scope.md)
- [Workspace representation](../../../../docs/design/representation-profile-notes.md#61-workspace-readme)
- [Storage rules](../../../../docs/design/operational-store-notes.md#12-storage-configuration-and-discovery)

Included:

- Initialize the current directory; an explicit or directory-derived title.
- Discover the Workspace from the current directory or ancestors.
- Safe repeat initialization, collision detection and clear failure reporting.
- Human-readable and JSON results, CLI help and version.
- The development foundation and meaningful tests described below.

Deferred:

- Actions, Inbox Items and their database tables/operations.
- Project/Outcome creation, owner selection, Workspace renaming and repair.
- Workspace registration, an active-Workspace setting or a --workspace option.
- Web/HTTP server, URI handler, Obsidian integration and screenshots.
- Cloud stores, migration of existing external stores, nested Workspace creation.
- Dedicated backup commands, installers, publication and an actual release.
- Git repository initialization or changes to user Git configuration.
- Advanced concurrent initialization or crash-recovery automation.

## Agreed solution

### CLI and title

```text
owf init
owf init --title "My work"
owf init --title "My work" --json
owf --help
owf --version
```

Initialize the existing current working directory itself, not a child directory.
No interactive prompts are needed.

If --title is absent, derive the title from the current directory's basename.
Trim surrounding whitespace; reject an explicitly empty/whitespace-only title.
Preserve internal text, Unicode and punctuation. Reject embedded line breaks
for a predictable single-line title. If no usable basename exists (for example
at a filesystem root), require --title.

The CLI option maps to the existing README frontmatter title and initial H1.
It introduces neither a second name property nor a Workspace state.
Use YAML serialization and Markdown escaping so titles remain literal content.

### Discovery and existing Workspaces

Starting at the current directory, inspect README.md and then walk to the
filesystem root. The nearest frontmatter mapping declaring
type: OWF Workspace is the candidate; validate its required metadata before use.
Ordinary README files and Project/Outcome READMEs do not identify a Workspace.

Do not fall back to an ancestor Workspace after finding an invalid Workspace
candidate. Unreadable README files or malformed YAML frontmatter also stop
discovery with a diagnostic; do not silently skip an ambiguous boundary.
A plain README without frontmatter is not a candidate.

Resolve the starting directory to its physical path for traversal so symbolic
links do not produce an unbounded or misleading walk. Return an absolute root
path; do not infer ownership context beyond Workspace discovery in this increment.

On init:

- No Workspace found: initialize the current directory after preflight checks.
- A valid Workspace with a recognized accessible local store found at the
  current directory or an ancestor: return already_initialized and its root,
  without changing any file or creating a nested Workspace.
- A Workspace found with missing, invalid, inaccessible or unsupported storage:
  report an error without creating a replacement.

For already_initialized, a supplied different --title does not rename anything:
the result reports the existing title. Title syntax validation still applies.

The general discovery service is reusable by later CLI operations. No extra
public discovery command is needed now: repeated init from a descendant exposes
the resolved root without mutating it. URI-handler Workspace selection remains
the separate registry-based design.

### Initial artifacts and store

| Path relative to new Workspace | Content                                                              |
| ------------------------------ | -------------------------------------------------------------------- |
| README.md                      | Workspace type, title, profile version, storage configuration and H1 |
| index.md                       | Minimal navigation following the existing index profile              |
| log.md                         | One dated, human-readable Workspace initialization entry             |
| _store/owf.sqlite              | Recognized SQLite store with version metadata only                   |

_store is this tool's chosen default directory, not a new OWF-reserved name.
Use `owf.storage.operational.url: ./_store/`; this SQLite adapter expects
owf.sqlite in that directory. A relative store location is resolved against the
discovered Workspace root, never the caller's current subdirectory.

README metadata:

```yaml
---
type: OWF Workspace
title: My work
owf:
  version: '0.1'
  storage:
    operational:
      url: ./_store/
---
```

Profile version 0.1 follows the current design baseline. It is independent of
the tool package version and database schema version. Do not claim that this
limited increment implements every profile capability.

Use a small metadata table recording a tool store-format identifier and schema
version 1, so any readable SQLite file is not mistaken for an OWF store.
This version has no Action, Inbox or Operational Event Log tables.
Initialization is a Workspace event in log.md; it does not create operational
work objects or need a fabricated operational event.

Keep optional empty Workspace directories absent. Preserve unrelated files.
Do not rewrite existing navigation, logs or metadata on repeated initialization.

For detection of an existing Workspace, validate the current profile, required
title/storage fields, local directory location and recognized store metadata.
Unsupported profile/store versions and remote storage receive explicit errors.
An existing external local directory location may be read if it uses the same
adapter contract; initialization always chooses the default local location.
Open existing stores without SQLite's implicit create-if-missing behavior.

### Collisions and failure behavior

Preflight all four target paths before creating artifacts. Without an existing
Workspace, any existing README.md, index.md, log.md or _store entry is a collision,
including an empty directory or a symbolic link at a target path. Other unrelated
files do not prevent initialization. No overwrite, merge, --force or reset option.

Use exclusive creation and track artifacts created by this invocation.
Prepare the store and supporting documents before publishing the Workspace
README last. On a caught creation failure, close resources and remove only
artifacts owned by this invocation; preserve all pre-existing data.
If cleanup fails, report the remaining paths and required manual inspection.

This is not a filesystem/SQLite transaction. A process kill or power failure can
leave partial artifacts; a later init must report them rather than silently
overwriting them or reporting success. Fully concurrent initialization is outside
scope; exclusive creation must still prevent overwriting another creator's files.

### Output and errors

Success exits 0. Human output shows whether initialization was performed,
the root path, title and store path. In --json mode stdout contains exactly one
JSON result object and no progress banners.

Result shape:

```json
{
  "ok": true,
  "result": {
    "status": "initialized",
    "root": "C:\\work\\personal",
    "title": "My work",
    "store": "C:\\work\\personal\\_store\\owf.sqlite"
  }
}
```

The alternate successful status is already_initialized.
For failure, use `{"ok":false,"error":{"code":"...","message":"..."}}`
on stdout in JSON mode. Optional diagnostics go to stderr; no stack traces are
needed in normal user output. For a successfully parsed --json invocation,
argument validation errors must also follow the JSON contract.

| Exit | Error categories                                                                                                                                               |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2    | INVALID_ARGUMENT, INVALID_TITLE                                                                                                                                |
| 1    | PATH_CONFLICT, INVALID_WORKSPACE, UNSUPPORTED_PROFILE, STORE_UNAVAILABLE, INVALID_STORE, UNSUPPORTED_STORAGE, UNSUPPORTED_STORE_VERSION, INITIALIZATION_FAILED |

Error codes are machine-readable; message text may evolve. Include an affected
path where useful. Help and version are informational CLI behavior; --json is
the operational init output mode, not a promise of JSON help formatting.

### Layer responsibilities

- domain/workspaces/: small title/metadata rules, independent of filesystem/YAML.
- application/workspaces/: initialize/discover orchestration and typed results.
- application/ports/: only the filesystem/metadata/store/clock capabilities this
  increment needs. No speculative Action repositories or generic framework.
- infrastructure/markdown/: Workspace README and supporting document handling.
- infrastructure/configuration/: filesystem-based Workspace discovery support.
- infrastructure/sqlite/: store bootstrap and read-only metadata validation.
- interfaces/cli/: Commander input/output mapping.
- contracts/: Zod boundary schemas and transport result types where useful.
- bootstrap/: CLI entry point and concrete wiring.

The application passes plain values to domain logic and receives external
capabilities through ports. Infrastructure owns serialization and filesystem/SQL
details. The discovery flow must not make one concrete adapter import another:
coordinate the ports in the application.

### Project and tool setup

Create the needed directories above, colocated unit tests, and
tests/acceptance/features, tests/acceptance/steps, tests/integration and tests/e2e.
Create tests/support or scripts only for real shared support. Record future
Action/Inbox/web directories in architecture; do not populate them with empty
classes or placeholder files merely to mirror the complete layout.

Deliver:

- One package.json and package-lock.json, ESM, private package, Apache-2.0,
  initial development version 0.0.0, and an owf bin entry.
- Pin a concrete compatible Node 24 LTS version with the selected SQLite API,
  and document the npm version used. Use compatible stable dependency versions
  resolved at implementation time; commit the lockfile.
- TypeScript strict configurations: backend build, and type checking covering
  production, tests and supporting code. Backend has no DOM type environment.
- tsc production build, tsx development invocation and source maps.
  Define the built CLI entry as dist/bootstrap/cli.js.
- Commander.js, Zod, yaml and built-in node:sqlite as the current runtime needs.
- Vitest for unit, integration and real CLI-process tests.
- Cucumber.js for the acceptance scenarios below, bound to application operations.
- ESLint/typescript-eslint, Prettier and dependency-cruiser configured according
  to the development guidelines, including public module boundaries.
- release-it configuration for local version commit/tag only: owf-v<version>,
  npm publication/push/GitHub Release disabled. Configure it but do not release.
- Scoped ignores for dependencies, build outputs and test artifacts, preserving
  existing repository ignore rules. Do not ignore user Workspace content globally.
- README instructions for install, build, local CLI use, verification and releases.

All command names in the development guidelines must work for this increment.
npm run test:e2e runs CLI tests only. npm run verify runs static checks, the build
and relevant suites, building before tests that launch the built CLI. No suite
may quietly pass because test discovery is misconfigured.

Add `npm run dev -- init ...` for convenience, documenting that npm executes
from the package directory. For a separate user Workspace, invoke the built CLI
using its absolute path after changing directory, or use a documented local
npm link installation. The working directory must be the intended Workspace,
not the source checkout.

Do not install Fastify, React, Vite, React Router, dnd-kit or Playwright yet.
Do not add GitHub Actions or automatic Git hooks. UI tooling arrives with a
later increment; all verification here is local.

## Acceptance criteria

### AC1 — Reproducible development foundation

From a clean checkout with the documented Node/npm versions, npm ci,
npm run build and npm run verify succeed. All configured test suites execute
real relevant tests. Tests are type-checked/linted but excluded from dist.
The built CLI supports help/version and can run outside the source checkout.

### AC2 — Effective architecture and lint checks

Demonstrate that temporary forbidden domain-to-infrastructure imports, a
production module cycle and a representative lint violation each fail their
respective checks. Remove the temporary violations afterward; do not commit
intentionally broken code. This small configuration validation is sufficient;
do not build a large test suite for the lint tools themselves.

### AC3–AC8 — Workspace behavior

Canonical executable criteria: [Workspace initialization feature](../../../tests/acceptance/features/workspace-init.feature). AC3 initializes a named Workspace; AC4 derives the title; AC5 rejects blank titles; AC6 repeats initialization at root and descendants without mutation; AC7 preserves collisions; AC8 never replaces a missing store.

### AC9 — Discovery and artifact integrity

A Project/Outcome README in a descendant does not hide the Workspace root.
A malformed or unreadable candidate does not silently fall through.
Recognized invalid/unsupported Workspace or store metadata produces the defined
error without mutation. Nonconflicting existing files remain unchanged.

### AC10 — Failure during creation

Inject a write/store-creation failure after initialization has started.
No successful result is reported; pre-existing content is preserved and newly
created artifacts are cleaned up when cleanup succeeds. A cleanup failure names
remaining artifacts and does not claim rollback succeeded. Do not simulate every
possible disk error.

### AC11 — CLI contract across processes

Launch the built CLI in a temporary directory containing spaces/Unicode.
Initialize with --json, then invoke it again in a descendant as a separate process.
Verify parseable result envelopes, root/title consistency, exit codes and
unchanged artifacts on the second invocation. A representative invalid-title
invocation produces the JSON error contract and exit 2.

### AC12 — Readiness and documentation

README explains setup/use on Windows without Bash and the limited functionality.
A release-it dry run is performed in a disposable repository copy, demonstrating
the intended version/tag configuration with no real tag, commit, push or publish.
Document manual Windows validation if automated development ran elsewhere.
Record independent review outcome and verification evidence before completion.

## Verification plan

| Risk or criterion                        | Primary evidence                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| Title rules, literal Unicode/punctuation | Small domain unit cases, including blank and line-break rejection      |
| AC3–AC8                                  | Cucumber through application API with real temporary filesystem/SQLite |
| AC9                                      | Focused adapter integration tests, including relative store resolution |
| AC10                                     | Controlled fault injection; test application cleanup behavior          |
| AC11                                     | Vitest launching actual built CLI processes                            |
| AC1–AC2                                  | Clean install/build/verify and temporary negative configuration probes |
| AC12                                     | Documentation walkthrough, safe release dry run, independent review    |

Use isolated directories; do not run tests against the user's real Workspace.
Do not duplicate the entire Gherkin matrix in unit and CLI tests.
Report actual platform and checks; no coverage percentage or test-count quota.
The creation date comes through the clock port so log assertions are deterministic.

Manual trial after build: in a disposable folder outside the repository, run
`node <absolute-tool-path>/dist/bootstrap/cli.js init --title "My work"`,
inspect the artifacts, create/enter a child directory and repeat with --json.
The second result must point to the same root without changing the Workspace.

## Open questions

Dependency versions are pinned in package.json and package-lock.json. The initial
SQLite table is `owf_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT`,
with `format=owf-tool-operational` and `schema_version=1`.

Recovery after a process crash, adopting an existing non-OWF README, Workspace
repair/rename, URI registration and broader migration support remain deferred.

## Implementation and review outcome

Implemented on `agent/increment-0001-workspace-init`. Status remains
`in_progress`: the initial independent review is complete and its findings have
been corrected; the corrective diff awaits independent review. Implementation
and corrections are tracked in PR #6. No release or merge has been performed.

Delivered the ESM/TypeScript CLI foundation, all agreed development commands,
layer/public-export checks, local release configuration, initialization and
physical-path ancestor discovery. Initialization validates titles and metadata,
uses exclusive creation, writes README last, preserves unrelated content and
reports cleanup failures. Existing stores are validated read-only without
implicit creation. AC3–AC8 now live in the linked canonical feature file.
No acceptance criteria or agreed scope were changed.

Verification on Windows, 2026-09-16, Node 24.21.0 and npm 11.4.1:

- `npm ci` and `npm run verify` passed in the working package and in an isolated
  clean source copy without node_modules or dist. This tested the uncommitted
  implementation based on Git revision `0b13bfd47c5892186d13e0a46ec72520842a7a0f`,
  not a newly committed checkout.
- Type checking, ESLint, Prettier, dependency-cruiser and production build passed.
  Production output contains no tests and includes source maps.
- Vitest: 9 unit/application tests, 21 integration tests and 5 CLI process tests
  passed. Cucumber: 7 scenarios and 43 steps passed, bound to application calls
  with real isolated filesystem/SQLite fixtures.
- Temporary forbidden domain-to-infrastructure import, production cycle and
  domain `Date.now()` probes each failed the intended check. Probes were removed.
- `npm run dev -- --help` passed. CLI tests ran outside the checkout in paths with
  spaces and Unicode and checked help/version, human/JSON output, exit codes and
  unchanged artifacts after descendant initialization.
- release-it 21.0.3 dry run passed in a disposable Git repository. It proposed
  version 0.0.1, commit `chore(owf): release 0.0.1` and tag `owf-v0.0.1`. Afterwards
  the fixture remained clean with its one setup commit and no tags; no release
  commit, push or publication occurred.
- npm audit after the release-it update, and the final clean install, reported
  zero vulnerabilities. `git diff --check` passed.

Initial setup attempts exposed and then corrected build/lint/Cucumber
configuration errors. Sandbox-blocked subprocess checks were rerun with approval
outside the sandbox; the successful results above are from those actual runs.
The user installed Node 24.21.0 after antivirus blocked the automated installer.

Not performed during the initial implementation session: independent code review,
Linux execution, optional npm-link
installation, a separate human walkthrough, real release or publication.
Windows use is documented in the [tool README](../../README.md#try-it-outside-the-checkout).
Process-kill/power-loss recovery and fully concurrent initialization remain
deferred; caught failures and cleanup diagnostics are covered by fault injection.

### Review corrections, 2026-09-20

Independent review of revision `eb280f19dc4ff4188f3673a8a96e2b2eca2c5d8b`
identified three issues, corrected in the follow-up diff:

- Relative storage URLs now resolve through URL-to-filesystem conversion, with
  regression cases for spaces, Unicode and literal percent/hash characters.
- The architecture gate confines the SQLite driver to the persistence adapter,
  preventing input adapters from bypassing the application layer.
- CLI version expectations come from package metadata rather than a fixed
  development version.

Development guidelines and AGENTS.md now cover semantic boundaries, authoritative
sources for changing expectations, negative quality-gate probes and coherent
handoff documentation. The PR description is updated to reflect implementation.

Verification of the corrective working tree on Linux, Node 24.19.0/npm 11.9.0:

- `npm run verify` passed: types, lint, formatting, architecture, build,
  9 unit/application tests, 24 integration tests, 5 CLI tests and 7 Cucumber
  scenarios (43 steps).
- A temporary direct SQLite import in CLI failed the intended architecture rule.
- The focused CLI version test passed after temporarily changing package metadata
  to 0.0.1. Both probes were restored; no version change or release was retained.
- `git diff --check` passed.

This runtime differs from the pinned Node 24.21.0. Windows was not rerun for these
corrections. The original Windows results above are historical evidence, not
verification of this corrective diff. Independent review of the corrective diff
remains pending; the increment therefore remains in_progress.

## Decision changes and follow-up

The earlier candidate "create and get Action" is deferred: initializing a
Workspace and establishing the tool foundation precede Action operations.
Normal CLI commands discover Workspace from the working directory instead of
requiring --workspace. This does not alter the registry-based URI handler design.
No release has been created.
