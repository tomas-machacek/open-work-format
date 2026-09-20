# 0002 — Project and Outcome creation, Workspace agent guidance

> Status: completed
> Description: Create Projects and Outcomes through the CLI and give Workspace agents a local guide to fundamental commands.
> Depends on: [0001 — Workspace initialization](0001-workspace-init.md).

The user reviewed and approved this design for implementation on 2026-09-20.
Implementation started on 2026-09-20 in `agent/increment-0002-project-outcome-creation`.

## Goal and scope

Establish Markdown context before adding Actions and Inbox operations. A person
or agent can create a Project or Outcome without manually writing its metadata.
Newly initialized Workspaces contain a concise AGENTS.md explaining basic tool
operations. This is user-facing Workspace guidance, distinct from the repository's
[development agent instructions](../../AGENTS.md).

References:

- [Architecture](../architecture.md) and [development guidelines](../development-guidelines.md).
- [Representation profile](../../../../docs/design/representation-profile-notes.md), especially sections 4, 6–8.
- [Core](../../../../spec/core-v0.md), ownership and Event Logs.
- [MVP scope](../../../../docs/design/mvp-scope.md).

Included: two create commands, owner resolution, safe directory naming,
profile-compliant README/index generation, human/JSON results, and Workspace
AGENTS.md generation during fresh initialization.

Deferred: Actions/Inbox, GUI, rename/move/state changes, stable optional IDs,
automatic updates to existing navigation indexes, bulk creation, interactive
prompts, automatic upgrades of existing Workspace instructions, and concurrent
writers/crash recovery. No database schema changes, new dependencies or release.

## Proposed solution

### CLI

```text
owf create project --title "Rekonštrukcia kuchyne"
owf create project --title "Rekonštrukcia kuchyne" --slug kitchen --json
owf create outcome --title "Schválený návrh kuchyne"
owf create outcome --title "Schválený návrh kuchyne" --owner /_projects/kitchen/
owf create outcome --title "Návrh" --expected-result "Návrh kuchyne je schválený." --slug approved-design
```

Both commands require --title and accept --slug and --json. Outcome additionally
accepts --owner and --expected-result. Project does not accept --owner. Commands
have --help, reuse the existing JSON envelope and run without a server.
Reuse title trimming, single-line validation and literal YAML/Markdown rendering
from increment 0001; do not create subtly different title policies.

### Workspace and owner resolution

Discover the existing Workspace from the working directory and its ancestors,
using increment 0001's validation. Never initialize a Workspace implicitly.
For this increment, the existing requirement for an accessible recognized store
still applies; creating Markdown objects does not write to that store.

Projects always become direct children of Workspace /_projects/. A command run
inside another Project or Outcome still creates a top-level Project.

For Outcomes, an explicit --owner takes precedence over the current context.
It is a Workspace-rooted directory URL beginning and ending with /, for example
/_projects/kitchen/approved-design/. It is not a native absolute filesystem path.
Decode URL path segments once; reject schemes, authorities, query/fragment,
backslashes, dot segments and encoded separators. Do not resolve outside the
Workspace, including through symbolic links/junctions. Root-based references
must remain independent of the invocation directory.

Without --owner, walk from the physical current directory toward the Workspace
root and select the nearest valid Project or Outcome. Do not skip malformed
or unreadable candidate metadata to choose a different owner. Without a suitable
owner, report an error instructing the caller to supply --owner or enter context.
The Workspace cannot own an Outcome.

Validate ownership structurally: a Project is directly under /_projects/; an
Outcome is directly under a valid Project or Outcome, recursively. Validate the
candidate's type, title, state and state-specific fields against the profile;
Outcome candidates also need a nonempty Expected Result section. A type label
alone in an unrelated directory is insufficient. Archived paths/owners are not
creation targets. No additional parent-state transitions or child-driven state
changes are introduced by creation.

### Directory naming and collisions

--slug is a literal directory component, not a URL or path. For portability the
proposed grammar is [a-z0-9]+(?:-[a-z0-9]+)*. Reject Windows device names (con,
prn, aux, nul, com1–com9, lpt1–lpt9) and reserved infrastructure names.

When absent, derive the slug: normalize title to NFKD, remove combining marks,
lowercase, replace runs outside ASCII a–z/0–9 with a single hyphen, and strip
leading/trailing hyphens. Apply the same validation. If no valid slug results,
require an explicit --slug; preserve the original Unicode title in metadata.
For example, Rekonštrukcia kuchyne becomes rekonstrukcia-kuchyne.

