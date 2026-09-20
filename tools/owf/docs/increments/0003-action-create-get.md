# 0003 — Action creation and retrieval

> Status: completed
> Description: Create an Action through the CLI and retrieve it by stable ID.
> Depends on: [0002 — Project and Outcome creation](0002-project-outcome-creation.md).

The user reviewed and approved this design for implementation on 2026-09-20,
including the detailed contracts below. Implementation, independent review and required verification are complete.

## Goal and scope

A person or agent can create a directly executable Action and retrieve the
persisted object in a later CLI invocation. This establishes the first useful
Operational Store operation alongside the existing Markdown work contexts.

References:

- [Architecture](../architecture.md) and [development guidelines](../development-guidelines.md).
- [Core](../../../../spec/core-v0.md), sections 6.3, 6.4, 7, 9 and 16.
- [Operational Store design](../../../../docs/design/operational-store-notes.md), sections 4, 6, 8, 9.2, 11.3–11.5 and 12.3.
- [MVP scope](../../../../docs/design/mvp-scope.md).

Included: Action create/get, owner selection and validation, UUID identity,
timestamps, SQLite persistence and an atomic creation event, human/JSON output,
new-store initialization, and CLI/Workspace agent guidance.

Deferred: list/filter/search, updates, state/owner changes, dependencies, waiting
and manual blocking, archive, Inbox, screenshots, GUI/HTTP, OS URI registration,
stable Markdown IDs, schema migration/backward compatibility, concurrent-edit
conflict handling, and a history interface. No release or new dependency is
required. The broader MVP backup/restore capability remains future work.

## Proposed solution

### CLI and input

```text
owf create action --title "Zavolať dodávateľovi"
owf create action --title "Zavolať dodávateľovi" --owner /_projects/kitchen/
owf create action --title "Zavolať dodávateľovi" --owner / --description "Overiť termín dodania." --json
owf get action {id}
owf get action owf:action:{id} --json
```

Braced values are placeholders, not literal input. Both commands provide --help,
support --json, and run directly through the application without a server.

Create requires --title and accepts optional --description and --owner. Reuse
the existing trimmed, nonempty, single-line title policy. Description is literal
Markdown text and may contain newlines; preserve supplied text, including an
explicit empty string. Omit description from the result when it was not supplied.
There is no file/stdin input mode in this increment. Unknown options, including
--state or --slug, are rejected rather than ignored.

Repeated creation with the same title creates distinct Actions. There is no
title uniqueness rule, deduplication, or idempotency key.

### Workspace and owner selection

Discover the Workspace from the working directory and its ancestors using the
existing discovery rules. Never implicitly initialize or replace a store.

Select an owner in this order:

1. Explicit --owner, including / for this Workspace.
2. Nearest Project or Outcome in the physical working-directory ancestry.
3. This Workspace, represented as { url: "/" }, when no work context exists.

Reuse increment 0002's Workspace-rooted directory URL parsing, containment,
metadata and structural hierarchy validation. Explicit owners may be elsewhere
in the same Workspace and always override the invocation context. Plain
non-owner directories/documents can be traversed during inference. Malformed,
unreadable or disallowed nearest owner candidates cause an error; do not silently
fall back to a more distant owner or Workspace. Do not cross the Workspace
boundary. Invalid explicit owners never trigger inferred fallback.

Workspace is allowed. Project/Outcome owners must be active or parked; reject
completed/achieved, abandoned and archived owners. Also reject an ownership
chain containing a terminal or archived Project/Outcome, so a nominally active
child cannot bypass closure through an inconsistent hierarchy. Parked ancestry
is allowed and is not reactivated. Creation does not change Markdown objects or
their states, and an open Action under parked work does not imply active attention.

Store owner as MarkdownObjectReference with url only. Optional Markdown-ID
support and reference repair remain deferred; do not invent or copy an owner ID.

### Identity and persisted Action

