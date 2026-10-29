# 0027 — Delete Actions and View instances through CLI

> Status: in_progress
> Description: Permanently delete Actions and View instances through CLI while preserving dependency integrity, unrelated work and historical events.
> Depends on: [0017 — CLI Action blocking and dependencies](0017-action-blocking-cli.md), [0020 — View instance CLI foundation](0020-view-instance-cli-foundation.md) and [0024 — Persist and change View column order through CLI](0024-view-order-cli.md).

Scope and behavior agreed on 2026-10-29. The user reviewed and approved this
document for implementation on 2026-10-29. Implementation started on 2026-10-29;
independent code review remains pending.

## Goal and scope

Allow a human or agent to remove an unwanted Action or stored View instance
without editing SQLite directly. Deliver two noninteractive CLI commands using
the existing Workspace discovery, identifiers, output conventions and shared
application/domain architecture.

Action deletion is permanent removal from current operational data, not a state
transition, completion, cancellation or archival. It is an agreed addition to the
original [MVP Action operations](../../../../docs/design/mvp-scope.md).
View deletion follows the existing
[Operational Store contract](../../../../docs/design/operational-store-notes.md#93-viewinstance):
an instance owns its organization data, not its Actions or shared definition.

References: [architecture](../architecture.md),
[development guidelines](../development-guidelines.md),
[Core relationships and Views](../../../../spec/core-v0.md),
[View movement](0023-view-move-cli.md) and
[View ordering](0024-view-order-cli.md).

Included:

- Delete one Action in any currently supported execution state.
- Reject deletion when another Action declares a dependency on the target.
- Remove the deleted Action's outgoing dependencies and organization data in
  every View, preserving the relative order of all remaining cards.
- Delete one View instance and its own placement/order data.
- Atomic deletion and Operational Event Log recording, CLI help, JSON output,
  examples and generated Workspace guidance.

Deferred: web deletion controls/endpoints, bulk deletion, undo, trash,
soft deletion, force/cascade deletion of dependents, Action archival, Outcome
dependencies, Markdown reference scanning/rewriting, attachment cleanup,
Snapshot support, migration tooling and releases. This increment does not add
a confirmation prompt or a required confirmation flag.

## Proposed solution

### CLI contract

```sh
owf delete action ACTION_ID
owf delete action owf:action:ACTION_ID --json
owf delete view VIEW_ID
owf delete view VIEW_ID --json
```

Use the existing UUID/Action URI normalization for Action selectors and existing
View instance UUID validation. Titles and Markdown definition paths are not
selectors. Each invocation deletes exactly one object in the discovered Workspace,
including when invoked from a descendant directory, without requiring a web server.

Commands execute without interactive confirmation. Help and operational guidance
must describe permanent deletion and the dependency guard. No `--force` bypass
is introduced.

Success uses exit 0. Human output identifies the deleted object by type, ID and
title. JSON uses the existing envelope:

```json
{
  "ok": true,
  "result": {
    "status": "deleted",
    "type": "action",
    "root": "/absolute/workspace/path",
    "id": "ACTION_ID",
    "title": "Deleted Action title",
    "uri": "owf:action:ACTION_ID"
  },
  "warnings": []
}
```

For View deletion, `type` is `view`, with the instance ID and title and no
Action `uri`. This is a deletion receipt, not a live object projection.

Malformed arguments/selectors exit 2 using the existing invalid-argument
convention. A well-formed absent ID fails with `ACTION_NOT_FOUND` or
`VIEW_NOT_FOUND`, exit 1, including a second deletion of the same ID.
No success event is appended for an absent target.

When another Action references the target, fail with `ACTION_IN_USE`, exit 1.
The error message lists the referring Actions' canonical URIs and titles in
stable ID order, in both human output and the existing JSON error envelope.
Explain that those dependencies must first be explicitly removed or redirected.
Do not silently remove them. Store availability/version errors retain their
existing diagnostics. Other transactional deletion failures use
`ACTION_DELETE_FAILED` or `VIEW_DELETE_FAILED`, exit 1.

### Action deletion and dependency integrity

Look up the target and check incoming Action dependencies inside the same store
write transaction as deletion. Every other referring Action prevents deletion,
regardless of either Action's state, owner, View membership or whether the
dependency is currently satisfied. A completed prerequisite is still referenced;
deletion must not silently change the meaning of another Action's prerequisites.

The target's own outgoing edges do not prevent deletion. This includes a
self-dependency: its source disappears with the target, so it leaves no surviving
dangling edge. A cycle involving another Action does prevent deletion until
the incoming edge is explicitly removed.

On success, remove:

- the target Action's current record, including its stored optional fields;
- every outgoing dependency declared by that Action;
- every placement and order entry for that Action across all View instances.

Preserve all surviving Actions, including their states, timestamps, dependencies
and manual blocks. Preserve View instance identities, definitions and placements
of surviving cards. Close any stored rank gaps as required by the existing order
invariants, preserving surviving relative order; displayed positions are dense
and one-based.

Deletion needs stored relations, not routing evaluation: removing this Action
cannot change another Action's dependency facts because incoming edges from
surviving Actions are forbidden. Do not reroute unrelated cards or require View
definitions merely to remove the target's stored placement/order entries.
A missing, invalid or ID-mismatched definition must not prevent this cleanup.
Likewise, deletion does not require resolving the Action's Markdown owner.
This is scoped deletion, not general repair of corrupt operational data.

The guard covers the currently supported Action-to-Action dependency model.
Do not implement Outcome dependencies or promise automatic cleanup of arbitrary
Markdown links. Existing historical events may retain the deleted identity.
Future support for new authoritative current references must extend deletion
integrity checks before those references can be safely used.

### View instance deletion

Delete only the selected instance and all placement/order records belonging to
it. Do not delete or modify any Action, Action dependency, shared Markdown
definition, other View instance or that other instance's organization.

Resolve the target by its stored ID without loading or validating its definition.
Deletion must work when that definition is missing, malformed or has a mismatched
stable ID. Never write Markdown or navigation indexes as part of deletion.

Default Kanban is a built-in projection, not a stored instance. It has no
deletable View ID. No special delete command or behavior is introduced for it.

### Atomicity and history

Use shared application operations, domain rules and store ports; CLI adapters
only validate transport arguments and render results. Preserve the existing
architecture boundaries.

Action deletion, outgoing-edge cleanup, all affected placement/order cleanup
and all corresponding events must commit together or roll back together.
View deletion, its placement/order cleanup and its event have the same guarantee.
An event write failure must not leave an object deleted without its event.

Append exactly one `action.deleted` or `view.deleted` event for the deleted
object, carrying its identity, title and deletion time through the existing
event conventions. For Action deletion, retain existing View organization-event
conventions for changed placements/order: record actual changes atomically,
without inventing an Action update or a user move for each shifted rank.
For View deletion, the `view.deleted` event represents removal of its owned
organization; do not emit per-card move/delete events.

Keep all pre-existing Operational Event Log entries, including events referring
to the deleted object or instance. Events are historical evidence, not current
foreign-key references that block deletion or cascade away with the object.
No tombstone, resurrection or event-sourced restoration is introduced.

Prefer the existing schema where it can support these rules. If a constraint
change requires a schema increment, document the actual compatibility impact
and retain the existing explicit unsupported-version policy. Do not silently
migrate, reset or replace user stores.

### Documentation and existing web behavior

During implementation update CLI help, tool README/examples and the generated
Workspace AGENTS.md template. Existing user-edited Workspace guides must not
be overwritten or silently backfilled. Align the operational operation catalogue
with the delivered deletion capability without claiming deferred functionality.

Existing browser refreshes must reflect CLI-deleted Actions and View inventory
through existing reads. A deleted selected View uses the existing disappeared-
instance error behavior; do not add a new navigation policy. Existing missing-
Action responses must remain intact. No browser deletion workflow is included.

## Acceptance criteria

AC1: From the Workspace root or a descendant directory, both commands delete
the selected object without a web server or prompt. Human and JSON receipts
identify the same deleted object; Action UUID and URI selectors are equivalent.

AC2: An Action can be deleted in each currently supported execution state.
Subsequent get returns ACTION_NOT_FOUND and lists/evaluated Views omit it.
Outgoing dependencies and all its placement/order rows disappear; surviving
cards retain relative order and expose consecutive positions.

AC3: Any dependency from another Action rejects deletion with ACTION_IN_USE
and identifies the referring Actions, including when the target is completed,
the source is terminal, or the source belongs to another owner. Action data,
dependencies, View organization and event history remain unchanged.

AC4: Outgoing dependencies alone and a self-dependency do not prevent deletion.
A cycle with another Action is rejected. Explicitly removing the incoming edge
allows deletion when no other referring Action remains.

AC5: Action cleanup succeeds with an unavailable Markdown owner or broken View
definition, removes only the target's organization records and required rank
gaps, and preserves unrelated instances and cards without routing repair.

AC6: Deleting a populated View removes its instance, placements and order while
preserving Actions, dependencies, shared definition files and another instance
using that same definition, including that instance's independent card order.

AC7: View deletion succeeds for missing, invalid and ID-mismatched definitions.
Default Kanban remains available; a definition path/title is not accepted as a
View instance selector.

AC8: Successful deletion appends its deletion event once, retains old historical
events and commits all related changes atomically. A forced persistence/event
failure rolls back the entire operation, including cleanup and any new events.

AC9: Invalid selectors and absent IDs return the agreed errors and exit codes
without mutation. Repeated deletion returns not-found and creates no extra event.
Unavailable/unsupported stores fail explicitly and are not replaced.

AC10: CLI help, JSON output, examples and newly generated Workspace guidance
describe permanent deletion, reference rejection and instance-only View deletion.
Existing guides are preserved. Existing web reads/refresh and missing-object
handling remain compatible with CLI deletion.

## Verification plan

- Acceptance scenarios through the real application and isolated Workspaces
  cover Action deletion, incoming-reference rejection, explicit dependency
  removal and instance-only View deletion (AC2–AC4, AC6).
- Focused domain/application tests cover the reference guard, self/cyclic edges
  and error behavior where not already established by acceptance tests.
- Real SQLite integration tests cover multi-instance cleanup, dense remaining
  order, historical event retention and injected write/event failure rollback
  (AC2, AC5–AC9). Verify absence of dangling current rows directly, not only
  their omission from rendered results.
- Test deletion with broken definitions and unavailable owners to establish
  that no unnecessary Markdown resolution blocks the operation.
- A small set of built CLI-process journeys verifies parsing, UUID/URI selectors,
  descendant discovery, noninteractive execution, JSON receipts, errors and
  exit codes (AC1, AC9–AC10).
- Reuse existing web missing-object/refresh coverage; add focused regression
  coverage only if actual CLI deletion exposes a gap. No new browser controls
  or broad UI test matrix is required.
- Check generated guidance and command examples against the implemented CLI.
- Run `npm run verify` before implementation handoff and record actual revision,
  platform and results. Do not claim Windows verification from another platform.

Human try-out in a disposable Workspace: create a prerequisite and a dependent,
attempt to delete the prerequisite and inspect the rejection; remove the
dependency and delete again. Place another Action among cards in two Views,
delete it and inspect retained order. Delete one populated View and confirm
that the remaining instance and Actions still exist. Repeat with a broken
definition to check that the instance can still be removed.

## Open questions

No blocking scope decisions remain. Exact internal port/type structure and any
necessary schema change are implementation choices within this contract.

## Implementation and review outcome

Implemented on 2026-10-29 in revision
`fd07eb7ac76c7545238ace16b088e1ab09f5a9c2` on
`increment-0027-delete-action-view-cli`, in existing [PR #33](https://github.com/tomas-machacek/open-work-format/pull/33).
The branch was clean and `git pull --ff-only` reported it up to date before work.
Increment and index remain `in_progress`: independent code review has not yet
been performed. No merge, release or version/tag change is included.

Delivered both noninteractive commands and human/JSON deletion receipts, shared
application operations and domain rules. The Action reference guard runs inside
the same SQLite write transaction as cleanup and deletion, identifies referring
Actions in stable ID order, and covers terminal and cross-owner sources.
Outgoing/self edges disappear with the source. Stored placements/order are
removed across instances, with affected ranks made dense and surviving order
retained, without resolving Markdown owners, loading definitions or rerouting
unrelated cards. View deletion removes only its instance and organization.
Deletion events include ID, title and time; all historical events remain.
Cleanup, deletion and new events commit or roll back together.

CLI help, README, the [walkthrough](../examples/deletion.md), generated Workspace
guide, architecture, MVP addition and operational operation catalogue now describe
the delivered behavior. Existing Workspace guides are preserved. Existing HTTP
reads and missing-object responses remain compatible; no web deletion endpoint
or control was added.

No scope or behavior deviations were necessary. Schema **9** was required because
schema 8's event foreign keys prohibited deleting identities retained by history.
The new schema removes foreign keys only from historical Action/View event
identities (including View events' Action references), adds deletion event kinds
and title fields, and retains foreign keys on current placements/order. New
Workspaces use schema 9; all other versions, including schema 8, are explicitly
rejected without migration, reset or replacement.

Executable evidence:

- [Acceptance scenarios](../../tests/acceptance/features/deletion.feature) and
  [bindings](../../tests/acceptance/steps/deletion.ts): incoming-reference rejection,
  explicit edge removal, multi-View Action removal and instance-only deletion
  (AC2–AC4, AC6).
- [Real SQLite/HTTP integration](../../tests/integration/deletion.test.ts): all five
  supported states; terminal/cross-owner incoming references; cycles and self
  edges; direct current-row inspection; independent surviving order; unavailable
  owner and missing/invalid/ID-mismatched definitions; old history retention;
  injected persistence/event failures with complete rollback; repeated deletion;
  unavailable/unsupported stores; and existing web reads/missing-object behavior
  (AC2–AC9 and AC10 compatibility).
- [Built CLI processes](../../tests/e2e/delete-cli.test.ts): root/descendant
  discovery, UUID/URI selectors, closed stdin, human/JSON receipts, argument and
  reference errors with exit codes, help and preserved guides (AC1, AC9–AC10).
  The existing generated-guide journey also executes the new examples.

Verification ran on **Windows x64**, Node **24.21.0**, npm **11.4.1**, with
headless Chromium through Playwright. Focused typecheck, lint, architecture and
build checks passed. The final focused deletion suites passed 22 integration
tests, 2 CLI tests and 3 Cucumber scenarios / 14 steps. The initial focused Vite
launch was blocked by sandbox `spawn EPERM`; tests/build/verify were subsequently
run outside that sandbox. No controls were disabled or weakened.

The final complete **`npm run verify` passed, exit 0**, against the source and
tests committed in `fd07eb7ac76c7545238ace16b088e1ab09f5a9c2`:

- Typecheck, ESLint and Prettier: passed.
- Architecture: no violations, 61 modules / 202 dependencies.
- Production TypeScript/Vite build: passed.
- Unit/component: 194 tests passed.
- SQLite/HTTP/other integration: 270 tests passed.
- Acceptance: 39 scenarios / 218 steps passed.
- Built CLI: 29 tests passed, including generated-guide examples.
- Chromium: 24 tests passed.

Earlier full attempts are not counted as successful: the first exposed an
existing unsupported-version test using `9`, now the supported schema. Its
sentinel was changed to `999`, preserving the rejection and no-mutation checks.
The next attempt passed all non-browser checks but the existing narrow-touch
horizontal-scroll test observed scrollLeft 0. That unchanged scenario then passed
three isolated repetitions and passed in the final full run; no web implementation,
test expectations, retries or timeouts were changed. The intermittent observation
is retained here for review rather than treated as a deletion regression without
reproduction. Only this outcome record was added after the final successful run;
its formatting and `git diff --check` were checked separately.

Limitations remain those agreed above: no migration for schema 8, undo, bulk or
force deletion, Outcome dependencies, Markdown reference rewriting, attachment
cleanup or browser deletion workflow. Automated Windows checks and existing
browser journeys were run; Linux and a separate manual human try-out were not.
Use the [walkthrough](../examples/deletion.md) in a disposable schema 9 Workspace
for the human trial. No unresolved implementation defect is established by the
checks; independent review remains required before completion.

## Decision changes and follow-up

- 2026-10-29: Implemented the approved scope and retained `in_progress` pending
  independent review. Schema 9 is the necessary compatibility change described
  above; no automatic migration or additional deletion scope was introduced.
