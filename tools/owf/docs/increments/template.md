# NNNN — Increment title

> Status: draft
> Description: One sentence describing the resulting capability.
> Depends on: None, or links to required increments.

This is a template, not an agreed increment. Replace guidance with concrete
decisions and omit optional sections that add no value.

## Goal and scope

Explain the problem, the observable outcome, what is included and what is
explicitly deferred. Link relevant MVP/domain requirements rather than copying
them. For later features, identify any agreed expansion beyond the original MVP.

## Proposed solution

Describe affected layers/modules, operation flow, data or interface changes,
and failure behavior. Explain significant choices and alternatives only where
they help assess the design. Include migration/compatibility impact when relevant.
Reference the architecture; do not silently override it or prescribe every class.

## Acceptance criteria

List specific, observable criteria with stable labels such as AC1, AC2.
Use Gherkin for domain behavior; use concrete checks for tooling-only changes.

Before executable scenarios exist, a short Gherkin draft may live here.
Once implemented, link to the canonical .feature files and scenario names
instead of maintaining a second full copy. Preserve the agreed intent and
record substantive changes below.

## Verification plan

Map criteria and meaningful risks to suitable tests or manual checks.
Include important rejection/failure cases. Do not prescribe a test-count or
coverage target. State how the human can try the result.

## Open questions

List only decisions that remain unresolved. Resolve questions blocking this
increment before implementation; explicitly defer unrelated questions.

## Implementation and review outcome

Complete at handoff:

- What was delivered and any deviations from the proposal, with rationale.
- Acceptance/verification results, commands and platform actually used.
- Review findings and their resolution, or remaining limitations.
- Relevant implementation/review commit or PR links, when available.

Do not claim checks ran or review happened when they did not. Mark completed
only after implementation, review and the required verification are complete.

## Decision changes and follow-up

Record substantive changes to the agreed proposal without erasing its rationale.
Link later increments that extend or supersede this work. Record a release tag
only when actually released; completing an increment does not create a release.