Generate a UUID v4 through an ID-generation port, with a unique database key.
Use canonical lowercase hyphenated UUID text. The stable Action URI is
owf:action:{id}; it is interpreted within the discovered Workspace.

The created Action contains:

| Field       | Initial value                                 |
| ----------- | --------------------------------------------- |
| id          | Generated UUID v4.                            |
| title       | Validated title.                              |
| state       | open.                                         |
| owner       | Resolved reference with Workspace-rooted url. |
| description | Supplied Markdown text; absent if omitted.    |
| created_at  | Clock-supplied UTC ISO 8601 timestamp.        |
| updated_at  | Exactly the same timestamp as created_at.     |

The remaining optional Action fields are absent. In particular, do not store
blocked/executable flags or introduce lifecycle/dependency options. Use one
creation-time value for the object and its creation event. Domain code receives
ID/time values and does not access randomness or the clock itself.

### Retrieval

Get requires exactly one positional identifier: a UUID v4 or the same UUID
prefixed with owf:action:. Accept uppercase hexadecimal UUID characters and
normalize them to canonical lowercase. Reject malformed IDs, other URI types,
URI query/fragment additions, and extra arguments as INVALID_ARGUMENT.

Look up by ID across the current Workspace, independent of the current Project
or Outcome. Do not search other Workspaces. A syntactically valid ID with no
matching Action produces ACTION_NOT_FOUND.

Return the persisted Action without resolving its owner. A moved, missing,
unreadable, malformed or now-terminal Project/Outcome must not hide the Action
or prevent retrieval; return the stored owner reference unchanged. Normal root
Workspace discovery/configuration and store validation still apply.

Get is read-only: no timestamp update, event, schema modification, owner repair
or implicit initialization. An unavailable, unsupported or corrupt store is a
store error, never ACTION_NOT_FOUND. Malformed persisted Action data is an error,
not a partially populated successful response.

### SQLite schema and atomicity

Fresh init creates schema version "2" under the existing
owf-tool-operational format, including owf_metadata, Actions and the Operational
Event Log. Use parameterized SQL, explicit mapping and database constraints for
identity/required data. Keep the schema focused on this slice; future operations
may extend it. Table/column layout is an adapter implementation choice.

Only schema version "2" is supported after this increment. Recognized version
"1" and unknown newer versions produce UNSUPPORTED_STORE_VERSION through shared
store validation, including existing init/create project/create outcome paths.
There is no migration, compatibility read, automatic upgrade, deletion or reset.
A repeated init against an old store must fail without changing files or data.
Repeat init of a valid current-schema Workspace remains a preserving no-op.

Document that PoC users should initialize a fresh directory to try this version;
do not advise overwriting an old Workspace. Store schema version is independent
of profile version and package version. Update shared fixtures and current
README descriptions, while retaining older increment documents as history.

After input and owner validation, insert the Action and exactly one
action.created event in the same short SQLite transaction. The event records
at least its kind, Action ID and creation timestamp; a database-local event key
may distinguish rows. No actor identity or cross-log correlation is required.
Current Actions remain authoritative; this is not event sourcing.

If either insert or commit fails, return failure and preserve prior data with
neither new record persisted. An event-write failure is not a successful Action
creation with a warning. This differs intentionally from Markdown log warnings
in increment 0002 because both writes here share one transaction. Do not touch
root log.md, indexes or owner documents. No atomic snapshot across Markdown
validation and SQLite is promised; concurrent external edits remain outside scope.

### Results and errors

Both operations return the complete Action and its derived URI using the existing
envelope style. Success contract:

```text
{ ok: true, result: { status, type: "action", root, uri, action }, warnings: [] }
```

Status is created or found; root is the absolute native Workspace path, uri is
owf:action:{id}, and action contains the fields above. There is no fabricated
Markdown path for an Action. Human output exposes the same Action fields, makes
the selected owner visible, and includes the ID/URI for subsequent retrieval.

