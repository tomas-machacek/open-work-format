# 0004 — Action listing and direct-owner filtering

> Status: draft
> Description: List Actions in the current Workspace, optionally filtered by their stored direct owner.
> Depends on: [0003 — Action creation and retrieval](0003-action-create-get.md).

The user agreed to a small listing increment after 0003. This document records
the proposed interface and acceptance criteria for design review; implementation
has not started.

## Goal and scope

Allow a person or agent to discover Action IDs without keeping the create output
elsewhere, and to inspect the Actions directly owned by a Workspace, Project or
Outcome. The list is a projection of the same authoritative SQLite Actions read
by `get action`.

References: [architecture](../architecture.md),
[development guidelines](../development-guidelines.md),
[Core v0](../../../../spec/core-v0.md),
[Operational Store design](../../../../docs/design/operational-store-notes.md)
(especially Sections 11.2 and 13), and
[MVP scope](../../../../docs/design/mvp-scope.md).

Included: `owf list actions` with optional `--owner` and `--json`, direct-owner
filtering, stable display order, full Action records in JSON, human-readable
output, and updates to CLI help, tool README and generated Workspace AGENTS.md.

Deferred: filtering by state, title search, subtree/recursive owner queries,
pagination, sorting options, updates, state transitions, archive, and GUI/HTTP.
This increment does not change the SQLite schema, store version or Action
representation. No migrations, new dependencies or release are needed.

The current schema and Action type support only `open`. Thus listing all current
Actions also lists all non-archived Actions. The agreed future rule is that an
ordinary list excludes archived Actions, which become retrievable only by an
explicit request once archive/state support exists. This increment does not
invent an archived state or introduce an option that cannot yet be exercised.

## Proposed solution

### CLI and filter semantics

```text
owf list actions
owf list actions --owner /
owf list actions --owner /_projects/kitchen/
owf list actions --owner /_projects/kitchen/approved-design/ --json
```

Both words in `list actions` are literal; no Action ID is required.
Only `--owner` and `--json` are supported in this increment. Unknown options,
unexpected positional arguments and missing owner values are errors. Command
help describes the default scope and direct-owner behavior.

Without `--owner`, return every Action in the discovered Workspace, regardless
of the invocation directory. In particular, calling `list actions` inside a
Project does not implicitly restrict the result to that Project. With `--owner`,
return only Actions whose stored `owner.url` equals the requested Workspace-rooted
directory URL. `/` selects standalone Workspace-owned Actions. This is direct
ownership: a Project query does not include Actions owned by descendant
Outcomes. A valid owner filter with no matches succeeds with an empty list.

Parse the owner filter with the existing directory URL rules and canonicalize
it before matching, using the same URL representation as Action creation. Reject
invalid URL syntax as `INVALID_ARGUMENT` before discovery. Do not require the
owner's Markdown directory or README to exist, or validate its state: a stored
owner can move, disappear or become malformed, and a syntactically valid unknown
owner simply has no matches. Do not traverse ownership trees or mutate stored
references. Workspace discovery still validates the actual Workspace and its
store; damaged Project/Outcome context in the current directory does not block
this read, following the corrected behavior of increment 0003.

### Ordering and output

Return results newest first by `created_at`; break timestamp ties by canonical
Action ID in ascending order. This is stable presentation order, not priority,
planning order or execution order. Use the stored creation time, not file or
row order. No paging is needed for this local PoC; retain an extension path
without adding premature query machinery.

Successful JSON follows the current envelope style:

```text
{ ok: true, result: { status: "listed", type: "actions", root, actions: [...] }, warnings: [] }
```

`root` is the native absolute Workspace path. Each entry in `actions` has all
fields returned by `get action`, including the stable ID, stored owner and
timestamps; omitted optional fields remain omitted. A matched empty result is
`actions: []`, not an error or an unavailable store. The list is not required
to duplicate a derived URI for every Action; callers can use each ID with
`get action` or form `owf:action:{id}`.

Human output clearly displays each Action's title, ID, state and owner, in the
same order, with an unambiguous empty-list message. Multiline descriptions may
be omitted from this compact presentation; JSON contains them without loss.
Avoid conflating owner URL and native filesystem path.

### Storage, validation and errors

