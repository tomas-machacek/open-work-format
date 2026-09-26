# 0007 — Action creation in a selected state

> Status: draft
> Description: Create an Action directly in any supported execution state through the CLI.
> Depends on: [0005 — Action state changes](0005-action-state.md).

## Goal and scope

Allow a person or agent to create an Action already in the state that describes
it. In particular, a Waiting Action should not briefly exist as Open or require
a second command. The default remains Open for existing creation commands.
The read-only board from [0006](0006-read-only-action-board.md) will display the
new Action in its selected column on refresh.

References: [architecture](../architecture.md),
[development guidelines](../development-guidelines.md),
[0003 creation rules](0003-action-create-get.md),
[0005 state rules](0005-action-state.md),
[MVP scope](../../../../docs/design/mvp-scope.md),
[Core v0](../../../../spec/core-v0.md) and
[Operational Store design](../../../../docs/design/operational-store-notes.md).

Included: CLI options, shared application/domain validation, persistence of the
initial state and optional waiting reason, one correlated creation event, and
updated help and generated Workspace guidance.

Deferred: creating through the browser or HTTP, owner selection in the browser,
changing an existing Action, archiving, migrations and any board interaction.
The later board creation increment should call this same application operation;
it should not compose create and set-state calls.

## Proposed solution

### CLI contract

```text
owf create action --title "Zavolať dodávateľovi"
owf create action --title "Pripraviť podklady" --state in_progress
owf create action --title "Počkať na HR" --state waiting --waiting-for "odpoveď HR"
owf create action --title "Hotový telefonát" --state completed --owner / --json
```

`--state` accepts exactly one of `open`, `in_progress`, `waiting`, `completed`
and `cancelled`. It is optional and defaults to `open`. Direct creation in
terminal states is allowed, for example to record work already completed or
cancelled; it does not change the owning Project or Outcome. Reject an unknown
state, `archived`, and a comma-separated or repeated state option. Continue to
accept the existing `--title`, `--owner`, `--description` and `--json` options
with their current meaning and owner validation.

`--waiting-for` is optional only when the initial state is `waiting`, and is
invalid with other states, including implicit `open`. If supplied, it must
contain non-whitespace text; store it verbatim. Waiting without a reason is
valid, as for `owf set action --state waiting`. Reuse the state and waiting
validation from 0005 rather than establishing a separate creation rule.

The successful human and JSON outputs show the persisted initial state and
waiting reason when present, retaining the current create result envelope and
`status: "created"`. Invalid arguments report `INVALID_ARGUMENT` with no
Action or event created.

### Single creation operation

Construct the Action with the selected state and optional `waiting_for` before
writing it. Use one ID and one clock value; `created_at` and `updated_at` are
equal. Save the Action and exactly one `action.created` event in the existing
transaction. Include the initial state and waiting reason, when present, in the
creation event's existing new-value fields so the event describes what was
created. Do not emit `action.state_changed` or expose an intermediate Open
Action. Extend the existing Action INSERT to persist `waiting_for`; the schema
3 column and its constraint already support it.

Keep creation's owner resolution, ID generation and error behavior. A failed
validation or write must leave neither an Action nor an event. This increment
does not change the schema version, existing records or previously written
creation events. `get action`, `list actions` and the board read the stored
initial state through their existing paths; CLI creation works without a
running server.

Update command help, the tool README and the single source of generated
Workspace AGENTS.md guidance. Do not rewrite existing user-owned guides.

## Acceptance criteria

AC1: With no `--state`, creation still produces an Open Action. Each of the
five supported explicit states can be created directly and is returned by
`get` and `list` in that state, including terminal states. Owner and
description behavior is unchanged.

AC2: A Waiting Action can be created with or without `--waiting-for`. A
nonblank supplied reason is preserved literally and returned by `get`, list
and JSON output. A reason with any other state, a blank reason or an invalid
state is rejected without a write.

AC3: Each successful invocation persists exactly one Action and one matching
`action.created` event containing its initial state and optional reason. The
timestamps agree, and no `action.state_changed` event or intermediate Open
record is produced. An Action insert, event insert or commit failure rolls back
both.

AC4: Help, README and generated Workspace guidance document the options and
working examples. Old creation syntax and CLI independence from the server
remain intact. A running board shows a newly created Action in the selected
column after its existing refresh behavior; this increment adds no write UI.

## Verification plan

- Domain and application checks cover default and explicit initial states,
  Waiting reason rules, literal preservation and invalid combinations (AC1–AC2).
- SQLite integration checks stored state/reason, creation event values and
  rollback if either insert fails (AC2–AC3). Reuse existing creation fixtures;
  avoid repeating the full state matrix at every test layer.
- Focused built-CLI checks cover help, human/JSON output, existing options and
  representative invalid arguments; check examples in generated guidance
  (AC1–AC4). One manual board refresh with a CLI-created Waiting Action is
  enough; no new Playwright journey is needed for a CLI-only increment.
- Run `npm run verify` before handoff and record the actual revision, platform
  and results (AC4).

Manual trial: create a fresh Workspace, run the Waiting example, retrieve its
ID with `owf get action`, and check that `owf list actions --state waiting`
contains it. If serving the Workspace, return to the board to see it in the
Waiting column.

## Open questions for review

No blocking question. This draft applies the existing five-state and
`waiting_for` rules to initial creation. The browser form and its owner
selection belong to the next increment.

## Implementation and review outcome

Pending implementation and review.
