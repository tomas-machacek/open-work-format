# 0004 — Action listing and owner filtering

> Status: in_progress
> Description: List Actions in the current Workspace, optionally filtered by direct owner or a stored owner subtree.
> Depends on: [0003 — Action creation and retrieval](0003-action-create-get.md).

The user reviewed and approved this design for implementation on 2026-09-23.
Implementation is in progress; independent implementation review is pending.

## Goal and scope

Allow a person or agent to discover Action IDs without keeping the create output
elsewhere, inspect work directly owned by a Workspace, Project or Outcome, and
see all work beneath a chosen Project or Outcome. The list is a projection of
the same authoritative SQLite Actions read by `get action`.

References: [architecture](../architecture.md),
[development guidelines](../development-guidelines.md),
[Core v0](../../../../spec/core-v0.md),
[Operational Store design](../../../../docs/design/operational-store-notes.md)
(especially Sections 11.2 and 13), and
[MVP scope](../../../../docs/design/mvp-scope.md).

Included: `owf list actions` with optional `--owner`, `--recursive` and `--json`,
direct-owner and descendant-owner filtering, stable display order, full Action
records in JSON, human-readable output, and updates to CLI help, tool README
and generated Workspace AGENTS.md.

Deferred: filtering by state, title search, pagination, sorting options, updates,
state transitions, archive, and GUI/HTTP.
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
owf list actions --owner /_projects/kitchen/ --recursive
owf list actions --owner /_projects/kitchen/approved-design/ --json
```

Both words in `list actions` are literal; no Action ID is required.
Only `--owner`, `--recursive` and `--json` are supported in this increment.
`--recursive` requires `--owner`; without it, report `INVALID_ARGUMENT` rather
than silently treating the option as a request for the full Workspace. Unknown
options, unexpected positional arguments and missing owner values are errors.
Command help describes the default scope and both owner filter modes.

Without `--owner`, return every Action in the discovered Workspace, regardless
of the invocation directory. In particular, calling `list actions` inside a
Project does not implicitly restrict the result to that Project. With `--owner`
alone, return only Actions whose stored `owner.url` equals the requested
Workspace-rooted directory URL. `/` selects standalone Workspace-owned Actions.
This is direct ownership: a Project query does not include Actions owned by
descendant Outcomes.

With `--owner` and `--recursive`, include both directly owned Actions and those
whose stored owner URL lies beneath the requested directory URL. For a Project,
that includes Actions of nested Outcomes at any depth, but not a sibling Project.
For an Outcome, it includes its own Actions and those of descendant Outcomes.
`--owner / --recursive` covers the entire Workspace. A valid owner filter with
no matches succeeds with an empty list.

Parse the owner filter with the existing directory URL rules and canonicalize
it before matching, using the same URL representation as Action creation. Reject
invalid URL syntax as `INVALID_ARGUMENT` before discovery. Do not require the
owner's Markdown directory or README to exist, or validate its state: a stored
owner can move, disappear or become malformed, and a syntactically valid unknown
owner simply has no matches. Recursive matching is over canonical, slash-terminated
stored owner URLs. Compare complete path segments: `/_projects/kitchen/` includes
`/_projects/kitchen/design/`, but not `/_projects/kitchenette/`. Treat URL text
literally, including percent-encoded segments; `%` and `_` are not SQL wildcards.
Do not traverse current Markdown ownership trees or mutate stored references.
A moved Outcome whose Action references still contain the old URL continues to
appear beneath the old URL prefix until those references are explicitly repaired
in a future operation. This matches the path-based ownership model rather than
guessing a new owner from incidental filesystem state. Workspace discovery still
validates the actual Workspace and its store; damaged Project/Outcome context in
the current directory does not block this read, following increment 0003.

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
keep parameterized SQLite queries in the infrastructure adapter. Implement
recursive filtering with literal, slash-bounded URL prefix comparisons rather
than unescaped SQL `LIKE` patterns. Reuse `get`'s
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
without `--recursive` matches its directly owned Actions, excluding children
and other owners. With `--recursive`, it includes all descendant Outcome owners
at any depth, while excluding sibling path prefixes. `%` and `_` in URLs are
literal text, not wildcards. `--recursive` without `--owner` is an argument
error. A syntactically valid filter with no matches returns an empty list.

AC3: Both owner filters use stored references even after the owner's Markdown
directory moves, disappears, becomes terminal or has malformed metadata. A
stale reference stays under its stored URL prefix, not an inferred new path.
Malformed current Project/Outcome context does not obstruct the read; malformed
real Workspace metadata still fails. Invalid owner URL syntax causes no writes
and exit 2.

AC4: JSON yields the agreed complete envelope and Action fields; human output
identifies each result and explains emptiness. A damaged Action row or unavailable,
unsupported or corrupt store is an error, never a partial or falsely empty list.

AC5: The built CLI, help, README and generated Workspace guide agree and work
without a web server. Existing Action create/get and Project/Outcome creation
retain their behavior. No schema change or migration occurs.

Canonical executable criteria: [Action listing scenarios](../../tests/acceptance/features/action-list.feature)
cover Workspace-wide, direct-owner and recursive selection from a deeply nested
Outcome, including the sibling-prefix boundary.

## Verification plan

- Acceptance via application API for direct and recursive selection across
  Workspace, Project and nested Outcomes; avoid repeating those entire journeys
  in CLI tests (AC1–AC2).
- Focused integration checks on real SQLite for deterministic order including
  tied timestamps, empty list, literal optional fields, unchanged store,
  missing/invalid owner context, path-prefix boundaries and literal `%`/`_`
  matching. Reuse existing get-row corruption fixtures where practical (AC1–AC4).
- Small built-CLI process checks for `--owner`, `--recursive`, empty and
  JSON/human results, invalid argument exit codes, and runnable generated
  examples (AC4–AC5).
- Run `npm run verify` before code handoff; record actual runtime/platform.
  Inspect test value and avoid duplicating every scenario across layers.

Manual trial: in a fresh schema 2 Workspace, create a Project and Outcome, then
create one Action owned by each of Workspace, Project and Outcome. Compare
`list actions`, `list actions --owner /`, `list actions --owner
/_projects/kitchen/`, and the same owner with `--recursive`; use a returned ID
with `get action`. Try an empty Workspace and a valid owner URL that has no
Actions.

## Open questions

No blocking design questions remain. The CLI/envelope contract, stable order,
literal stored-prefix matching and missing-owner filter behavior are approved.
State filtering is reserved for the increment that introduces additional Action
states.

## Implementation and review outcome

Implemented `list actions` through the existing application, repository and CLI
layers. Owner filters use the existing URL decoder and canonical encoder before
Workspace discovery. SQLite uses parameterized equality or literal `substr`
prefix comparison and stable `created_at DESC, id ASC` ordering. Returned rows
reuse get's validation. Reads open the store read-only and do not resolve or
repair Markdown owner references.

CLI help, README and the single Workspace guide template include listing.
Existing user guides and repeat-init behavior are preserved. Acceptance scenarios
cover ownership semantics; integration tests cover ordering, full records,
literal URL characters, stale/damaged context, empty results, error distinctions
and byte-for-byte preservation. Built-CLI checks cover rendering, argument errors
and generated examples without duplicating the ownership matrix.

Verification on 2026-09-23: `npm run verify` passed on exact implementation/test
commit `f4c361576c752f9ad4ab7d212d09702e01f315a6`, with a clean working tree,
on Windows x64 (`win32`), Node.js `v24.21.0`, npm `11.4.1`. Typecheck, lint,
formatting, architecture and build passed; 49 unit tests, 89 integration tests,
21 acceptance scenarios (104 steps), and 17 built-CLI tests passed. Generated
guide examples executed through the built CLI. `git diff --check` also passed.
Earlier verify attempts exposed index formatting and a CLI scenario timeout;
formatting was corrected and listing was separated from the create/get scenario
without changing the timeout or dropping assertions. The final full run passed.
This subsequent evidence update changes documentation only; it does not claim
the full suite ran on the evidence commit. Linux and manual OS integration were
not tested. No independent review has yet been performed.

Independent review is pending; status remains `in_progress`. No schema change,
migration, new dependency, state filter, release or merge is included.

## Decision changes and follow-up

- 0003 postponed list/filter. This increment adds listing and direct-owner and
  recursive stored-owner filtering, while state filters wait until non-open
  states can be persisted.
- Future state/archive support should explicitly preserve the ordinary-list
  exclusion of archived Actions agreed during the design discussion.