Targets are `/_projects/{slug}/` and `{owner}/{slug}/`. An existing target of any
kind, including an empty directory or dangling link, is a conflict. Treat an
existing sibling name that differs only by case as a conflict on both platforms.
Never overwrite, adopt, or append a numeric suffix automatically. Repeated create
is a conflict, unlike repeat init.

### Created documents

Each new object contains README.md and index.md. README frontmatter has type
OWF Project or OWF Outcome, the literal title, and owf.state: active. Do not
copy Workspace version/storage declarations or invent owner/ID attributes.
Ownership and identity follow directory placement.

Project README contains H1 title and empty recommended Status and Next Steps
sections; do not invent progress or tasks. Outcome additionally contains
Expected Result before those sections. Its initial text comes from
--expected-result, or the title if omitted. An explicitly blank value is invalid;
for this CLI increment it is a trimmed single-line literal text. This keeps
title-only creation usable without an empty mandatory section. The user may
subsequently expand the document in Markdown.

The object's index.md has an Index heading and a relative link to README.md,
without Concept frontmatter. If /_projects/ does not exist, create it with a
minimal index.md linking the first Project. Preserve any existing collection or
parent index byte-for-byte. A missing/stale existing index is not an ownership
failure; automatic maintenance remains deferred and can be surfaced by future lint.

### Persistence, failures and logging

Domain owns title/slug/state/ownership rules; application coordinates discovery,
owner validation and creation through ports; infrastructure owns filesystem,
URL conversion, YAML/Markdown and rendering. CLI only parses input and renders
results; bootstrap wires adapters. Reuse existing focused ports/helpers where
appropriate, without growing one generic filesystem framework.

Validate before writing. Use exclusive creation and track only artifacts owned
by this operation. On a caught primary creation failure remove owned files and
empty owned directories in reverse order, preserving pre-existing content.
Report any remaining paths if cleanup fails. Never recursively delete content
not created by the operation. A successful result means the object is usable.

After successful object creation, append one dated semantic event referencing
its directory to root log.md through an adapter, preserving existing text.
Do not use the log as a transaction coordinator. If this append fails, keep the
valid object and return success with a LOG_WRITE_FAILED warning; do not misreport
creation as failed and invite a duplicate retry. A missing log may be created
exclusively with a Log heading; unreadable or malformed existing content must
not be silently replaced. Date comes from the existing clock port.

Success JSON: { ok: true, result: { status: "created", type, title, root, url,
path, owner }, warnings: [] }. type is project or outcome; root/path are absolute
native paths, url/owner are Workspace-rooted directory URLs with trailing slash.
A Project's owner is /. For Outcome it is the resolved Project/Outcome URL.
Warnings contain code and message; human output shows the same diagnostic.

Errors use { ok: false, error: { code, message } }. Invalid CLI values return
exit 2 (INVALID_ARGUMENT, INVALID_TITLE, INVALID_SLUG, INVALID_EXPECTED_RESULT).
Missing Workspace/owner, invalid owner, conflicts and I/O return exit 1
(WORKSPACE_NOT_FOUND, OWNER_REQUIRED, INVALID_OWNER, PATH_CONFLICT,
CREATION_FAILED). Reuse existing discovery/storage diagnostics where applicable.
Success, including a log warning, returns exit 0. JSON output is one envelope,
including argument failures; option values that look like flags must not confuse
--json detection. Reject invalid URL syntax as INVALID_ARGUMENT before I/O.

### Workspace AGENTS.md

Fresh owf init also creates root AGENTS.md, as a plain Markdown instruction file,
not an OWF Concept and not another metadata source. Its content covers:

- This directory is the Workspace; discover context from the working directory.
- Use owf --help and command --help to inspect supported options.
- owf init --title, create project and create outcome, with working examples.
- Explicit owner precedence, Workspace-rooted owner URLs, inferred Outcome owner,
  --slug, --expected-result and --json for machine-readable results.
- Preserve existing files; do not recreate or repair a Workspace by overwriting
  files. Projects/Outcomes are Markdown; Actions/Inbox commands are not available
  yet. The CLI must be installed/on PATH or invoked through its built entry point.

Keep this guide short and task-oriented; exclude repository development steps,
package installation automation, credentials and machine-specific absolute paths.
Maintain the generated text in one implementation-owned template/renderer.
Every later increment adding/changing a fundamental CLI operation must update
that template, CLI help and relevant examples in the same change.

