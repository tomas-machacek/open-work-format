# 0033 — Root agent orientation

> Status: completed
> Description: Give agents launched at the repository root a compact orientation and routes to existing authoritative guidance.
> Depends on: [0031 — Code map and agent navigation](0031-code-map.md) (completed).

Design reviewed and approved for implementation by the user on 2026-11-05.

## Goal and scope

Agents commonly start at the repository root, but repository development
instructions currently exist only under `tools/owf/`. Add a root `AGENTS.md`
that explains the repository and directs agents to the guidance relevant to
their task without copying tool instructions.

This is a documentation-only increment. It does not depend on 0032.
Scope is the root entry point and minimal maintenance guidance needed to keep it
small. Runtime behavior, generated Workspace AGENTS.md and Knowledge guides,
dependencies, test configuration and verification workflows are unchanged.

## Proposed solution

Create a frontmatter-free `/AGENTS.md` in English, using paths relative to the
repository root. Aim for about 20–40 readable lines as an editorial target,
not a new automated size gate.

Include only information useful before choosing a task route:

- A short explanation of OWF as a tool-independent work model, with a reference
  CLI/web implementation under `tools/owf/`.
- A small repository map: `spec/core-v0.md` for normative Core semantics,
  `docs/design/` for design material, `tools/owf/` for implementation, and
  `examples/` for non-normative examples. Do not imply planned examples or
  capabilities are already implemented.
- Task routes: specification/design work starts with the relevant specification
  and design documents; tool planning, implementation and review must first read
  `tools/owf/AGENTS.md`, even when the agent was launched from the root.
  Link to the increment index for locating the current increment; the nested
  entry point continues to own the route to the code map and engineering rules.
- A concise distinction between repository development instructions and the
  operational guidance generated into user Workspaces.

Keep detailed engineering rules, commands, domain semantics and implementation
navigation in their existing primary documents. Do not copy the nested
AGENTS.md, code map, increment index, README narrative or generated guidance.
Use direct links to concrete documents where a reading instruction needs one,
rather than asking every agent to read the whole documentation tree.

Add a brief maintenance note to the existing working-model/document-ownership
section of `tools/owf/docs/development-guidelines.md`: the root AGENTS.md owns
repository orientation and routing, the nested AGENTS.md owns tool-development
orientation, and new detail belongs in its primary document. Root guidance
changes only when common orientation or routing changes. Do not expand the
nested entry point merely to repeat this policy.

The generated Workspace AGENTS.md 4096-byte ceiling remains specific to that
generated artifact; this increment introduces no new gate or runtime behavior.

## Acceptance criteria

- **AC1 — Root discovery:** a tracked, frontmatter-free `AGENTS.md` exists at
  the repository root and gives accurate, concise project and directory context.
- **AC2 — Task routing:** an agent starting at the root can find the normative
  Core specification, relevant design material and the tool-development entry
  point. Tool work explicitly requires reading `tools/owf/AGENTS.md` before
  changing files under that subtree.
- **AC3 — One primary home:** root guidance links to existing instructions
  rather than reproducing tool rules, command catalogs or the code map. It
  distinguishes repository instructions from generated Workspace guidance.
- **AC4 — Maintainable scope:** the guidelines record ownership and the
  anti-duplication maintenance rule. All new links resolve, guidance agrees
  across both entry points, and the implementation diff contains only the root
  entry point and necessary repository documentation updates.

## Verification plan

- Walk through two tasks from root AGENTS.md: a Core/design clarification and a
  tool change. Record the route to the relevant authority; for tool work,
  continue through the nested entry point to the current increment and code map.
- Resolve relative links from each changed document and check section anchors
  where used. Read both AGENTS.md files together for duplication or conflicts.
- Inspect length and content against the editorial target; prefer removing
  detail to compression. Review the diff for documentation-only scope.
- Run focused Markdown formatting checks and `git diff --check`; report the
  actual commands and platform. Runtime suites, full `npm run verify`, new
  automated documentation gates and agent benchmarks are unnecessary here.
- Human check: launch an agent from the repository root and give it a small tool
  task; confirm the new entry point directs it to the nested instructions.
  Report this as unperformed unless actually observed.

## Implementation and review outcome

Implemented and independently reviewed on 2026-11-05. No review findings or
design deviations were identified; acceptance criteria AC1–AC4 are satisfied.

### Delivered guidance

- Root `AGENTS.md` is an English, frontmatter-free entry point with project
  context, the four-directory map and task routes (AC1, AC2). It explicitly
  requires reading `tools/owf/AGENTS.md` for tool planning, implementation and
  review, including before changing files in that subtree.
- It links to existing authorities and the increment index, leaves code-map and
  engineering navigation to the nested entry point, and distinguishes repository
  development from generated Workspace operational guidance (AC3).