Add a focused list method to the existing Action repository/application API;
keep parameterized SQLite queries in the infrastructure adapter. Reuse `get`'s
Action row validation and preserve the same distinction between a valid empty
result and store failure. A malformed stored Action makes the list fail with a
clear read error, rather than returning a partial or silently filtered result.

Both filtered and unfiltered queries use read-only access. No timestamp, event,
Workspace file, schema or index changes occur. An unavailable, unsupported or
corrupt declared store retains the existing diagnostics. SQL/read or invalid-row
failures use `ACTION_READ_FAILED`, consistent with `get action`. CLI invalid
arguments use exit 2, other failures exit 1, and successful empty/nonempty lists
exit 0. With `--json`, emit one machine-readable success/error envelope and no
extra stdout diagnostics.

Preserve the current schema 2 and existing Workspace compatibility. Do not
initialize a store during a read or reinterpret an unavailable store as empty.
The application coordinates discovery and optional URL decoding via ports;
domain/application own query semantics; CLI only parses and renders results.

Update help, README examples and the single-source generated Workspace
AGENTS.md in the same change. Newly initialized Workspaces get the new guide;
existing user-edited guides stay untouched, and repeat init remains a no-op.

## Acceptance criteria

AC1: Listing from any directory inside a Workspace returns the same complete
set of persisted Actions, including their IDs, in stable newest-first order.
An empty Workspace returns a successful empty result. Repeated lists do not
change Workspace files or store content.

AC2: `--owner /` matches only Workspace-owned Actions. A Project or Outcome URL
matches its directly owned Actions, excluding children and other owners. A
syntactically valid filter with no matches returns an empty list.

AC3: Owner filtering works after the owner's Markdown directory moves,
disappears, becomes terminal or has malformed metadata. Malformed current
Project/Outcome context does not obstruct the read; malformed real Workspace
metadata still fails. Invalid owner URL syntax causes no writes and exit 2.

AC4: JSON yields the agreed complete envelope and Action fields; human output
identifies each result and explains emptiness. A damaged Action row or unavailable,
unsupported or corrupt store is an error, never a partial or falsely empty list.

AC5: The built CLI, help, README and generated Workspace guide agree and work
without a web server. Existing Action create/get and Project/Outcome creation
retain their behavior. No schema change or migration occurs.

Draft domain scenario (replace with canonical executable scenario links when
implemented):

```gherkin
Scenario: Find work by direct owner
  Given a Workspace with a standalone Action
  And a Project with its own Action and an Outcome with another Action
  When I list Actions owned directly by the Project
  Then the Project Action is included
  And the standalone and Outcome Actions are excluded
```

## Verification plan

- Acceptance via application API for direct-owner selection across Workspace,
  Project and Outcome; avoid repeating that entire journey in CLI tests (AC1–AC2).
- Focused integration checks on real SQLite for deterministic order including
  tied timestamps, empty list, literal optional fields, unchanged store and
  missing/invalid owner context. Reuse existing get-row corruption fixtures
  where practical (AC1–AC4).
- Small built-CLI process checks for `--owner`, empty and JSON/human results,
  invalid argument exit codes, and runnable generated examples (AC4–AC5).
- Run `npm run verify` before code handoff; record actual runtime/platform.
  Inspect test value and avoid duplicating every scenario across layers.

Manual trial: in a fresh schema 2 Workspace, create a Project and Outcome, then
create one Action owned by each of Workspace, Project and Outcome. Compare
`list actions`, `list actions --owner /`, and `list actions --owner
/_projects/kitchen/`; use a returned ID with `get action`. Try an empty
Workspace and a valid owner URL that has no Actions.

## Open questions

No blocking conceptual question. The exact CLI/envelope contract, stable order
and missing-owner filter behavior in this draft are proposed for review. State
filtering is deliberately reserved for the increment that introduces additional
Action states.

## Implementation and review outcome

Not implemented or independently reviewed. Record actual delivery, checks,
review findings and limitations here at handoff.

## Decision changes and follow-up

- 0003 postponed list/filter. This increment adds listing and direct-owner
  filtering, while state filters wait until non-open states can be persisted.
- Future state/archive support should explicitly preserve the ordinary-list
  exclusion of archived Actions agreed during the design discussion.