For fresh init, an already existing AGENTS.md is a PATH_CONFLICT discovered
before writes, just like other initialization targets. Do not overwrite or merge
user instructions. Include the new file in init's ownership/rollback handling.
Repeat init of a recognized Workspace remains a byte-preserving no-op even if
AGENTS.md is missing or edited. Older Workspaces remain valid and create commands
must not require this file. Automatic refresh/backfill and managed file regions
are deferred; the tool README explains that existing instructions can be updated
manually from the documented commands. This compatibility policy deliberately
preserves increment 0001's repeat-init guarantee.

## Acceptance criteria

AC1: Project creation from any Workspace descendant produces the profile shape
under /_projects/, with correct literal title, active state and directory URL.

AC2: Outcome uses the nearest valid owner or the explicit owner, including nested
Outcome ownership; no Workspace-owned Outcome or silent owner fallback occurs.

AC3: Title-only Outcome has a meaningful nonempty Expected Result initialized
from title; explicit --expected-result replaces that initial text.

AC4: Deterministic portable naming, explicit slug and collision handling follow
the rules above. Invalid input and external/invalid owners cause no writes.

AC5: Caught filesystem failures preserve prior content and clean only owned
artifacts; cleanup failures identify leftovers. Log failure preserves the created
object and is visible as a warning in both output modes.

AC6: Fresh init creates the guide. An existing AGENTS.md prevents fresh init
without changes; repeat init preserves edited/missing guidance, and older
Workspaces still support the create commands.

AC7: CLI help, output envelopes, exit codes and generated guidance match actual
behavior. Both commands work from an installed/built CLI outside the checkout.

Canonical executable scenarios are in
[context-creation.feature](../../tests/acceptance/features/context-creation.feature):
top-level Project creation from another Project (AC1), explicit owner precedence
and default Expected Result (AC2–AC3), rejection without an owner (AC2/AC4), and
preservation of edited guidance (AC6). Detailed boundary and failure checks remain
in domain, integration and CLI suites, rather than duplicated Gherkin.

## Verification plan

- Focused domain tests for slug/title boundaries and owner rules (AC2–AC4).
- Acceptance through application API with isolated real filesystem and existing
  store fixture for core create/ownership and init compatibility journeys.
- Integration tests for literal YAML/Markdown, URL encoding/containment, case
  collisions, and controlled failure cleanup/log warning (AC1, AC4–AC6).
- A small CLI process set for dispatch, --help, --json, owner override and wrong
  arguments. Ensure generated command examples remain executable (AC7).
- npm run verify before handoff; document actual Windows/Linux evidence. Retain
  the known uppercase-drive Vitest workaround. No blanket scenario duplication.

Manual trial: initialize a disposable directory; inspect AGENTS.md; create a
Project; enter it and create a title-only Outcome; create another Outcome with
explicit owner from the Workspace root; inspect README/index/log and JSON output.

## Open questions

No blocking design questions remain. The Expected Result default, portable slug
rules, warning semantics and guidance compatibility policy are approved.
Broader Markdown parsing, index maintenance and guidance refresh are deferred.

## Implementation and review outcome

Implemented the two create commands through domain rules, application ports and
filesystem/Markdown adapters, with deterministic naming, structural owner
validation, literal documents, exclusive creation and owned-artifact rollback.
Fresh init generates the single-source Workspace guide; repeat init preserves
edited or missing guidance. Existing indexes and the operational database are
unchanged by creation. No dependency or schema changes were needed.

Independent review of the actual working-tree diff identified an in-place log
rewrite that could damage history after a partial write. It was replaced by an
exclusive temporary sibling and rename after the complete write; regression tests
inject a partial write and verify preserved history and usable created objects.
Review also prompted inference through ordinary non-owner README documents while
still rejecting malformed claimed owners. That review reported no further findings
at the time. A subsequent independent review found two additional issues, now fixed:

- Existing log bytes are decoded strictly as UTF-8 before replacement. Invalid
  encoding leaves history untouched and returns `LOG_WRITE_FAILED` with the usable
  newly created object.
- Expected Result recognition ignores headings inside backtick and tilde fences,
  while preserving fenced content within a real Expected Result section. A code
  example alone cannot validate an Outcome owner.

Regression tests cover both findings, log rename failure, invalid ancestors of
explicit nested owners, and the nearest Workspace boundary. The implementation and fixes are committed as
`99b711b9944d991da03574432e26f2ebfb7dfa76` on
`agent/increment-0002-project-outcome-creation`. A subsequent independent review
of that revision confirmed the corrections and found no further blocking issues.

