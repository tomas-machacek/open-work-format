# 0029 — Progressive Workspace agent guidance

> Status: completed
> Description: Generate a compact Workspace AGENTS.md with linked offline topic guides and enforce rules that prevent renewed growth.
> Depends on: Existing Workspace initialization and completed operational increments through [0028](0028-web-action-create-delete.md), merged into main through [PR #34](https://github.com/tomas-machacek/open-work-format/pull/34).

## Goal and scope

The generated Workspace AGENTS.md has grown to roughly 22 KB. It combines
orientation, command reference, operational workflows and implementation contracts.
Agents load too much material before knowing which task they need to perform,
and some descriptions no longer match delivered browser behavior.

Fresh initialization must produce a short entry point and discoverable topical
Knowledge Documents. This increment changes generated documentation and its
initialization/verification support, not OWF domain operations.

Included:

- A plain Markdown AGENTS.md without YAML frontmatter, at most 4096 UTF-8 bytes.
- Local topic guides under the existing Workspace Knowledge directory.
- Navigation, tool-version identification and a review of guidance accuracy.
- Explicit representation-profile treatment of AGENTS.md and OKF compatibility.
- Development rules, increment-template guidance and executable quality checks.

Deferred: documentation refresh/backfill commands, automatic replacement of
existing guides, `owf docs`, online documentation services, new operational
features, schema changes, store migration and changes to Core semantics.

Increment [0028](0028-web-action-create-delete.md) is completed and merged into
main through [PR #34](https://github.com/tomas-machacek/open-work-format/pull/34).
This proposal is based on that completed baseline. Generated guidance must cover
creation in ordinary View columns and confirmed global Action deletion from
Views and Default Kanban; View-instance deletion remains CLI-only.

## Proposed solution

### Compact agent entry point

The root Workspace AGENTS.md remains conventional Markdown with direct
instructions and no frontmatter. Aim for 2–4 KiB; the hard ceiling is 4096 bytes
of the actual generated UTF-8 file, including its navigation and any version text.
This limit applies only to our generated artifact, never to a user's own file.

Keep only information needed before choosing a topic:

- Workspace orientation and authoritative locations: Project/Outcome context,
  Knowledge and reusable View definitions in Markdown; Actions and operational
  View instance data in the Operational Store.
- Minimal semantics: meaningful ownership; Outcomes express results and are not
  automatically achieved when all known Actions finish; Views organize attention
  without owning Actions; Waiting differs from blocking, which is separate from
  execution state.
- Workspace discovery from the working directory, nearest Project/Outcome
  context for creation, explicit owner override, Workspace owner `/`, and
  Workspace-rooted owner URLs. Listing does not implicitly narrow to the current
  Project/Outcome; use explicit owner filters.
- Preserve user files and stable identity. Use supported operational interfaces;
  never reset/replace a store to bypass an unsupported schema or repair errors.
  Distinguish unavailable storage from an empty collection.
- Permanent deletion has no undo.
- How to discover syntax with `owf --help` and command help, a small selection of
  common commands, and how to launch the browser board.
- Direct links to topic guides with short task triggers saying when to read them.

Separate conceptual capabilities from currently implemented features. Mentioning
Outcome semantics must not imply that unsupported Outcome transitions exist.
Do not include exhaustive options, complete View definitions, JSON envelopes,
event sequences, transaction internals or a feature-by-feature changelog here.

### Topic guides as Workspace Knowledge

Generate these files on fresh initialization:

| Workspace path                                | Purpose                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `_knowledge/owf/index.md`                     | Topic discovery with concise descriptions.                                                        |
| `_knowledge/owf/workspace.md`                 | Layout, navigation, authority boundaries, context, owner URLs and Project/Outcome creation.       |
| `_knowledge/owf/actions.md`                   | Action creation, retrieval, listing, search, editing, state and Waiting workflows.                |
| `_knowledge/owf/blocking-and-dependencies.md` | Manual blocks, prerequisite direction, derived blocking and completion guards.                    |
| `_knowledge/owf/views.md`                     | Reusable definitions, instances, routing, placement, ordering and CLI moves.                      |
| `_knowledge/owf/browser-board.md`             | Serve, refresh, Default Kanban, Views and delivered browser interactions.                         |
| `_knowledge/owf/deletion.md`                  | Permanent deletion, incoming dependencies, global Action cleanup and instance-only View deletion. |

Use the existing representation profile for Knowledge Documents: parseable YAML
frontmatter with the established Knowledge `type`, title and short description.
Do not invent a new OWF object type or a new reserved `_docs/` directory.
Index files follow existing navigation conventions rather than Concept
frontmatter. Connect root navigation to `_knowledge/index.md`, then the OWF
guide index; avoid orphaned generated documents.

Provide explicit links between related topics, including deletion and blocking
from Actions. Keep a complete copyable valid View definition in views.md.
Use one maintained content source per generated topic; packaging may use
templates or resources within the existing architecture. Installed/built CLI
execution must work without a source checkout or network access.

Identify the producing tool version in each topic document, derived from the
existing authoritative tool-version source. Explain that these files are a
snapshot generated at initialization, not automatically synchronized reference
material. This is a tool version, not the Core or OKF specification version.

### Content boundary and accuracy

Audit the old guide against implemented help, application behavior and tests.
Correct obsolete statements such as read-only/passive browser behavior or the
absence of View drag-and-drop. Include the delivered 0028 View-column creation
and shared Action deletion controls, including confirmation and dependency rejection.

Retain user-visible consequences in topic guides: cross-column moves can change
Action state; placement/order belong independently to each instance; shared
definition edits affect referencing instances; reads do not repair definitions;
broken required definitions can prevent writes; deleting an instance preserves
Actions and its Markdown definition. Explain practical recovery without directing
agents to reset stores or silently alter configuration.

Implementation contracts stay with repository documentation and tests. Preserve
or add a repository reference for any still-required contract removed from the
guide if no authoritative coverage exists. Do not reproduce transaction internals,
normalization algorithms or exhaustive JSON shapes in Workspace Knowledge.

Help is the installed syntax reference. Guides explain semantics and workflows
with selected examples, without claiming that unimplemented commands exist.

### Representation and OKF compatibility

Update the representation-profile notes to explicitly identify AGENTS.md as an
agent integration artifact excluded from the OWF Knowledge Document envelope.
Topic guides remain ordinary Knowledge Documents.

OKF v0.2 itself reserves only index.md and log.md; a frontmatter-free AGENTS.md
is not an upstream OKF exception. Explain accurately that the Workspace includes
an OKF-compatible knowledge/document subset plus this integration artifact.
Qualify existing blanket bundle-conformance claims in directly affected design
and overview documentation. Do not claim strict whole-tree OKF conformance or
change the upstream specification. No Core object/lifecycle changes are needed.

### Initialization and preservation

Extend fresh Workspace generation to include the topic guides and navigation
using the existing initialization planning/write and failure-handling conventions.
Do not bypass those boundaries with an unrelated post-init documentation write.

Preserve the existing repeat-init contract: an already initialized Workspace is
not automatically refreshed or backfilled, even when it lacks these new guides.
Its AGENTS.md, Knowledge, indexes, configuration and store remain unchanged.

During initialization of a previously uninitialized directory containing user
files, preserve existing files and directories under current collision rules.
Never overwrite an existing AGENTS.md, guide or index. Where an existing index
prevents adding navigation, report the existing preservation/manual-navigation
warning pattern; do not report overwritten or stale user content as freshly
generated. Any collision that existing init rules reject must fail through those
rules. Document that retained older AGENTS.md content may lack new topic links.

No migration, reset, force-overwrite flag or upgrade mechanism is introduced.

### Rules preventing renewed growth

Replace the current development-guidelines rule that every fundamental command
change must update the Workspace AGENTS.md template. Require updating relevant
topic guidance, help and examples instead.

The revised rule must establish:

- AGENTS.md owns cross-cutting orientation, essential semantics and navigation.
- A feature normally extends its topic guide; add an entry-point link only when
  needed for discovery.
- New entry-point prose needs a cross-cutting reason: the agent needs it before
  choosing which topic to load.
- Detailed information has one primary home; entry points summarize and link.
- The 4096-byte limit must not be raised or bypassed as routine feature work.
  A future change needs an explicit separately agreed design decision.
- Review checks both size and useful content; minification or removal of essential
  semantics is not an acceptable way to pass.

Add a small documentation-impact prompt to the increment template: identify
affected topic guides, justify AGENTS.md changes and retain the size limit.
Add only a short pointer to this policy from the repository's development
`tools/owf/AGENTS.md`, distinct from the generated Workspace file.

Add automated checks to the existing test/verification path:

- The actual generated AGENTS.md is at most 4096 UTF-8 bytes and has no YAML
  frontmatter.
- Local documentation links from the entry point and generated guide navigation
  resolve in a fresh initialized Workspace. Resolve Workspace-rooted links from
  that Workspace; exclude external URLs and illustrative links inside code fences.
- Topic documents have the required Knowledge envelope; indexes use their
  established format and topics are reachable through navigation.
- Version text comes from the authoritative installed tool version.

These checks run under the existing `npm run verify` path. They are suitable
for future CI; creating GitHub Actions is outside scope.

## Acceptance criteria

AC1: Fresh initialization emits a frontmatter-free root AGENTS.md of at most
4096 UTF-8 bytes, retaining the agreed semantics, authority, owner/context,
preservation, permanent-deletion warning and task-triggered topic navigation.

AC2: All listed topic guides and indexes exist in a fresh Workspace, conform to
their document roles and are reachable from Workspace navigation. Guide links
resolve, and docs remain usable offline from the built/installed CLI.

AC3: Topic guidance identifies the generating tool version and snapshot nature.
Examples match supported commands; views.md includes a valid reusable definition.

AC4: Guidance reflects delivered CLI and browser behavior through the integrated
baseline, including 0028. No obsolete read-only/passive/no-drag statements survive
as descriptions of the current browser. User-visible consequences remain
documented; implementation contracts have repository homes.

AC5: Repeat init leaves existing Workspace files, directories and store unchanged,
with no backfill. Initialization around pre-existing user instructions, Knowledge
or indexes preserves them and follows current collision/warning/failure rules.

AC6: The representation profile explicitly handles frontmatter-free AGENTS.md
and accurately qualifies whole-tree OKF conformance. Knowledge guides use the
existing profile; no new reserved directory or Core object is introduced.

AC7: Development guidelines, the increment template and the repository agent
entry point contain the agreed maintenance policy without conflicting instructions
to grow the generated AGENTS.md for every command change.

AC8: Existing verification runs enforce byte size, frontmatter/document roles,
navigation/link validity and version provenance. A representative oversized
artifact and broken topic link are demonstrated to fail the gate.

AC9: No operational command behavior, schema or migration changes are introduced.
Existing init preservation and failure-handling guarantees continue to pass.

## Verification plan

- Test actual fresh initialization output for size, envelope, version and parsed
  documentation links/navigation (AC1–AC3, AC8). Count UTF-8 bytes, not characters.
  Include meaningful negative gate probes; remove temporary probes afterward.
- Exercise documented commands in a disposable Workspace, including the copyable
  View definition and a chosen-column move. Reuse existing command tests where
  they already establish behavior; do not build a duplicate full CLI test suite.
- Extend preservation checks for repeat init and pre-existing AGENTS.md, Knowledge,
  topic paths and indexes. Include byte preservation and empty directories, and
  reuse existing initialization failure tests (AC5, AC9).
- Review topic content against help, implemented browser controls and existing
  semantic tests; trace removed technical material to its repository authority.
- Review changed profile/overview claims and the dev-guide/template/repository
  agent pointer for consistency (AC6–AC7).
- Run applicable documentation formatting checks and `npm run verify` before
  implementation handoff. Record the actual revision, commands, platform and
  results, including any unperformed checks.

Human try-out: initialize a fresh disposable Workspace; read only AGENTS.md,
follow its task-specific link to create a View, and use its definition/example.
Inspect navigation and version text. Edit a guide and AGENTS.md, repeat init,
and verify both edits remain intact without new backfilled files.

## Open questions

No blocking design questions remain. Exact template/resource organization and
test placement follow the existing architecture. Completed increment 0028 is part
of the baseline, not a pending dependency.

## Implementation and review outcome

Implemented, independently reviewed and verified. Both P2 review findings were
corrected. PR #35 was merged into main, and completion was authorized on 2026-10-30.
Fresh init emits
the compact entry point, six Knowledge topics and two Knowledge navigation indexes.
Content is compiled with the CLI and uses the same installed package-version
source as --version. Generation uses the existing application/file-port ownership
and rollback flow. Existing root collisions still fail; existing physical
Knowledge directories and regular topic/index files are preserved, with
GUIDANCE_PRESERVED warnings for retained files and manual navigation work.

The generated topics cover delivered CLI/browser behavior through 0028, including
ordinary-column Action creation, View movement/reordering and confirmed global
Action deletion. No operation, schema, migration or refresh feature was added.
Representation/overview notes now distinguish the OKF-compatible document subset
from the plain AGENTS.md integration artifact. Maintenance policy, increment
template and repository agent instructions enforce progressive guidance.

Removed implementation detail retains these repository authorities:

- [Architecture](../architecture.md#view-evaluation-and-write-command-boundary)
  owns evaluation snapshots, write reconciliation, placement/order and events;
  its web movement/deletion sections cover the delivered adapter contracts.
- [Tool reference](../../README.md#view-instances),
  [moves](../../README.md#moving-actions-through-cli),
  [Action operations](../../README.md#create-projects-outcomes-and-actions) and
  [blocking](../../README.md#manual-blocking-and-prerequisites) retain JSON/output,
  search, state/event and error details; corresponding integration/CLI/browser
  tests remain executable contract evidence.
- [Operational Store design](../../../../docs/design/operational-store-notes.md)
  remains the authority for identity, dependency direction and atomic operations.

No substantive design/scope deviation was required. The original handoff preceded
independent code review; the review and corrective follow-up are recorded below.

Verification on 2026-10-30:

- Implementation: [9059b71](https://github.com/tomas-machacek/open-work-format/commit/9059b715ad5b4555b269504766812d7ff501be00),
  with the type-safe regression assertion fix in
  [623f460](https://github.com/tomas-machacek/open-work-format/commit/623f460a69e78b3dcae4309f669a781774a15a36).
  The final full verification passed on 623f460; the following documentation-only
  handoff update records its evidence.
- Platform: Windows NT 10.0.26300.0, PowerShell, Node 24.21.0, npm 11.4.1.
  Commands run from tools/owf with an uppercase C: checkout path.
- Final `npm run verify`: exit 0. Typecheck, lint, formatting, architecture and
  production build passed, followed by 203 unit tests, 288 integration tests,
  40 Cucumber scenarios / 222 steps, 32 CLI tests and 29 Chromium tests. The
  documentation-only handoff update was checked with Prettier and git diff --check.
- Standalone disposable-Workspace probes against the implementation passed:
  fresh AGENTS.md is 3103 UTF-8 bytes; an artifact with 3600 characters but 4097
  UTF-8 bytes is rejected with the size diagnostic. Replacing the Actions topic's
  deletion link with missing-topic.md is rejected as a broken local link. The
  temporary Workspace/probes were removed. Permanent negative regression cases
  additionally cover frontmatter, Knowledge roles, Concept-style indexes,
  version mismatch and orphaned topics.
- The built-package smoke test copies dist and installed package metadata without
  source/templates/repository docs, shares only dependency packages, and changes
  its installed version to prove provenance. Generated guidance passes the same
  audit offline. Existing CLI journeys now execute topic examples, including the
  complete View definition, chosen-column move and dependencies/deletion.
- Preservation coverage includes invalid UTF-8 user bytes, existing indexes/topics,
  empty directories, missing-guide repeat init without backfill, unsafe path
  collisions/junctions and mid-guide rollback. Renderer failure retains the
  INITIALIZATION_FAILED contract. Existing init/store/concurrent-file failure
  tests remain in the verification path.
- Development checks found and fixed a test snapshot-restoration error and a
  lint-unsafe matcher assignment. Two earlier sandbox CLI journeys exceeded their
  existing five-second timeouts; the same focused suites passed outside it with
  no timeout changes. Vite/tsx also encountered sandbox spawn EPERM; required
  process checks and the final full run execute outside that sandbox.

Content was checked against installed help, implemented controls and existing
semantic tests, including 0028 creation/confirmation/dependency-rejection flows.
No domain, SQLite schema or web implementation files changed. Linux and a separate
interactive human/Obsidian session were not tested. No refresh/backfill, store
migration, release or CI service was added. This paragraph records the original
implementation handoff; subsequent review and verification evidence follow below.

### Independent review and corrective follow-up

Independent review of PR #35 at `787950b27f7f04698772a78e06512a227f02f5d1`
against current main `ed4c597ba888a10224953df2a4e48caa783481b2` found two P2 issues:

- The local-link audit resolved relative paths against an artificial HTTPS root.
  It accepted `../../../AGENTS.md` from the Actions topic by checking the Workspace
  entry point instead of the nonexistent file outside the Workspace.
- Browser guidance incorrectly promised that every failed board read disables
  all writes. Default Kanban still permits creation/state moves, and both board
  modes retain detail deletion. The existing component regression reproduced
  creation after a failed Default Kanban refresh.

Both are corrected in `7615b78d043d5cca9598274c9071c8710eb033e2`:

- The audit resolves file URLs from the document location, explicitly maps leading
  slashes to the Workspace root, then rejects resolved paths outside it. Valid
  parent-relative, normalized, encoded and Workspace-rooted links remain usable.
- The browser topic distinguishes View creation/movement/save restrictions from
  other available operations and recommends refreshing stale data before choosing
  changes/deletion. It also states the confirmation's unsaved-edit loss warning.
  No browser behavior changed.
- The existing boundary discipline now covers relative versus Workspace-rooted
  documentation links and forbids web-root clamping in their validation.

Three permanent regression probes cover relative escape, Workspace-rooted escape
and encoded parent segments, including an existing file outside the Workspace.
All three failed against the original audit and pass with the fix. The focused
initialization/guidance/rollback run passed 47 tests. Before correction, the
independent review also passed 44 initialization/integration tests, 32 built CLI
tests and one focused Default Kanban component test; standalone probes rejected
4097 UTF-8 bytes at 3600 characters and a missing topic filename. The generated
entry point remains unchanged at 3103 UTF-8 bytes.

The final complete **`npm run verify` passed, exit 0**, against corrective revision
`7615b78d043d5cca9598274c9071c8710eb033e2` on **Windows, Node 24.21.0,
npm 11.4.1 and headless Chromium**, 2026-10-30:

- Typecheck, ESLint, Prettier, architecture (62 modules / 207 dependencies) and
  production TypeScript/Vite build passed.
- Unit/component: **203 tests passed**.
- SQLite/HTTP/proxy/guidance integration: **291 tests passed**.
- Acceptance: **40 scenarios / 222 steps passed**.
- Built CLI: **32 tests passed**, including installed-package offline guidance.
- Chromium: **29 tests passed**, including existing creation/deletion, stale-read,
  focus, movement and responsive-layout journeys.

All checks passed on the first full corrective run without retries or weakened
timeouts/gates. Only this review/evidence documentation follows that verified
revision; its formatting and `git diff --check` were checked separately.

The review's optional suggestion to validate heading fragments remains deferred;
the gate checks local file targets and generated navigation currently uses no
heading fragments. Linux and a separate interactive human/Obsidian check remain
unperformed. No additional independent reviewer of the corrective commit is
claimed. The human explicitly authorized fixes, commits and merge of PR #35.

## Decision changes and follow-up

- 2026-10-30: Marked completed after implementation, independent review, correction
  of both P2 findings and successful final verification. Merged through
  [PR #35](https://github.com/tomas-machacek/open-work-format/pull/35).
  Completion does not create a release.

- 2026-10-30: The human reviewed and approved this proposal for implementation.
  The proposal was marked reviewed at that point, before implementation and review.

- 2026-10-30: Rebased the proposal onto main after completion and merge of 0028.
  Updated dependency, browser-guidance scope and index; the proposed 0029 scope
  and draft status remain unchanged.

- AGENTS.md intentionally remains without frontmatter; the compatibility boundary
  is documented rather than changing its conventional agent-facing form.
- The growth gate runs in existing local verification. CI can call the same path
  when separately adopted; this increment does not establish a CI service.
- Explicit documentation refresh/backfill and `owf docs` remain future work.
