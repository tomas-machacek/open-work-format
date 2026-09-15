# OWF Tool Agent Instructions

These instructions apply under tools/owf/. Human supervision sets direction and
scope; AI agents implement and review changes.

## Read before work

- [Architecture](docs/architecture.md): structure, dependencies and technology choices.
- [Development guidelines](docs/development-guidelines.md): tests, lint, review and releases.
- [MVP scope](../../docs/design/mvp-scope.md): included and deferred capabilities.
- Relevant [Core specification](../../spec/core-v0.md) and
  [Operational Store design](../../docs/design/operational-store-notes.md) sections.

Follow the agreed increment and its acceptance criteria. The first increment
has not yet been agreed: current work is documentation only. Do not scaffold
implementation or executable configuration until that step is agreed.

## Implementation

Keep domain rules in the domain and orchestration in the application.
Respect public module boundaries. Do not add unrelated abstractions,
dependencies, refactors or features.
Develop meaningful tests alongside behavior; use the guidelines rather than
a test-count or coverage quota.
Distinguish mandatory rules, recommendations, examples and open decisions.
Report semantic conflicts rather than silently changing agreed requirements.

Run focused checks while working and the planned npm run verify before a code
handoff once that command exists. Never claim unavailable commands or unrun
tests succeeded. Do not weaken checks or acceptance criteria to obtain a pass.
Local validation is the current workflow; do not add GitHub Actions or automatic
release publishing without a new decision.

## Review and handoff

For review, read the diff and acceptance criteria independently of the
implementer's explanation. Check domain correctness, architecture, errors,
atomicity and test value. Prefer a separate review session.
Reuse applicable verification evidence; rerun checks for a concrete reason.

Report observable changes, how the human can try them, checks actually run,
platform, limitations and unresolved findings. Follow the development
guidelines for version commits/tags; a task to implement code does not itself
request a release.
