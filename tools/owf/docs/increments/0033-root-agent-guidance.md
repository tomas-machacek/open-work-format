# 0033 — Root agent orientation

> Status: draft
> Description: Give agents launched at the repository root a compact orientation and routes to existing authoritative guidance.
> Depends on: [0031 — Code map and agent navigation](0031-code-map.md) (completed).

## Goal and scope

Agents commonly start at the repository root, but repository development
instructions currently exist only under `tools/owf/`. Add a root `AGENTS.md`
that explains the repository and directs agents to the guidance relevant to
their task without copying tool instructions.

This is a documentation-only increment. It does not depend on pending 0032.
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

Not implemented. Record delivered guidance, verification and independent review
at handoff; keep this document and its index status consistent.