Errors use { ok: false, error: { code, message } }. Exit 0 means success;
invalid arguments/title use exit 2 (INVALID_ARGUMENT or INVALID_TITLE).
Operational errors use exit 1: ACTION_NOT_FOUND, INVALID_OWNER,
ACTION_CREATE_FAILED or ACTION_READ_FAILED, plus existing Workspace/store
diagnostics such as WORKSPACE_NOT_FOUND, STORE_UNAVAILABLE, INVALID_STORE and
UNSUPPORTED_STORE_VERSION where applicable. Include actionable explanations.

Reuse existing JSON argument-error handling: one JSON envelope without extra
stdout text, including parse failures. Diagnostics must not leak SQL internals.
Failed creation does not return a usable Action ID or claim success. A successful
create response returns the saved object without requiring a follow-up get.

### Layers and guidance

Follow the architecture: domain owns Action validation and permitted owner-state
rules; application coordinates discovery, Markdown lookup, IDs/time and repository
operations through focused ports. Infrastructure owns SQLite transactions,
mapping, UUID/clock adapters and Markdown parsing. CLI parses/renders and bootstrap
wires concrete implementations. Reuse owner discovery without changing Outcome
creation semantics or adding a generic persistence framework.

Update command help, tool README examples and the single-source Workspace
AGENTS.md renderer together. Explain create/get, owner precedence including /,
ID/URI input, --json, and the initial open state. Remove generated claims that
Action commands are unavailable. Verify examples from a built CLI outside the
repository. Existing user-edited guidance is never silently refreshed; current
schema repeat init retains its existing preserving behavior.

## Acceptance criteria

AC1: Title-only creation persists a valid open Action with UUID v4, equal
creation/update timestamps and the selected owner. A later invocation retrieves
the same data by either ID or URI. Same-title creations have distinct IDs.

AC2: Explicit owner wins over context; inference chooses the nearest valid
Project/Outcome, otherwise Workspace. Explicit / selects Workspace. Invalid
owners/ancestry and terminal ownership are rejected without writes; parked
ownership is accepted without changing parent state.

AC3: Optional multiline Markdown description round-trips literally, including
an explicit empty string. Omitted description remains absent. Invalid title,
ID/URI and unsupported options produce the specified diagnostics.

AC4: Get finds an Action outside its owner's current directory and after that
owner has moved/disappeared, returning the unchanged stored reference. Reads
preserve stored data and history. Missing ID and store failure are distinct.

AC5: Successful create commits one Action and one event. Failure during either
write or commit leaves neither persisted and preserves previous records;
Markdown files stay unchanged.

AC6: Fresh init creates schema 2. Old/newer unsupported schemas are rejected
without upgrade or writes, including by repeat init and existing creation
commands. Valid current-schema repeat init remains a no-op.

AC7: Human/JSON results, exit codes, CLI help, README and generated Workspace
guidance agree. Both operations work through the built CLI without a server.

Canonical executable domain journeys live in
[action-create-get.feature](../../tests/acceptance/features/action-create-get.feature):
standalone creation/retrieval (AC1), explicit parked ownership (AC2), and retrieval
after the owner disappears (AC4). Detailed persistence/failure coverage lives in
[actions.test.ts](../../tests/integration/actions.test.ts), identity/lifecycle
rules in [domain tests](../../src/domain/actions/actions.test.ts), and built CLI
contracts/examples in [cli.test.ts](../../tests/e2e/cli.test.ts).

## Verification plan

- Acceptance via the real application and isolated filesystem/SQLite for the
  three domain journeys above (AC1, AC2, AC4).
- Focused domain tests for new owner-state rules and any new identifier rules;
  reuse existing title/owner-path coverage rather than duplicating it (AC2–AC3).
- Integration for literal persistence, same-title identity, event atomicity with
  controlled failure, prior-data preservation, read-only access, and incompatible
  schema rejection (AC1, AC3–AC6). Exercise shared discovery and representative
  existing commands, without repeating every schema case at every entry point.
