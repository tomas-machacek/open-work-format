# OWF Tool

The CLI initializes a named local OWF Workspace, discovers it from descendant
directories, creates Markdown Projects and Outcomes, and creates, retrieves or
lists Actions and changes their execution state in the Workspace Operational Store.
The local web interface offers Default Kanban and stored Views. Default Kanban
supports Action creation, editing, state moves, filtering, manual blocking and
Action prerequisites through the same operations. Views display evaluated columns
and support View-local drag and drop alongside shared Action detail editing. Inbox
operations are not yet implemented.

The CLI creates, lists and retrieves independent View instances backed by
validated shared Markdown definitions, and evaluates current Actions into their
columns with read-only `show view`. `move action` atomically applies column effects
and saves instance-local placement and order, with optional final one-based
`--position N` for insertion or same-column reordering.

## Views in the web interface

Run the existing `owf serve` command and open `http://127.0.0.1:4317` (or your
chosen port). The page starts in **Default Kanban**. The sticky **Display**
selector lists CLI-created View instances in the same order as `owf list views`;
duplicate titles include instance IDs. Choose an instance to see its title and
the explicit **View** label. Default Kanban is always available, including when
a View definition is broken. A full page reload returns to Default Kanban.

Views show all configured columns and counts, including empty columns, in
definition order. Members retain the evaluator's persistent instance/column order.
Both boards use the available page width with ordinary outer gutters. Columns
stay side by side at every window width; scroll the board horizontally to reach
overflowing columns.
Cards include owner, waiting reason, compact blocking information and the actual
execution state, even when a column combines states. Click a card or focus it
and press Enter to open the existing detail editor. Edits change the shared
Action and re-evaluate membership: a block or prerequisite edit can move the
card or remove it from the View. Column defaults never change Action state on
display or save. The selector is also available inside detail; unsaved drafts
require a discard decision, and switching is prevented while saving.

Refresh and returning to the browser tab read current Actions, definitions and
instance inventory while preserving the selection. There is no polling. Failed
refreshes retain only the same View's last successful content, visibly marked
stale, and disable saving until refresh succeeds. A confirmed save followed by
a failed refresh is reported separately; do not repeat that save. Missing or
invalid definitions and disappeared instances produce errors with retry.

Default Kanban's search and owner filters do not narrow Views. Returning restores
the in-page filters and existing creation, drag/state changes and detail editing.
Finish or cancel an open default creation form or drag before switching modes.
The same navigation restrictions apply in the header and Action detail.

Drag a card from its background or padding with a mouse, or hold briefly on touch.
Text remains selectable and copyable; gestures on text or controls never move the
card. Cards have ordinary compact gaps. During dragging, a thin line marks the
current exact insertion position; its invisible activation area is larger than
the line. Empty columns accept a drop throughout their content area and highlight
gently. Free content below the last insertion boundary appends without a separate
box or button. Same-column append preserves order, as in CLI.
For keyboard dragging, focus the card,
press Space, use left/right for columns and up/down for positions, then Space
to drop or Escape to cancel. Home/End select first/last; Down past last selects
append. Enter and an ordinary click open detail; finishing selection, dropping or
cancelling does not. A text click waits briefly to allow native double-click word
selection. Normal touch swipes scroll; hold on background to begin dragging.

Entry into Blocked asks for a manual reason only when none exists; cancel writes
nothing. Waiting never prompts. Moves use the shared CLI operation and schema 8.
Positions resolve against server facts at execution time, so concurrent CLI changes
can change neighbours; an invalid position fails rather than being clamped.
During dragging and required-reason input, refresh is queued and navigation is
locked. A rejection, uncertain transport outcome, and confirmed move with failed
refresh have separate feedback. No mutation is retried automatically. A successful
refresh is required before moving or saving retained stale content.

Views have no browser creation controls.
Create instances and edit definitions through the CLI/Markdown workflow below.
View editing in the browser, selection persistence,
windows, Snapshots and Action archiving remain deferred. Use web or CLI moves to organize
the same Actions independently in different instances. In the shipped example,
unplaced unblocked Open Actions enter **New to organize**; move them to **Todo**
without changing state. **Active** combines
In Progress and Waiting, and **Blocked** and **Done** complete the board. Sprint
backlog and Backlog belong only to the broader design example.

## View instances

Use a fresh Workspace initialized by this version (Operational Store schema 8).
Prepare `_views/` manually with a navigation `index.md`, for example:

```markdown
# Index

- [Work board](work-board.md)
```

Copy the complete [Work board definition](docs/examples/work-board.md) to
`_views/work-board.md`. Add a link to `_views/index.md` in the Workspace navigation
index. Nested grouping directories under `_views/` are supported; each grouping
directory should have its own navigation `index.md`. Navigation indexes are not
definitions. View commands read only the specified definition, without scanning
or repairing navigation.