- The guidelines' working-model/document-ownership section records both entry
  points' ownership, primary-document maintenance and when root guidance changes
  (AC4). Root guidance has 32 readable physical lines, within the 20–40-line
  editorial target. No size gate was added.

### Local navigation walkthrough

Starting at root `AGENTS.md`, the implementer followed two routes:

- Core/design clarification: the specification/design route leads to
  `spec/core-v0.md`, section 7.3, for normative blocking/executability semantics,
  and `docs/design/operational-store-notes.md`, section 9.2, for Action storage
  fields. Both establish that Blocked is derived rather than an intrinsic state;
  the root entry point keeps those rules in their authoritative documents.
- Tool change, using generated-guidance maintenance as a representative task:
  root → `tools/owf/AGENTS.md` → increment index → this current increment, plus
  `tools/owf/docs/code-map.md`. The map's generated-guidance row locates
  `src/infrastructure/markdown/agents.ts`, the guidelines' Workspace guidance
  policy and `tests/integration/workspace-guidance.test.ts`; its focused-check
  route gives `npx vitest run tests/integration/workspace-guidance.test.ts`.
  The source and test entry points were inspected for navigation only; this
  hypothetical task is outside 0033 and that runtime test was not executed.

### Implementation verification and limitations

Platform: Windows 10.0.26300, PowerShell 7.6.9, Node 24.21.0, npm 11.4.1.
Checks actually performed:

- A one-off PowerShell here-string piped to `node --input-type=module`, run from
  `tools/owf/`, used the installed CommonMark parser to resolve all local Markdown
  links in the four changed documents and the unchanged nested `AGENTS.md`.
  All 69 local links, including 10 section anchors, resolved within the repository;
  the root document was also checked for absent frontmatter and line count.
  An initial parser import failed; rerunning with the named `Parser` export passed.
  No validator file or automated gate was added.
- Both entry points were read together: no duplicated tool rules or conflicting
  guidance was found. The two routes above reached the relevant authorities.
- From `tools/owf/`,
  `npx prettier --check ../../AGENTS.md docs/development-guidelines.md docs/increments/0033-root-agent-guidance.md docs/increments/README.md`
  passed. Prettier also normalized the index table when its status was updated.
- From the repository root, `git diff --check` passed. Diff/content inspection
  confirmed only the root entry point, ownership note and increment/index records
  changed; generated guidance, source, dependencies and verification configuration
  are unchanged.

Runtime suites and full `npm run verify` were not run, as specified for this
documentation-only increment. The human check of launching a new agent from the
root has not been performed or observed. To try it, launch an agent at the root,
give it a small tool task and confirm it reads `tools/owf/AGENTS.md` first.
No unresolved implementation finding or blocking question was identified by the
implementer.

### Independent review and rebase

Independent review assessed `483f33c` against the agreed scope and AC1–AC4 using
`main...HEAD` from common ancestor `8c0b972`, without treating the implementer's
summary as proof. No findings required correction. The reviewer walked both task
routes, read both entry points together and confirmed documentation-only scope.
On the same Windows/PowerShell/Node platform recorded above, a one-off CommonMark
check resolved 69 local links and 10 anchors across the four changed documents
and nested AGENTS.md. Both `git diff --check main...HEAD` and
`git diff --check main HEAD` passed. The unchanged formatting inputs reused the
implementation's recorded Prettier result; runtime suites were not run.

At the user's request, the branch was rebased onto `main` at `5faed41`, which
already contains increment 0032. Rebase conflicts were confined to the increment
index; both 0032 and 0033 were retained. Rebased delivery `cdef45d` preserves the
reviewed root guidance and ownership note, together with 0032's existing tool
instructions, code map, verification guidance and implementation. This completion
record and the matching index status are documentation-only follow-ups.

Post-rebase checks cover `cdef45d` plus these completion/index follow-ups on the
same recorded Windows platform. They were rerun because rebase changed the
guidelines and nested entry point and required index conflict resolution:

- The one-off CommonMark check via `node --input-type=module` from `tools/owf/`
  resolved all 75 local links and 11 anchors across the four changed documents
  and nested AGENTS.md. Root guidance still has 32 lines and no frontmatter.
- Both task routes were rechecked. Tool navigation now continues from the code
  map to `docs/verification.md` for the generated-guidance focused command,
  preserving increment 0032's navigation changes.
- From `tools/owf/`,
  `npx prettier --write ../../AGENTS.md docs/development-guidelines.md docs/increments/0033-root-agent-guidance.md docs/increments/README.md`
  normalized only the index row. The corresponding `npx prettier --check` with
  the same four paths passed on the final documentation.
- From the repository root, `git diff --check main` and `git diff --check`
  passed. Final scope inspection confirmed four documentation files; source,
  tests, dependencies, generated guidance and verification tooling match `main`.
- Runtime suites and full `npm run verify` were not run: this remains a
  documentation-only increment under its agreed verification plan.

The human check of launching a new agent remains unperformed. There are no
unresolved review findings.
