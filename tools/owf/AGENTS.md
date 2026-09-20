# OWF Tool Agent Instructions

These instructions apply under tools/owf/. Human supervision sets direction and
scope; AI agents implement and review changes.

## Read before work

- [Architecture](docs/architecture.md): structure, dependencies and technology choices.
- [Development guidelines](docs/development-guidelines.md): tests, lint, review and releases.
- [Increment index](docs/increments/README.md) and the agreed document for the current increment.
- [MVP scope](../../docs/design/mvp-scope.md): included and deferred capabilities.
- Relevant [Core specification](../../spec/core-v0.md) and
  [Operational Store design](../../docs/design/operational-store-notes.md) sections.

Use the increment document as the implementation and review brief. Keep its
status and index row current and record the actual outcome, verification and
review evidence at completion. Existing conversational agreement does not need
to be requested again just to update the document.

Follow the agreed increment and its acceptance criteria. The first increment is approved and in progress. Keep it in_progress until independent code review has completed.

## Implementation

Keep domain rules in the domain and orchestration in the application.
Respect public module boundaries. Do not add unrelated abstractions,
dependencies, refactors or features.
Develop meaningful tests alongside behavior; use the guidelines rather than
a test-count or coverage quota.
Apply the guidelines' boundary and verification discipline: preserve URL/path
semantics, derive changing expectations from their source, and validate new gates
with forbidden examples.
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

Keep PR metadata and increment outcome consistent with the actual changes.
Turn review findings into proportionate fixes, tests and reusable guidance as
specified in the development guidelines.

Report observable changes, how the human can try them, checks actually run,
platform, limitations and unresolved findings. Follow the development
guidelines for version commits/tags; a task to implement code does not itself
request a release.