```sh
owf create view --definition /_views/work-board.md --title "My work" --json
owf create view --definition /_views/work-board.md --title "My work" --json
owf list views --json
owf get view VIEW_ID --json
owf show view VIEW_ID
owf show view VIEW_ID --json
```

Replace `VIEW_ID` with a returned instance UUID. Commands work from any descendant
directory of the Workspace without a web server. Definition URLs start at the
Workspace root and use forward slashes and URL encoding (for example
`/_views/My%20board.md`), including on Windows. External URLs, traversal, and
targets outside `_views/` are rejected.

Each create stores a new UUID, normalized instance title, definition reference
`{ url, id? }`, and `created_at`, with one atomic `view.created` event. Duplicate
instance titles are allowed. Optional `owf.id` identifies the Markdown definition;
it is retained in the reference and must still match on get/show. There is no new View
URI scheme, ID scan or automatic reference repair.

JSON uses the existing `{ ok: true, result, warnings: [] }` envelope. Create and
get return `result.view` containing the stored metadata. Get additionally returns
`result.definition` with the current definition `title`, optional `id` and
`purpose`, `renderer`, ordered `columns`, and effective `defaults`. Ordinary
columns have `type: "status"`, a `status` array, effective `default_status`, and
effective boolean `include_blocked`. Blocked columns have only `id`, `title`, and
`type: "blocked"`. Implicit defaults are resolved without modifying Markdown.
List returns `result.views`, ordered by ascending instance ID, without opening
definitions. It includes broken references and returns `[]` for an empty store.

Show returns `result.status: "evaluated"`, `result.type: "view"`, `result.root`,
the stored `result.view`, and ordered `result.columns`. Each column has `id`,
`title` and `members`; each member has `id`, `title`, its actual `state`, and a
derived `blocked` boolean and numeric one-based `position`. Human output shows the same order and content and
marks empty columns. Get returns configuration only; list inventories instances.

All current Actions across the Workspace are evaluated, even when invoked from a
Project/Outcome directory. An eligible stored placement takes precedence, including
an ordinary `include_blocked` column. Otherwise a blocked non-terminal Action
prefers the special Blocked column; otherwise the effective
per-state default wins if eligible, then the first eligible ordinary column in
definition order. Ordinary columns accept blocked Actions only with
`include_blocked: true`. Waiting alone is not blocking. A column's `default_status`
does not change a member's actual state. Ineligible Actions are omitted.
All columns remain visible, including empty columns. Members follow persistent
instance/column-local order, with positions restarting at 1 in each column.
Order is separate from explicit placement: ordering an inferred card never pins it.
New instances record initial ascending Action ID order in their creation transaction.
Later arrivals append, preserving continuing members; simultaneous arrivals use
ascending ID, successive writes use commit order. New Action IDs never jump ahead
of existing cards. Departure discards position; return is a new arrival. Instances
can organize the same Actions independently. Unplaced Open Actions in the example
route to New to organize.

After copying the example above, try this flow. Replace `VIEW_ID` and `ACTION_ID`
with the IDs returned by create:

```sh
owf create view --definition /_views/work-board.md --title "Try evaluation" --json
owf create action --title "Read the brief" --json
owf create action --title "Wait for reply" --state waiting
owf create action --title "Finished task" --state completed
owf show view VIEW_ID
owf set action ACTION_ID --state in_progress
owf show view VIEW_ID --json
owf set action ACTION_ID --manual-block "Needs approval"
owf show view VIEW_ID
owf set action ACTION_ID --clear-manual-block
owf show view VIEW_ID
```

Change `owf.defaults.open` in the shared definition to `todo` and show again to
see live routing without refresh/rebuild. Current dependency facts are reused
even when prerequisites are outside the View. Missing prerequisites and malformed
Actions fail the entire read, including Actions that routing would otherwise omit.
Schema 8 supports five execution states; Action archival and archived prerequisite
dispositions are not supported by this version. Externally injected `archived`
records are invalid store data and fail explicitly.

Edit the shared Markdown definition and get either instance again: both use the
new valid configuration while retaining their own title and UUID. A missing,
invalid or ID-mismatched definition causes get/show to fail with its URL and instance
ID, while list still returns the stored instances. Definition errors use
`INVALID_VIEW_DEFINITION` or `INVALID_VIEW_REFERENCE`; unknown instances use
`VIEW_NOT_FOUND`. Store errors remain explicit, never empty successful results.
JSON errors use `{ ok: false, error: { code, message } }`; human errors go to
stderr. Invalid arguments/titles exit 2 and operational failures exit 1.

Windows, View editing and deletion
remain deferred. The existing five-state
board retains its behavior. Reads do not change definitions, instances, Actions
or events. Action candidates, prerequisite facts, placements and order are read
within one short read-only SQLite transaction. Editable Markdown and SQLite do
not provide a cross-representation atomic snapshot; show returns current content, not an
immutable Snapshot. Empty Workspaces, no eligible members and zero-column
definitions are successful evaluations.

## Moving Actions through CLI

