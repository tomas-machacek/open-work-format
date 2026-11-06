# 0035 — Plain-text Inbox through the CLI

> Status: in_progress
> Description: Capture, inspect, edit and explicitly consume plain-text Inbox Items through the CLI.
> Depends on: [0001](0001-workspace-init.md), [0003](0003-action-create-get.md), [0029](0029-workspace-agent-guidance.md).

## Goal and scope

Capture unresolved input without first deciding whether it is executable work,
what its owner is, or what resulting objects it needs. A human or an external
agent can inspect and clarify that input, perform existing OWF operations, then
explicitly resolve or discard the Inbox Item.

This begins the Inbox stage deferred while Views were delivered. Semantics come
from [Core §10](../../../../spec/core-v0.md#10-inbox-and-capture) and the
[Operational Store contract](../../../../docs/design/operational-store-notes.md#111-inbox-operations);
the [MVP](../../../../docs/design/mvp-scope.md#capture-and-inbox) selects the scope.

Included: CLI capture, get, list, text replacement, resolve and discard;
persistence, atomic Operational Event Log writes and generated agent guidance.
Known executable work can still be created directly as an Action.

Deferred: browser/HTTP Inbox functionality, Markdown interpretation, URL detection
or extraction, separate URL fields, attachments/screenshots, search/filter
frameworks, bulk operations, automatic processing, conversion shortcuts,
result-link catalogues, undo and history browsing. Markdown support should be
considered later across relevant OWF content, not introduced only for Inbox.

## Proposed solution

### Content and identity

An Inbox Item has only `id`, `captured_at` and `text` as current object fields.
Use a generated Workspace-unique ID and the tool-supplied UTC capture time.
An item has no separate title, owner, capture context, lifecycle state, dependencies,
or processing/archive timestamp. Use the established ID-generation mechanism;
no new public Inbox URI scheme is introduced.

Text is required, accepts multiline Unicode input and must contain at least one
non-whitespace character. Validate blank input without trimming or rewriting
accepted content. Preserve supplied text, line breaks, whitespace, URLs and
Markdown-looking characters literally; do not parse or render them. Updating
text replaces the complete text and preserves ID and original capture time.
An identical replacement is a successful no-op without a semantic event.

The current Inbox contains all and only unresolved items. List oldest first by
`captured_at`, breaking ties deterministically by ID. Get returns full content;
JSON list results also contain full text, ID and capture time. Human list output
may show a compact single-line preview; this must not alter stored content.
Empty listing is successful. Missing, foreign-Workspace and consumed IDs fail
explicitly rather than succeeding as a repeated consumption.

### CLI contract

Use the existing Workspace discovery, command composition, error handling,
exit-code and JSON envelope conventions. Commands run without the web server.

| Command                             | Result                                                              |
| ----------------------------------- | ------------------------------------------------------------------- |
| `capture inbox --text "input"`      | Create an Inbox Item and return its identity and content.           |
| `get inbox ID`                      | Return one current item with full text and original capture time.   |
| `list inbox`                        | Return current items oldest first.                                  |
| `set inbox ID --text "replacement"` | Replace text while preserving identity and capture time.            |
| `resolve inbox ID`                  | Consume an item after the caller completed its intended processing. |
| `discard inbox ID`                  | Consume an item after an explicit decision to retain nothing.       |

All commands support `--json`. Writes return the established success envelope
with sufficient identity/result information to tell which operation completed.
JSON stdout remains machine-readable, diagnostics use stderr, and noninteractive
commands do not prompt. The explicit resolve/discard verb expresses the caller's
decision; neither command needs an additional confirmation flag.

`--text` accepts a literal argument, including multiline content supplied using
the invoking shell's normal quoting. File/stdin input modes and an interactive
editor are deferred. Help and examples must work on the supported Windows and
Linux shells without making Bash a runtime dependency.

### Processing and consumption

Processing is a caller-controlled sequence, not a conversion transaction:

1. Read and clarify an item.
2. Create or update the intended objects through existing commands.
3. Preserve any content that needs to survive in appropriate resulting objects.
4. Explicitly invoke resolve after all intended operations have succeeded.

Resolve accepts the caller's explicit assertion of completion. It does not infer
success from the existence of an Action, require an Action target, or attempt
to prove that arbitrary prior operations succeeded. An item may result in several
objects or updates to existing knowledge. CLI help must explain this responsibility.

Creating or editing other objects never consumes the item automatically. If a
later processing operation fails, earlier successful results remain and the item
stays available until an explicit resolve/discard succeeds. Discard needs no
resulting object. Both commands remove the current persistent item; resolved and
discarded are operation outcomes, not states or archived rows.

### Persistence, events and compatibility

Follow the [architecture](../architecture.md#execution-and-persistence):
pure Inbox rules in domain, use cases through application ports, SQLite persistence
in infrastructure and composition in bootstrap. Reuse runtime ID/clock adapters.
Inbox writes do not reconcile Action placement, inspect View definitions, or
modify Actions, Projects, Outcomes or Views.

Capture, changed text, resolution and discard each record a distinguishable
Operational Event Log entry in the same transaction as the current-data change.
Retain historical identity/events after consumption using the existing event
design, without retaining a live Inbox Item or treating the log as durable
knowledge storage. Reads and identical-text updates create no event. On validation,
storage or event-write failure, leave current data and events unchanged.

The current database is schema 9. Introduce schema 10 for Inbox storage and event
support, following the existing explicit schema-version validation. Initialize
new Workspaces with schema 10. Automatic migration, recreation of existing
databases and destructive resets are outside this increment. Existing schema-9
stores must fail with a clear version error without mutation, including repeat
initialization. Document this limitation and the paused-write backup requirement;
do not suggest deleting an operational database as an upgrade procedure.
A data-preserving migration path remains separate work.

### Documentation impact

During implementation, update tool README, CLI help/examples, code map and
architecture to describe delivered CLI Inbox support and schema 10, while
keeping browser Inbox and migrations clearly deferred.

Add a generated Workspace Inbox topic guide and a concise discovery link from
generated AGENTS.md: capture and consumption are new fundamental operations.
Keep details in the topic guide and retain the 4096-byte generated entry-point
ceiling. Include the explicit resolution responsibility, failure semantics and
literal-text contract. Do not overwrite user-edited guidance in existing
Workspaces or introduce a refresh mechanism.

This proposal aligns the MVP and Operational Store design with the agreed
single-text-field decision. It does not claim the runtime exists yet or change
Core semantics.

## Acceptance criteria

- **AC1 — Capture literal input:** A nonblank text-only capture creates a stable
  ID and original capture time without owner/context requirements. Multiline
  Unicode, whitespace, URLs and Markdown-looking input round-trip literally.
  Empty or whitespace-only capture is rejected without saved data/events.
- **AC2 — Read current Inbox:** Get returns a complete current item; list returns
  full JSON objects oldest first with deterministic tie ordering. Empty listing
  succeeds. Items remain isolated by Workspace; reads are write-free.
- **AC3 — Clarify without resetting age:** Text replacement preserves ID and
  capture time. Blank replacement fails without mutation; identical text is a
  successful no-op without an event.
- **AC4 — Explicit resolution:** Successful creation/update of resulting objects
  leaves the item unresolved until resolve is invoked. Resolve consumes the item
  and records the outcome. No Action-only target requirement is introduced.
- **AC5 — Discard:** Discard consumes an item without producing another object
  and records an outcome distinguishable from resolution.
- **AC6 — Failures preserve input:** A failed later processing operation leaves
  the item and earlier successful results intact. Failure during capture, edit
  or consumption, including event persistence, leaves no partial change.
- **AC7 — Consumption and isolation:** Consumed items are absent from current
  get/list results. Repeated consumption and unknown IDs return clear errors.
  Inbox operations do not change other work or View organization.
- **AC8 — CLI and compatibility:** Commands support help, human output, JSON and
  consistent exit codes without a running server. New schema-10 stores persist
  items across processes; unsupported stores fail without mutation.
- **AC9 — Discoverable guidance:** Generated guidance, help and examples explain
  capture, literal text and explicit resolution. Generated navigation is valid
  and AGENTS.md remains within its byte ceiling.

Canonical executable domain criteria are in
[Inbox acceptance scenarios](../../tests/acceptance/features/inbox.feature):

- Clarify a captured thought without resetting its age (AC3).
- Resolve only after explicit caller completion (AC4).
- Preserve input after incomplete processing (AC6).
- Discard input that needs no retained result (AC5).

## Verification plan

Use distinct tests for distinct risks, following the
[verification workflow](../verification.md):

- Domain/application: blank-input validation, literal text preservation,
  immutable capture identity/time, no-op update and explicit consumption.
- Real SQLite integration: ordering/ties, Workspace isolation, persistence across
  opens, consumption with retained events, transaction rollback on event failure,
  and byte/data preservation of an unsupported existing store.
- Acceptance: the observable processing scenarios above through real use cases.
  Include a concrete later-operation failure, not only a caller-side mock.
- Built CLI journeys: capture → get/list → edit → create an Action → resolve;
  discard, malformed/missing input and JSON/error output. Use representative
  multiline Unicode and URL/Markdown-looking text.
- Guidance checks: generated topic links, examples and AGENTS.md byte budget.
  Inspect the diff for accidental changes to Action/View behavior.

Before code handoff run full `npm run verify` on the final runtime revision and
record platform and actual results. No browser Inbox journey is required because
no browser feature is added.

Manual trial: initialize a disposable Workspace with the new CLI; capture a
thought, edit it, create an Action using existing commands and verify the item
still exists; resolve it and inspect the empty Inbox. Capture another item and
discard it. Do not use an existing operational Workspace for the schema trial.

For repository prose-only follow-ups, check formatting, relative links, scope
consistency and the final diff; retain applicable runtime evidence.

## Open questions

None blocking the proposed slice. Schema migration and richer content handling
are explicitly deferred.

## Implementation and review outcome

Approved for development on 2026-11-06; implementation is in progress.
The CLI/application/domain/SQLite paths, schema 10, generated Inbox topic and
executable acceptance/CLI/integration tests have been implemented. Human list
output includes full literal text, an allowed alternative to a preview. No scope
expansion or dependency change was needed. Final verification and independent
code review are pending; do not mark completed before both are satisfied.

## Decision changes and follow-up

The initial discussion considered a separate URL field and then Markdown input.
The agreed MVP uses one plain-text field. Links may occur literally within that
text; URL detection and Markdown support are deferred for a broader content
decision. Browser Inbox support is a subsequent increment.
