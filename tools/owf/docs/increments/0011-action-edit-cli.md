# 0011 — Edit Actions through the CLI

> Status: completed
> Description: Edit an Action's title, description, owner and waiting reason through one CLI operation.
> Depends on: [0005 — Action state changes](0005-action-state.md) and [0010 — Change Action state on the board](0010-board-action-state.md).

## Goal and scope

The user reviewed and approved this design for implementation on 2026-09-27.

Allow a person or agent to correct the content and ownership of an existing
Action without changing its identity or recreating it. Extend `owf set action`
so that state, waiting reason, title, description and owner can be changed
together in one valid, atomic update. The existing state-only command remains
valid. This increment is CLI only; board editing comes later.

References: [architecture](../architecture.md),
[development guidelines](../development-guidelines.md),
[MVP scope](../../../../docs/design/mvp-scope.md),
[Core v0](../../../../spec/core-v0.md),
[Operational Store design](../../../../docs/design/operational-store-notes.md),
[0003 Action creation](0003-action-create-get.md) and
[0005 state semantics](0005-action-state.md).

Deferred: board editing and an HTTP content-update route, archive, bulk edits,
search, and changes to Project/Outcome ownership or Markdown files. An Action's
owner is a stored Workspace-rooted reference; moving it does not move files.

## Proposed solution

### CLI semantics

```text
owf set action {id} --title "Zavolať dodávateľovi"
owf set action {id} --description "Overiť dátum dodania."
owf set action {id} --clear-description
owf set action {id} --owner /_projects/kitchen/
owf set action {id} --owner /
owf set action {id} --state waiting --waiting-for "Odpoveď dodávateľa"
owf set action {id} --clear-waiting-for
owf set action {id} --title "Napísať HR" --owner /_projects/hiring/ --state waiting --waiting-for "Odpoveď HR" --json
```

Accept the same UUID v4 or `owf:action:UUID` as `get action`. Make `--state`
optional, but require at least one change option. Omitted fields retain their
stored values; never infer a new owner from the current directory on an edit.
Apply all supplied options as one update, with no invalid intermediate Action.
Reject repeated scalar options and combinations of `--description` with
`--clear-description`, or `--waiting-for` with `--clear-waiting-for`.

`--title` uses the existing single-line, trimmed, nonempty title validation.
`--description` stores literal Markdown text, including newlines; an empty
string is allowed and is distinct from an absent description. Only
`--clear-description` removes the optional field. An unchanged supplied value
succeeds as a no-op. `--owner` must be an explicit Workspace-rooted directory
URL, including `/` for the Workspace; decode and canonicalize it with the
existing owner machinery, then validate the entire Project/Outcome chain and
its allowed states as on create. Reject a missing, malformed, archived or
terminal owner and cross-Workspace paths without changing the Action. Editing
other fields does not require the existing stored owner's Markdown path to
survive. Supplying an owner, even one equal to the stored URL, validates that
requested owner.

Retain 0005's state and reason rules: a supplied `--waiting-for` requires the
resulting state to be `waiting`; it may replace the reason while already
waiting. `--clear-waiting-for` removes the reason while remaining waiting;
leaving waiting also clears it. A clear request when the resulting state is
not waiting is invalid, except when `--state` explicitly leaves waiting in
the same command (where clearing is redundant and should be rejected to keep
one unambiguous form). Entering waiting without a reason remains allowed.
Title, description and owner can be edited in any state, including completed
and cancelled. No edit changes the owning context's state automatically.

Return the complete Action with `updated` for any persisted change, or
`unchanged` for an identical request. Preserve the existing `--json` envelope
and human-readable output. Update CLI help, tool README and the generated
Workspace AGENTS.md template with the new fundamental command and clear
options. Existing generated Workspace files are not rewritten.

### Persistence and errors

Keep `id` and `created_at` stable. For a real change, update `updated_at` once
and append exactly one operational event in the same transaction. A state or
waiting-reason change alone retains `action.state_changed`; an edit involving
title, description or owner uses a new `action.updated` event, including when
state/reason also changes. The event identifies the Action, time and changed
field names; record old/new state and waiting reason when they change, and old
and new owner URLs for an owner change. The Action row remains authoritative;
the event need not duplicate full title or Markdown description content.
Repeated identical requests write neither row nor event.

The current schema version 3 restricts event kinds, so version 4 must add the
new event shape and validate it on discovery. As in the PoC's earlier schema
changes, this increment does not migrate an existing version 3 Workspace:
discovery reports `UNSUPPORTED_STORE_VERSION` without modifying it. A newly
initialized Workspace uses version 4. The implementation handoff must give
clear steps for creating a fresh PoC Workspace; do not silently upgrade or
overwrite an existing store. Reconsider migration before relying on existing
user data beyond the PoC.