After creating instances and an Action above, replace `ACTION_ID` and `VIEW_ID`
with their returned IDs. Titles are not selectors; column IDs come from the definition:

```sh
owf move action ACTION_ID --view VIEW_ID --column todo --position 1 --json
owf move action ACTION_ID --view VIEW_ID --column blocked --reason "Missing access"
owf move action ACTION_ID --view VIEW_ID --column todo
```

The first command changes only the selected instance's organization, with no Action
timestamp or state event. Other instances retain eligible choices. Cross-column
ordinary moves apply `default_status` (or the first listed state), even if the
previous state was supported too. Actions outside the View may enter a valid target.
Use `--position N` for a final one-based index after removing the moved card.
For K cards including the moved card, same-column bounds are 1..K; entry to a
column with K other cards permits 1..K+1 (an empty target permits only 1).
Accept positive safe decimal integers only; invalid positions fail without writes,
clamping or appending. Omission appends on entry and is a same-column no-op.
An explicit current position is also a write-free no-op, without normalization.
Same-column reorder preserves all Action data, actual multi-state column state,
Waiting/manual reasons, dependencies, timestamps and inferred/explicit placement.
It needs no reason even for dependency-only Blocked cards. Both reason options
remain forbidden on any same-column request. Only the selected instance reorders.

```sh
owf move action ACTION_ID --view VIEW_ID --column todo --position 1
owf show view VIEW_ID --json
```

Other cards keep relative order. Position resolves from current transaction facts,
not a saved screen revision. Existing bounded SQLite writer locking still applies.

Entering Blocked preserves state and requires a nonblank manual `--reason`, or
reuses an existing valid manual reason. Dependency blocking alone is insufficient.
Terminal Actions cannot enter Blocked. Leaving evaluated Blocked requires all
prerequisites completed, clears the manual reason and applies the ordinary default.
This also applies to `include_blocked` and Cancelled destinations. Moves between
ordinary columns retain manual blocking; completion and terminal rules still apply.
`--reason` is rejected for ordinary targets, same-column requests, blank input or
when combined with `--waiting-for`.

For a Waiting destination, add this ordinary column under `owf.columns` in the
example definition (its ID is deliberately distinct from Active):

```yaml
- id: waiting-for
  title: Waiting for
  status: waiting
```

```sh
owf move action ACTION_ID --view VIEW_ID --column waiting-for --waiting-for "Odpoveď dodávateľa"
owf get action ACTION_ID --json
```

Optional `--waiting-for` preserves nonblank supplied text verbatim. Entering Waiting
without it starts without a reason. Between distinct Waiting columns, omission
preserves the saved reason and supplied text replaces it; leaving Waiting clears
it atomically. Clearing while staying Waiting uses existing `set action` editing.
The move option is rejected for same-column requests, Blocked entry, blank text,
and any effective default other than Waiting, including Active which supports
Waiting but defaults to In Progress. A valid Blocked exit to Waiting may supply it.

Human and JSON move results identify the Action and View, evaluated source
(`null` outside the View), `source_position` (also nullable), destination,
`destination_position`, `changed`, resulting state, blocking and
waiting reason when present. JSON uses `result.type: "view-move"` and status
`moved` or `unchanged`. Success is returned only after commit.

Supported CLI and HTTP Action edits, Default Kanban state moves and prerequisite
changes and normal Action creation reconcile placements and order across potentially
affected instances, including instances with only order data and direct
dependents. Both pre-change and post-change invalidity discard placements in the
same transaction as Action data, order and events. Returning to an earlier state or
clearing a later block uses fallback routing, without restoring the old Todo.
Eligible placements survive. Placement events use `view.placement_changed` with
Action ID and old/new column IDs. Ordering changes use one `view.order_changed`
event per changed instance, including a pure reorder; internal renumbering does
not produce individual card moves. Current placement/order data are authority.

Reads remain pure: temporarily incompatible external definition edits only hide
ineligible placements logically. Restoring the definition before a relevant
successful write can restore eligibility, even after a read. A relevant successful
write while invalid removes the placement permanently. No read creates cleanup
markers. Renaming titles or defaults preserves eligible placements; removing a
referenced column is an `INVALID_VIEW_PLACEMENT` error. Restore its stable ID to
repair it. This also applies to columns referenced only by order data.
Pure reads retain valid order entries and append currently unrecorded members in
ascending ID order. The next relevant successful write records that evaluated
order and reconciles departures. Reads cannot recover external arrival chronology
or permanently discard positions; external changes reverted before a supported
write cannot be reconstructed.

Membership-changing writes (including CLI/HTTP creation) must evaluate every
potentially affected instance, even without explicit placements. A required broken
definition rejects the entire write with instance/definition context. Content-only
edits can skip an instance proven unaffected by its placement/order references. `list views` stays available for diagnosis.

Use browser Refresh after CLI moves to see placement and saved reasons without
restarting the server. View cards render shared order without sorting; web moves
use `POST /api/views/:id/moves`. Creation in a column, state-choice options,
arbitrary filters and migrations remain deferred.