- A small built CLI process set for create-to-get across invocations, URI parsing,
  JSON/error envelopes, help and generated examples (AC7). Keep detailed domain
  combinations out of this suite.
- Run npm run verify before implementation handoff; report actual OS/runtime
  evidence and retain the documented Windows drive-letter workaround.

Each test must cover a distinct rule or failure risk. Do not mirror every
acceptance scenario across all test layers or target a test count.

Manual trial: initialize a fresh disposable Workspace, create a title-only Action,
copy its ID into get, retrieve via URI/JSON, then create an Action from an Outcome
directory and another with --owner /. Verify returned ownership and unchanged
Markdown. Try a well-formed unknown ID and inspect its diagnostic.

## Open questions

No blocking design questions remain. Scope, result/error contracts, identifier
normalization and description representation are approved. SQL layout and port
names are routine implementation choices.

## Implementation and review outcome

Implemented on 2026-09-20 in the existing increment branch and PR #8.

- Delivered direct CLI/application Action create/get, UUID v4 identity and URI
  normalization, literal optional descriptions, complete human/JSON output,
  and focused repository, ID and clock ports/adapters.
- Reused context owner discovery and hierarchy validation without changing
  Outcome creation semantics. Action-specific domain rules reject terminal or
  archived ancestry and permit parked ownership without Markdown mutation.
- Fresh stores use schema 2 with explicit Action/event tables. Action and event
  inserts share a short transaction; controlled Action-write, event-write and
  deferred-constraint COMMIT failures preserve prior data with neither new row.
  Unsupported schema 1/newer stores are rejected without writes by shared
  discovery, including existing init/context commands. No migration was added.
- Retrieval opens SQLite read-only, checks persisted data, and preserves owner
  references even after Markdown moves or becomes malformed/terminal. Missing
  Action and store failures remain distinct.
- CLI help, README and generated Workspace guidance include the new commands.
  Built CLI processes execute generated examples outside the repository using
  returned IDs, verify full JSON/human results, and reject unsupported options.
  Existing user-edited Workspace instructions remain untouched.

Final `npm run verify` passed on Windows, Node 24.21.0, npm 11.4.1:
types, lint, formatting, architecture (28 modules), build, 49 domain tests,
79 integration tests, 14 Cucumber scenarios / 76 steps, and 16 CLI process tests.
Tests ran from the uppercase-drive checkout path; the documented Windows
workaround remains in README. Sandbox process restrictions required running
process-based verification outside the sandbox. No Linux run was performed
for this increment. Final documentation-only outcome edits were format/diff
checked after the verified code revision.

Independent read-only review by GPT-6 Astra inspected the actual tracked and
new-file diff against AC1-AC7, architectural boundaries, failure behavior and
test value. Its README clarification (Markdown log warnings versus atomic
Action failure) was applied; no unresolved actionable findings remain. The
small final move of UUID/clock adapters into infrastructure was also reviewed
without findings. Main-agent inspection additionally corrected a delegated
JSON-envelope nesting defect before final verification.

Delegation: GPT-5.6 Luna implemented bounded CLI/help/contracts and README /
generated Workspace guidance edits, then corrected review feedback. The main
agent implemented domain rules, owner integration, SQLite, tests and final
integration. No implementation subagent recursively delegated.

No scope deviations, release or merge. Remaining limitations are the agreed
ones: no list/update/history interface, migration, stable Markdown IDs, owner
repair or concurrency snapshot across Markdown and SQLite. Use a fresh
directory for schema 2; do not overwrite an old Workspace.

## Decision changes and follow-up

- Automatic schema upgrade during create was considered and rejected: it is a
  hidden side effect, and this early PoC does not require backward compatibility.
  The earlier suggestion that get could treat schema 1 as empty was also replaced
  by uniform unsupported-version rejection.
- Creation permits parked owners but rejects terminal/archived ownership.
  Retrieval returns stored data even when the owner no longer resolves.
- List/filter and all mutation operations after create belong to later increments.