Generalize the existing SQLite change transaction rather than updating fields
with separate calls. Read and validate the current Action inside the write
transaction; use the current row's state, reason, title, description, owner and
timestamp in the conditional write to detect concurrent changes. Keep the
browser state endpoint's expected-snapshot conflict check inside that same
transaction. On missing ID, invalid input/owner, conflict, bad stored row or
failed write/event/commit, return the appropriate existing error category and
leave both Action and event unchanged. A normal read or list never writes.

## Acceptance criteria

AC1: `set action` changes any combination of title, description, owner,
state and waiting reason in one call, including on terminal Actions. Omitted
fields remain unchanged, ID and creation time remain stable, and the result
has one new update timestamp and one event for a real change.

AC2: `--owner /` selects the Workspace, and a valid Project or Outcome URL
selects that owner even from a different working directory. The full target
chain obeys create's validation. Bad/missing/terminal/archived owners fail
without a partial edit; editing content/state without an owner option still
works if the old owner Markdown directory is gone.

AC3: `--clear-description` removes the description; literal empty
`--description ""` stores an empty description. `--clear-waiting-for`
removes a reason while staying waiting, and existing state/reason transitions
remain valid. Invalid or contradictory options fail without changing data.

AC4: An identical request returns `unchanged` and preserves timestamp and
event count. A changed request returns `updated`, persists the complete Action
atomically with one appropriate event, and a failed event insert or conflict
rolls back the entire edit. State-only CLI and browser moves still behave as
before, including stale-card conflicts.

AC5: A fresh version 4 Workspace supports edits. A version 3 Workspace fails
discovery as unsupported without migration or mutation. CLI help, README and
new Workspace agent guidance accurately describe the operation; board editing
is absent.

## Verification plan

- Focused domain checks for partial edits, title/reason validation, clears,
  terminal-state editing and no-op behavior (AC1, AC3–AC4).
- CLI/integration checks for explicit owner root and sibling contexts, invalid
  owner chains, preserved stored owner with missing Markdown, combinations,
  JSON status and repeated/contradictory flags (AC1–AC3).
- SQLite checks for one transaction/event, event failure rollback, conditional
  write conflict and version 3 rejection without writes. Exercise browser
  state changes after content editing so stale snapshots cannot overwrite an
  edited Action (AC4–AC5).
- Keep browser tests limited to existing relevant journeys; no new Playwright
  journey is needed for a CLI-only change. Run `npm run verify` and record
  actual platform, revision and results before handoff.

Manual trial: initialize a fresh Workspace, create a Project and Action, change
title and description, move the Action to that Project and then `/`, clear its
description, set and clear a Waiting reason, and inspect `get action {id}` and
`list actions --owner ...` after each step.

## Open questions

No blocking questions. The reviewed version 4 boundary requires a fresh PoC
Workspace. If preserving existing version 3 data becomes necessary, agree an
explicit migration increment rather than silently upgrading stores.

## Implementation and review outcome

Implementation complete on 2026-09-27 in the PR #16 branch. `set action` now
supports combined edits and clears, explicit owner validation, one conditional
SQLite transaction and a single appropriate event. Fresh Workspaces use schema
4; schema 3 is rejected without mutation. CLI help, README and generated
Workspace guidance are updated.

On Linux with Node 24.19.0, `npm run verify` passed typecheck, lint, formatting,
architecture, build, 79 unit tests, 122 integration tests, 24 acceptance
scenarios and 21 CLI end-to-end tests. Its three browser Playwright scenarios
could not launch because the Chromium executable is absent in this environment.
The existing browser state integration tests, including stale snapshot checks,
passed. A fresh disposable PoC Workspace is required to try the new schema;
existing schema 3 stores are not migrated.

Independent review found that repeated clear flags were accepted, state-only
events omitted `changed_fields`, and schema discovery could mistake an unrelated
`action.updated` literal for support in the event kind constraint. These are
fixed with focused CLI, event and malformed-schema checks. A Windows Playwright
run exposed a race in the keyboard drag test: a pending viewport resize cancelled
the drag. The test now waits for the resize event before starting that drag.

On Windows with Node 24.21.0, `npm run verify` passed typecheck, lint,
formatting, architecture, build, 79 unit tests, 123 integration tests, 24
acceptance scenarios, 21 CLI end-to-end tests and all three Playwright browser
scenarios. The affected browser scenario also passed twice in a focused repeat
run. Review findings are fixed and the increment is completed after verification.
