# OWF Tool Agent Instructions

These instructions apply under tools/owf/. Human supervision sets direction and
scope; AI agents implement and review changes.

## Start here

1. Read the agreed document for the current increment; use the
   [increment index](docs/increments/README.md) to locate it or check status.
2. Read the [code map](docs/code-map.md) for current entry points, task routes,
   important nonlocal effects and focused checks.
3. Follow the relevant task links to rules, code and tests before changing them.
   Inspect adjacent callers and contracts when the change crosses boundaries.
   Read completed increments when their decisions or regressions are relevant.

Common orientation is this entry point, the map and the current increment;
architecture, guidelines, MVP and historical documents are read by relevant
section, not in full for every task. Their applicable rules still govern the work.

## Scope and authority

Follow the agreed increment and acceptance criteria. Keep its status and index
row current; record actual delivery, verification and review evidence at handoff.
Existing conversational agreement does not need duplicate approval to update them.
Subsequent implementation requires an agreed increment.

[Core](../../spec/core-v0.md) and the agreed
[Operational Store](../../docs/design/operational-store-notes.md) and
[Views](../../docs/design/views-profile-notes.md) designs own semantics;
[MVP scope](../../docs/design/mvp-scope.md) selects capabilities.
[Architecture](docs/architecture.md#purpose-and-authority) owns structural decisions;
[guidelines](docs/development-guidelines.md#working-model-and-document-ownership)
own engineering practice. Increments do not override these documents.
Distinguish rules, recommendations, examples and open decisions. Report conflicts.

## Implementation and verification

Keep domain rules in domain, orchestration in application and wiring in bootstrap.
Respect [public boundaries](docs/architecture.md#dependency-boundaries); no production
cycles or concrete adapters in application. Avoid unrelated abstractions,
dependencies, refactors and features.

Develop [meaningful tests](docs/development-guidelines.md#tests-and-acceptance-criteria)
with behavior. Apply [boundary and verification discipline](docs/development-guidelines.md#boundary-and-verification-discipline)
and the [lint baseline](docs/development-guidelines.md#lint-and-architecture-rules).
Use the [verification workflow](docs/development-guidelines.md#development-verification-workflow)
and [focused recipes](docs/verification.md) while working; run full `npm run verify`
before code handoff.
For documentation-only work, follow the increment's documentation checks.
Never weaken gates or claim unrun/unavailable checks passed. Validation is local;
do not add GitHub Actions or automatic publishing without a new decision.

When commands or generated guidance change, follow the
[Workspace guidance policy](docs/development-guidelines.md#workspace-agent-guidance):
update relevant topics, help and examples; justify cross-cutting entry changes
and retain the generated AGENTS.md 4096-byte ceiling. Repository and generated
instructions serve different audiences.

## Review and handoff

Read the diff and acceptance criteria independently of the implementer's account.
Check correctness, boundaries, errors, atomicity and test value; prefer a separate
review session. Reuse applicable evidence and rerun checks for a concrete reason.
Follow the [review and handoff rules](docs/development-guidelines.md#independent-review-and-handoff)
for findings, increment outcome and consistent PR metadata.

Report changes, how to try them, checks actually run, platform and unresolved findings.
Follow [release rules](docs/development-guidelines.md#local-releases) when releasing;
implementation alone does not request a release.