See the [MVP scope](../../docs/design/mvp-scope.md) for included capabilities,
deferred features, and acceptance scenarios.

Keeping the tool in the specification repository allows related design, code,
and test changes to be reviewed together. The tool's technology choices and
Kanban interface are implementation decisions, not OWF Core requirements.

## Development documents

- [Architecture](docs/architecture.md) — layers, processes, persistence and technologies.
- [Development guidelines](docs/development-guidelines.md) — testing, lint, local verification and releases.
- [Increment index](docs/increments/README.md) — individual designs and implementation outcomes.
- [Agent instructions](AGENTS.md) — entry point for implementation and review agents.

## Setup and verification (Windows PowerShell)

Use Node.js **24.21.0** (also pinned in `.nvmrc`) and npm **11.4.1**, the versions
used for validation. Dependencies are pinned in the committed lockfile.

```powershell
Set-Location C:\Users\tomas\Projects\open-work-format\tools\owf
node --version
npm --version
npm ci
npm run build
npm run verify
```

`verify` checks types (including tests/configuration), lint, formatting and module
boundaries, builds production code, then runs unit, integration, Cucumber and CLI
process and Chromium suites. `npm run test:e2e` runs CLI and browser tests and
requires a prior build.
`npm run format` applies formatting. All checks are local; no Git hooks or CI are
installed. Platform/runtime evidence for each change is recorded in its increment
outcome; increment 0002 also passed Linux verification on Node 24.19.0.

### Windows: Vitest cannot find the current suite

If Vitest reports "failed to find the current suite", enter the package directory
with an uppercase drive letter before running tests. This workaround was confirmed
locally by the user with Node 24.21.0 and Vitest 5.0.1:

```powershell
cd C:\Users\tomas\Projects\open-work-format\tools\owf
npm run verify
```