### Test-value audit and adjustments

The reviewed tree contained 119 Vitest cases and 11 acceptance scenarios (130 total),
versus 45 total on main. The audit retained distinct URL, collision, lifecycle,
rollback and CLI-boundary cases rather than optimizing for a target count.

| Adjustment                                                                                          | Remaining protection or added risk coverage                                                                                                                                          |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Remove the generic append-adapter failure case                                                      | Malformed-log and partial-write tests still verify successful creation with a warning.                                                                                               |
| Remove the ordinary README init-collision case from integration                                     | Acceptance scenario "Preserve a conflicting README" verifies the same real I/O and preservation.                                                                                     |
| Remove repeated top-level Project and owner-override operations from the nested integration journey | Canonical acceptance scenarios and CLI owner-override coverage remain; integration retains nearest nested inference and literal explicit Expected Result.                            |
| Stop repeating edited-guide init in integration                                                     | Acceptance retains edited-guide repeat init; integration retains create preservation and missing-guide compatibility.                                                                |
| Move three init failure tests from application unit to integration                                  | These already use real filesystem/store adapters; no cases were removed.                                                                                                             |
| Strengthen existing assertions                                                                      | Snapshots include empty directories; document shape is checked independently of the production context parser; Project terminal states and a non-device uppercase slug are explicit. |
| Add seven integration cases                                                                         | Invalid UTF-8, failed log rename, two distinct fence forms, real-section fenced content, invalid owner ancestor, and nested Workspace boundary.                                      |

Final totals are 124 Vitest cases plus 11 acceptance scenarios (135 total). The
decrease in repeated journeys is independent of this net increase of five cases.
Guidelines now require lossless-decoding checks, negative Markdown code examples,
and directory-aware preservation snapshots. The directory-in-place-of-log test is
named accurately; it does not claim to exercise actual ACL denial.

Post-review verification on 2026-09-20: `npm run verify` exited 0 on Windows with Node.js
24.21.0 and npm 11.4.1, using the uppercase-drive checkout path. This verified the
implementation/test working tree based on commit
`3206f0f15fc4c2fbf693e849b1381aa45154af49`; only this outcome/status documentation
was updated afterward.

- Typecheck, ESLint, Prettier, architecture (23 modules / 50 dependencies) and build passed.
- Unit: 39 tests in 2 files passed.
- Integration: 70 tests in 4 files passed, including encoding, fence parsing,
  partial log writes, rename failure, Workspace boundaries and rollback.
- Acceptance: 11 scenarios / 63 steps passed (including the four new scenarios).
- CLI E2E: 15 tests passed, including generated guide examples executed through
  the built CLI outside the checkout, explicit ownership, warning output and errors.
- `git diff --check` passed. The first post-review verify attempt stopped at two
  unsafe matcher assignments in new tests; those assertions were corrected and the
  complete command then passed without skips or weakened checks.

No installed `npm link` trial or separate manual UI trial was performed
for this increment. The built CLI journey covers the documented creation trial
automatically; human trial instructions are in the tool README. No checks were
weakened or skipped to obtain the passing result.

Final independent review and Linux verification of committed revision
`99b711b9944d991da03574432e26f2ebfb7dfa76` completed on 2026-09-20:

- Reviewed the diff against main, corrections, architecture and test value;
  no further blocking code findings. The remaining stale handoff text and PR
  description were corrected in a documentation-only follow-up.
- `npm run verify` passed on Linux with Node 24.19.0/npm 11.9.0: typecheck,
  lint, formatting, architecture, build, 39 unit, 70 integration, 15 CLI tests,
  and 11 acceptance scenarios / 63 steps. This runtime differs from the pinned
  Node 24.21.0; the Windows evidence above covers the pinned runtime.
- The test audit found the parametrized boundary cases justified; no blanket
  test-count reduction was recommended.
- The user accepted the review and authorized merge. Increment 0002 is completed;
  merge does not create a release. Production code did not change after this run.

Limitations: explicit owner paths require physical directories (internal aliases
as well as escaping symlinks/junctions are rejected). Contextual discovery follows
the physical working directory. Log validation supports the generated Log/date/
flat-list structure; broader Markdown parsing remains deferred. Concurrent writers,
crash recovery, automatic index updates and guide refresh remain out of scope.
No release, tag or dependency update is included.

## Decision changes and follow-up

This extends increment 0001's fresh initialization artifacts with AGENTS.md while
preserving its repeat-init behavior. Later command increments must update the
Workspace guide template; this obligation is recorded in development guidelines.