Use your own checkout path and preserve the uppercase `C:` (or your drive letter).
See [Vitest issue 10692](https://github.com/vitest-dev/vitest/issues/10692).

## Try it outside the checkout

```powershell
$cli = (Resolve-Path .\dist\bootstrap\cli.js).Path
$trial = Join-Path $env:TEMP ('owf-trial-' + [guid]::NewGuid())
New-Item -ItemType Directory $trial | Out-Null
Set-Location $trial
node $cli init --title "Moja práca" --json
Get-Content README.md, index.md, log.md
New-Item -ItemType Directory child | Out-Null
Set-Location child
node $cli init --title "Iný názov" --json
node $cli --help
node $cli --version
```

The first call creates `README.md`, `index.md`, `log.md`, `AGENTS.md` and `_store/owf.sqlite`.
The second returns `already_initialized`, the original title and the same absolute
root, without changing existing artifacts. Omit `--title` to use the directory
basename. Omit `--json` for human output. No prompts are required.

`npm run dev -- init ...` runs through tsx, but npm uses the package directory as
the working directory. Use the absolute built CLI path above for a user Workspace.
Alternatively, run `npm link` in the package directory, then use `owf init` from
the intended Workspace. Local linking is optional.

### Create Projects, Outcomes and Actions

From the trial Workspace root, using the same absolute `$cli` path:

```powershell
node $cli create project --title "Rekonštrukcia kuchyne" --slug kitchen --json
Set-Location _projects/kitchen
node $cli create outcome --title "Schválený návrh kuchyne"
node $cli create outcome --title "Materiály" --owner /_projects/kitchen/ --expected-result "Materiály sú vybrané." --json
node $cli create outcome --help
$action = node $cli create action --title "Call the supplier" --json | ConvertFrom-Json
node $cli create action --title "Confirm delivery" --owner / --description "Check the delivery date."
node $cli create action --title "Wait for HR" --state waiting --waiting-for "HR reply" --json
node $cli create action --title "Finished call" --state completed
node $cli get action $action.result.action.id
node $cli get action $action.result.uri --json
node $cli set action $action.result.action.id --state waiting --waiting-for "Supplier reply" --json
node $cli set action $action.result.uri --state waiting --waiting-for "New reply date"
node $cli set action $action.result.uri --title "Call supplier" --description "Confirm date" --owner /_projects/kitchen/ --json
node $cli set action $action.result.uri --owner / --clear-description
node $cli set action $action.result.uri --clear-waiting-for
node $cli list actions --state open --state waiting --owner /_projects/kitchen/ --recursive --json
node $cli set action $action.result.uri --state completed
node $cli set action $action.result.uri --state open
node $cli list actions --json
node $cli list actions --owner / --json
node $cli list actions --owner /_projects/kitchen/ --json
node $cli list actions --owner /_projects/kitchen/ --recursive --json
node $cli list actions --search "delivery" --owner /_projects/kitchen/ --recursive --state open --state waiting --json
```

Projects always become top-level entries in `/_projects/`. Outcomes use the nearest
Project/Outcome from the physical working directory; explicit `--owner` overrides
that context. Owners are Workspace-rooted directory URLs with a trailing slash,
not native filesystem paths. Encode special characters in each URL segment.
Owner paths use physical directories; explicit symlinks/junctions are rejected.
Archived owners and malformed owner hierarchies are rejected. A recognized,
accessible store remains required; Project/Outcome creation does not modify it.

Titles are trimmed single-line literal text. An Outcome's Expected Result defaults
to its title. `--slug` accepts lowercase ASCII letters/digits separated by single
hyphens (excluding Windows device names); otherwise it is derived from the title.
Existing targets, including case-only collisions, are errors. Existing navigation
indexes stay unchanged and can be maintained manually.

Actions default to `open`. Supply `--state` once to create directly in `open`,
`in_progress`, `waiting`, `completed` or `cancelled`. With `waiting`, optional
`--waiting-for`, supplied once, supplies a nonblank reason preserved literally; it is invalid
with other states, including implicit `open`. Comma-separated states are invalid.
Creation saves the selected state and reason with one `action.created` event
in a single transaction. The board shows the Action in that column after refresh.
Creation uses explicit `--owner` when supplied,
otherwise the nearest Project or Outcome in the working directory ancestry,
otherwise the Workspace (`/`). Use `--owner /` to select the Workspace
explicitly. Descriptions are literal Markdown text and may contain newlines.
The successful result includes all Action fields, its stable UUID and
`owf:action:<uuid>` URI. `get action` accepts either identifier from anywhere
inside that Workspace and returns the stored owner reference without resolving
the current Markdown owner. Human output shows title, ID, URI, state, owner,
description and timestamps; `--json` emits the complete result envelope.
The PowerShell example saves the creation response and passes its real ID/URI
to get. In the generated Workspace guide, `{id}` denotes that returned UUID.

`list actions` returns every Action in the discovered Workspace, even when run
from inside a Project. `--owner /` selects only Workspace-owned Actions;
`--owner /_projects/kitchen/` selects only Actions directly owned by that
Project. Add `--recursive` to include Actions whose stored owner URLs are below
that Project, including nested Outcomes. Recursive matching uses stored URL
references and complete path segments; a moved or missing Markdown owner does
not repair or change those references. Valid filters with no matches succeed
with an empty list. `--recursive` requires `--owner`.

Supply --search once with nonblank text to find a literal contiguous substring in
an Action title OR description, using locale-independent JavaScript toLowerCase().
Leading/trailing whitespace is trimmed; internal whitespace, Markdown syntax,
newlines and special characters stay literal. Slovak case pairs match, while
diacritics remain significant (navrh does not match NÁVRH). No Unicode
normalization or transliteration is applied. Matches cannot span the two fields;
waiting reasons, owner names and IDs are excluded. Search uses AND with owner
scope and selected states (which use OR). Results retain created_at DESC, id ASC
order and complete records, without ranking. Missing, blank or repeated search
values fail with INVALID_ARGUMENT (exit 2); no matches succeed (exit 0).
Search is read-only and works without a web server. Invalid stored Actions still
fail the read even outside the selected results.

`set action ID` accepts one or more of `--title`, `--description`,
`--clear-description`, `--owner`, `--state`, `--waiting-for`, and
`--clear-waiting-for` in one atomic update. The title must be nonempty and
single-line. Descriptions preserve literal Markdown, including an empty string;
clear removes the optional field. An explicit owner URL is validated with its
Project/Outcome chain; `/` selects the Workspace. Other edits preserve the
stored owner even when its Markdown directory has disappeared. All states,
including terminal states, allow content and ownership edits.

State accepts `open`, `in_progress`, `waiting`, `completed`, `cancelled`.
`--waiting-for` needs a resulting waiting state and nonblank text; omission
preserves a reason while staying waiting. `--clear-waiting-for` removes it while
waiting; leaving waiting clears it automatically. Repeated scalar or
contradictory options fail. An identical request preserves Action data and events;
it can still reconcile invalid View placements. A real Action update preserves ID and `created_at`, updates `updated_at` once,
and commits exactly one event: `action.state_changed` for state changes without
content/block/dependency edits; `action.updated` for reason-only, content, owner,
manual block or dependency edits. A failed
transaction saves neither change nor event. `ACTION_NOT_FOUND` means the ID is
absent; `ACTION_CONFLICT` reports a rejected conditional write;
`ACTION_UPDATE_FAILED` reports a write failure or clock rollback. The browser preserves blocking data and enforces shared completion rules.

Fresh PoC Workspaces use schema 8. Older stores (including schemas 6 and 7) are refused with
`UNSUPPORTED_STORE_VERSION` without migration or mutation;
create a new disposable Workspace with `owf init` to try this increment. Never
reset or overwrite an existing store.

Repeat `list actions --state STATE` to match any listed state; duplicates do not
repeat Actions. Owner scope and state selection combine with AND. Comma-separated
states are invalid. Without state selection, terminal Actions are included.
Get and list stay read-only and include `waiting_for` only when present.
Archive and Outcome dependency targets are not implemented.

## Manual blocking and prerequisites

Use the dependent Action as the command ID and its prerequisite as the target:

```sh
owf set action {id} --manual-block "Missing production access"
owf set action {id} --add-dependency {prerequisite-id}
owf set action {id} --add-dependency {first-id} --add-dependency {second-id}
owf set action {id} --remove-dependency {old-id} --add-dependency {new-id}
owf set action {id} --clear-manual-block --state completed
```

Replace placeholders with real UUID v4 values or owf:action:UUID URIs. Targets
must be Actions in this Workspace; cross-Project edges are supported. A source
**depends on** each target. Repeat add/remove flags to edit the set atomically
with other fields; duplicate adds and absent removals are no-ops, but all supplied
targets must exist. Adding and removing the same normalized target fails.
Cycles and self-dependencies can be stored; no cycle linter is provided yet.

The optional nonblank manual reason is literal text, independent of waiting_for
and execution state. Omission preserves it. Clear it explicitly before or together
with entering completed or cancelled; setting a reason on a terminal result fails.
Clearing an absent reason succeeds unchanged. Only completed prerequisites satisfy
dependencies; cancelled, waiting, open and in_progress targets remain unresolved.
Completion requires all remaining prerequisites satisfied (ACTION_BLOCKED, exit 1,
with unresolved IDs); cancellation does not. Removing an obsolete edge and
completing can be one update. Reopening a target changes derived blocking on the
next read without updating dependent states, timestamps or events. Unrelated edits
and unchanged completed requests remain allowed on an already completed source.

Get/list and mutation text always show State and a separate Blocked summary:
Blocked: no; yes (manual); yes (dependencies: N unresolved of M); or
yes (manual; dependencies: N unresolved of M). Manual block shows the reason.
Get/mutations also show every prerequisite's canonical URI, current title, state,
and satisfied/unresolved, sorted by URI; an empty set shows Dependencies: none.
List keeps details concise. JSON retains existing envelopes and extends every
Action with optional manual_block, depends_on (always an array), and blocking:
blocked, manual, unresolved_dependencies, and dependencies entries containing
uri, title, state, satisfied. Blocking is derived from one SQLite read snapshot;
only the manual reason and outgoing references are stored. Missing/corrupt
prerequisites fail the read, including outside owner/state/search filters.
Search still matches only source title/description, excluding manual reasons and
prerequisite titles. Blocked is separate from the five execution states.

Real manual/dependency edits emit one action.updated event with changed fields
and old/new reasons or reference sets, committing with all other edits. No-ops
produce no event or timestamp change. The existing board state operation enforces
the same completion guard, and browser content edits preserve CLI-added fields.
The board also exposes manual reasons and Action prerequisites in detail; refresh
after CLI edits to see current blocking. See the board instructions below.

Successful Project/Outcome JSON creation returns `ok`, `result` (status, type, title, root, url,
path, owner) and `warnings`. Log failures keep the usable object and return exit 0
with `LOG_WRITE_FAILED`; do not retry creation. Invalid arguments return exit 2;
Workspace, owner, collision and I/O errors return exit 1.

Action create/get return `{ ok: true, result: { status, type, root, uri, action },
warnings: [] }`. Action creation and its `action.created` event commit together;
a failure returns `ACTION_CREATE_FAILED` and saves neither record. Get is
read-only; a valid absent ID returns `ACTION_NOT_FOUND`, while store failures
retain their store diagnostics. Both commands use exit 2 for invalid arguments
or titles and exit 1 for operational errors.

Fresh initialization provides command examples in `AGENTS.md`. Repeat init never
overwrites or backfills that guide. Older-schema Workspaces require a fresh
disposable directory for this version; existing instructions can be updated
manually using the commands documented here. An
existing `AGENTS.md` in a fresh directory prevents initialization.

The tool refuses target collisions and unavailable/unsupported stores. It does
not rename, repair, overwrite, or create nested Workspaces. Fresh initialization
creates `owf_metadata`, Actions, View instances, and the Operational Event Log with format
`owf-tool-operational` and schema version `7`; profile version `0.1` and package
version `0.0.0` are independent. Older and unknown schema versions are rejected
without upgrade. Use a fresh disposable directory to try this version; do not
overwrite an existing Workspace. This is
limited profile support, not a claim of complete conformance.

Caught Workspace/Project/Outcome creation failures clean up owned artifacts and report paths if cleanup
fails. Process termination or power loss can leave partial artifacts requiring
manual inspection. Concurrent initialization and crash recovery are deferred.

## Local releases

After independent review and successful verification of the intended revision,
start with a clean working tree and run `npm run release -- --increment patch`
(or another explicitly chosen version). Configuration updates both package files,
creates `chore(owf): release <version>` and tag `owf-v<version>`, and disables push,
npm publication, GitHub and GitLab releases. Verification is not repeated by the
release command. A dry run uses `npm run release -- --ci --dry-run --increment patch`;
run it in a disposable repository copy when validating release configuration.
No actual release has been created for this increment.

## License

Copyright 2026 Tomáš Macháček.

Except where otherwise noted, the code and accompanying tool documentation
under this directory are licensed under the [Apache License 2.0](LICENSE)
(SPDX: `Apache-2.0`).

The OWF specification, design documents, and Workspace examples outside this
directory remain under CC BY 4.0, as described in the
[repository README](../../README.md#license). Third-party components retain
their respective licenses.

## Action board

After `npm ci` and `npm run build` in `tools/owf`, enter an initialized Workspace
and run `node <absolute-path-to-tools/owf>/dist/bootstrap/cli.js serve` (or
`owf serve` when installed on PATH). Open **http://127.0.0.1:4317**.
The process serves its built assets; Vite is not needed. Ctrl+C stops it.
Use `serve --port 4318` for an occupied port. Only loopback access is supported.

The five columns retain listing order. Cards show the full title, stored owner URL
and optional waiting reason. Action IDs remain available through CLI and JSON
output. Choose **Add Action** in any column to create directly in
that state. Enter a title and optional Markdown description. **Owner** defaults
to Workspace (`/`); search by Project/Outcome name, hierarchy or URL and select
a result to change it. Choices show type and hierarchy to distinguish duplicate
names. Typing search text alone does not change ownership. Use arrows and Enter
to select; Escape closes the results. **Refresh owners** loads new contexts;
read failures offer Retry while retaining your draft and selected owner.
Waiting also accepts an optional, nonblank **Waiting for** reason; its text is
preserved literally. Save confirms the accepted Action; the applied selection
determines whether its card is displayed, and matching counts update after refresh.
Cancel closes the form. One form can be open at a time; drafts survive refresh
and failed saves. If a save cannot be confirmed, refresh/check before submitting
again to avoid a duplicate.

Drag a card from anywhere on its surface into another column to change its
state. Keyboard dragging uses Space to pick up/drop, arrow keys
to choose a column and Escape to cancel. Moving into Waiting does not request
or add a reason; moving out clears any existing reason. The card stays put until
the server confirms the change. A conflict refreshes the board; after an
uncertain network failure, refresh and check before trying again.
CLI changes appear when you return to the window/tab or press Refresh. Refresh
retains cards; errors mark existing data not current and offer Retry. There is
no polling, within-column ordering or multi-Workspace registration.

Use **Search title or description** and the searchable **Owner** filter above
the board, then **Apply filters** (or Enter in the text input). Controls are drafts
until applied; unapplied changes are indicated. Search trims edges and uses the
same literal case-insensitive substring rules as CLI search, including stored
Markdown and significant diacritics. Text and owner constraints combine with AND.
**All owners** removes the owner constraint; Workspace (`/`) selects standalone
Actions. **Include descendant Outcomes** opts into recursive selection; with
Workspace it includes the entire Workspace. Picker Enter only selects an owner.
**Clear filters** restores defaults. All five columns stay visible and counts show
matching results. Refresh, Retry and return-to-tab preserve applied filters and
control drafts; a page reload restores defaults. Previous results are labeled
while a different scope loads, and read errors retain the last successful scope.
Creation still defaults to Workspace and the chosen column. After a filtered
create/edit, the server determines membership again. A save outside the selection
is announced as successful; a failed membership read is reported separately and
must not prompt repeating the save. Editor drafts survive selection exclusion.
Already displayed cards retain confirmed saved values if the subsequent read
fails; their filter membership is marked unconfirmed until a successful refresh.
Save notices follow the latest board selection and refresh outcome.

Click a card (or press Enter while it is focused) to open its detail editor.
Blocked cards show a compact **Blocked** badge with `manual`, the unresolved
prerequisite count, or both. They stay in their intrinsic-state columns. Detail
has one compact **Blocking** section: its summary describes saved blocking and
**Unsaved changes** marks pending edits. Each prerequisite appears once, including
satisfied targets, with owner path before title and state/Satisfied/Unresolved.
Hover, focus or tap the Action label to disclose its full canonical URI and stored
owner URL; Escape dismisses the disclosure first. Workspace-root owners have no
visible path prefix. **Refresh** in this section updates source and target facts,
including unsaved selections, without discarding drafts or picker state. Partial
failures retain known data with stale labels; use the same Refresh to retry.

Use **Manual block** and a nonblank **Manual blocking reason** to set or
replace literal reason text. Unchecking it schedules clearing on save; toggling
back retains draft text. Waiting for remains independent. Completed/cancelled
Actions cannot receive manual reasons, but their prerequisites remain editable.

**+ Add prerequisite** opens and focuses a search across the entire Workspace,
including other Projects and terminal Actions, matching title/description
independently of board filters. Empty search lists all
Actions while the picker is open. Self/cyclic edges are allowed; selected targets
cannot be added twice. Enter/ArrowDown in search focuses the first available Add
button; Tab also reaches identity disclosures. Selection closes/clears the picker
and focuses Add prerequisite. Escape or clicking outside the picker dismisses it
without changing the draft. Added rows are labeled **Added**; removing them drops
the draft row. Saved rows remain **Removed** with **Undo** until Save; selecting
them again also restores membership. Net membership undo sends no edit.
Lookup failure offers Retry inside the active picker without clearing selections.
The dialog content and bounded picker results scroll independently of the
always-visible **Save changes** and **Cancel** bar, including in narrow or short
windows. Save changes commits all fields and edges together; Cancel, outside-dialog click and Escape after closing
inner disclosures/picker use the existing discard confirmation.

Completing requires satisfied prerequisites. Completing or cancelling requires
clearing a manual reason first: open detail, resolve prerequisites or clear the
manual block, save, then retry the move. Drag never clears blockers automatically.
Confirmed writes refresh dependents, including after target title edits. Target-only
refresh updates derived facts while preserving source drafts; source changes
require explicit reload. Stale/unavailable facts are labeled. A successful save
followed by refresh failure remains a successful save; do not repeat it. The
board requires schema 8, with no migration or implicit store replacement.

The editor uses the same owner picker. An unavailable stored owner stays visible;
editing other fields retains it without requiring its Markdown context. Selecting
a different owner sends its canonical URL and the server validates it again at
save. A stale/invalid selection leaves the draft intact. Escape first closes open
picker results; outside the picker it follows the editor's discard confirmation.

Install the Chromium test browser once with `npx playwright install chromium`.
`npm run verify` includes focused browser journeys against the built server and
real CLI. `npm run test:browser` runs them alone after building; technical errors
and response races are covered in integration and component tests. Failure
screenshots and traces are diagnostics in `test-results/`, not snapshot assertions.

`GET /api/owners` reads the physical Markdown tree and returns
`{ owners: [{ url, type, title, hierarchy }] }` with Workspace first. Terminal and
archived subtrees are excluded. Unsafe links or unreadable/malformed owner
metadata return 503 `OWNER_DISCOVERY_FAILED` rather than a partial list. Responses
use `Cache-Control: no-store`; discovery does not read the Operational Store.

`GET /api/actions` returns `{ workspace: { root }, actions: [...] }` with complete
ordered records. Optional `search`, `owner` and `recursive=true|false` select through
the shared CLI/application operation. Each parameter may occur only once;
recursive true requires an owner. Explicit blank search, invalid owner URLs,
unknown/repeated parameters and malformed recursion return 400 in the existing
error envelope; unmatched valid queries return 200 with an empty array. Read/store
failures return 503, including corrupt records outside the selection. Encode query
values with `URLSearchParams` to preserve spaces, ampersands, literal punctuation
and the percent escapes in canonical owner URLs. Reads never change the store.

The write endpoints accept only same-origin `application/json` requests at
`http://127.0.0.1:<serve-port>`; cross-origin/form requests are rejected before
writing. `POST /api/actions` requires `title`, `owner`, `state`, with optional
`description` and `waitingFor`; unknown fields are rejected. A 201 response is
`{ action: ... }` with the persisted record. Errors use
`{ error: { code, message } }`: 400 for invalid input, 403 for origin/host
rejection, 415 for non-JSON, and 503 for unavailable/failed storage. Creation
uses the same atomic Action + creation-event operation as the CLI.
`PATCH /api/actions/{id}/state` accepts `state` and `expected` containing the
card's `state`, `updated_at` and optional `waiting_for`. It returns `status`
(`updated` or `unchanged`) and the persisted `action`. A stale snapshot returns
409 `ACTION_CONFLICT`, an absent Action returns 404, malformed input 400, and
storage failures 503. The comparison and state/event update occur in one transaction.

`PATCH /api/actions/{id}` requires `expected` with `title`, `owner`, `state`,
`updated_at` and optional `description`/`waiting_for` from the source snapshot.
Editable optional fields are `title`, `description`, `clearDescription: true`,
`owner`, `waitingFor`, `clearWaitingFor: true`, `manualBlock`,
`clearManualBlock: true`, `addDependency: string[]` and `removeDependency: string[]`.
Omission preserves values; empty edge arrays do nothing and alone are not an edit.
Contradictory set/clear flags, malformed/unknown fields and normalized targets in
both lists fail. State is read-only in this endpoint. Shared operations normalize
UUID/Action URI targets and validate their existence and terminal rules inside
the write transaction. Returns `{ status: "updated" | "unchanged", action }` with
complete `depends_on` and derived `blocking`; no-ops emit no event. Invalid input
returns 400, missing source/target 404, source conflict 409 and write failure 503.
No partial fields or events persist on rejection/failure. GUI reads reject missing
or malformed blocking projections rather than treating them as unblocked.

For frontend development, run `owf serve` on its default port 4317 and `npx vite`
in `tools/owf`. Vite binds to 127.0.0.1 and proxies `/api` to that local server,
preserving origin checks. Production assets and API share the server origin.
