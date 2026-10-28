# OWF Tool Architecture

> Status: Agreed implementation baseline, 2026-09-15.
> View architecture direction simplified 2026-10-11; definition validation and
> CLI instance create/list/get implemented in 0020; read-only evaluation in 0021.
> Web View inventory, passive display and shared Action editing delivered in 0022.
> CLI View moves, instance placement and write reconciliation delivered in 0023.
> Persistent instance-local column order and CLI positions delivered in 0024.

## Purpose and authority

This document records how the first tool implements the
[MVP scope](../../../docs/design/mvp-scope.md). Its technology choices are not
requirements on other OWF implementations.

Domain semantics come from [Core v0](../../../spec/core-v0.md) and the agreed
[Operational Store design](../../../docs/design/operational-store-notes.md).
The MVP scope selects capabilities; it does not redefine their semantics.
[Development guidelines](development-guidelines.md) define engineering practice.
The [Views profile](../../../docs/design/views-profile-notes.md) owns the
agreed definition/instance and first Kanban contract. Its implementation requires
separately agreed code increments after the specification and design are reviewed.
Unresolved conflicts must be reported rather than silently resolved by changing
the specification.

## Package and directory structure

Use one npm package and lockfile under tools/owf/. Keeping specification and
implementation together allows related changes to be reviewed together.
Separate packages are deferred until distribution or reuse needs justify them.

Planned layout; directories and abstractions are created only when needed:

| Path                              | Responsibility                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| src/domain/workspaces/            | Workspace metadata/name rules; no filesystem access                                          |
| src/application/workspaces/       | Workspace initialization and discovery use cases                                             |
| src/domain/actions/               | Action aggregate, value objects and domain rules                                             |
| src/domain/inbox/                 | Inbox Item aggregate and rules                                                               |
| src/domain/references/            | Shared domain identifiers and references                                                     |
| src/application/actions/          | Action use cases                                                                             |
| src/application/inbox/            | Inbox use cases                                                                              |
| src/domain/views/                 | View validation, placement eligibility, routing, move effects and persistent column ordering |
| src/application/views/            | View instance reads/creation, moves and transactional placement/order reconciliation         |
| src/application/ports/            | Repositories, transactions, Markdown lookup, clock and ID generation interfaces              |
| src/infrastructure/sqlite/        | SQL, mapping, migrations and repository/transaction implementations                          |
| src/infrastructure/markdown/      | Reading Markdown objects and metadata                                                        |
| src/infrastructure/configuration/ | Workspace configuration and registration storage                                             |
| src/interfaces/cli/               | Argument parsing, use-case invocation and output                                             |
| src/interfaces/http/              | HTTP requests, use-case invocation and responses                                             |
| src/interfaces/uri/               | Incoming OWF URI handling and navigation coordination                                        |
| src/contracts/                    | Transport schemas and types, without domain rules                                            |
| src/bootstrap/                    | Entry points and concrete dependency wiring                                                  |
| src/web/                          | Browser UI and API client                                                                    |
| tests/acceptance/features/        | Gherkin acceptance scenarios                                                                 |
| tests/acceptance/steps/           | Scenario bindings to application operations                                                  |
| tests/integration/                | Technical integration tests                                                                  |
| tests/e2e/                        | CLI process and browser journeys                                                             |
| tests/support/                    | Small genuinely shared test fixtures                                                         |
| scripts/                          | Portable development/release support when needed                                             |

Unit tests live beside the code as *.test.ts. Other tests live under tests/.
Organize by domain responsibility within layers, not global entities/services
folders. Avoid generic utils/common dumping grounds and speculative base classes.

## Dependency boundaries

| Part           | Allowed internal dependencies                |
| -------------- | -------------------------------------------- |
| domain         | Domain modules only                          |
| application    | Domain and application ports                 |
| infrastructure | Application ports and required domain types  |
| interfaces     | Public application API and contracts         |
| contracts      | No other implementation layers               |
| web            | Contracts and frontend modules               |
| bootstrap      | Modules required to assemble the application |

Each layer has designated public exports. Cross-layer imports must use them;
relative paths, aliases and re-exports must not bypass the boundaries.
Production module cycles are forbidden. Test composition may use concrete
adapters when testing integration; this does not permit production shortcuts.

Domain code has no filesystem, network, database, environment, framework,
console, current-clock or random-ID access. Time and IDs are supplied as values.
Application code coordinates through ports and does not import concrete adapters.
CLI and HTTP handlers do not access the database directly or implement OWF rules.

dependency-cruiser enforces the dependency graph and public entry points;
ESLint handles prohibited runtime usage. Configuration must cover aliases and
relative imports. Wiring belongs in bootstrap, without a DI container.

## Domain and application model

Action and Inbox Item are separate aggregate roots. An Action includes its owner
reference, outgoing dependencies and state-related values. Workspace is the
operation context, not an aggregate containing every object.

The next View stage introduces independent operational instances referencing
reusable Markdown definitions. Instance identity, explicit placement, and order
are not fields on Action. A command can coordinate an Action and View
instance without turning Workspace into an aggregate or copying Action data.

Domain operations express intent, such as complete or archive, rather than
allowing arbitrary state replacement. For cross-object rules, the application
loads the relevant Action/Outcome facts and the domain evaluates them. Domain
objects never fetch their own dependencies.

Repositories are purpose-specific application ports; do not start with a generic
Repository<T> or use-case framework. Persistence replacement also requires
equivalent query and transaction behavior and a data migration; interfaces alone
do not make it automatic.

## Execution and persistence

CLI directly invokes the shared application library in its own process.
The web server invokes the same library through HTTP handlers. CLI operations
must work without the web server. Future tools can use the library or the CLI's
structured output.

Use one local SQLite database per Workspace, located inside it by default.
Both processes use the same Workspace configuration and store. Local placement
is an implementation choice, not a restriction on the general OWF model.

Use node:sqlite and parameterized SQL, without ORM. The store has an explicit
schema version. At this early PoC stage, backward compatibility and migrations
are deferred: initialize new Workspaces with the supported schema and reject
unsupported versions without mutation. Do not upgrade implicitly during reads,
writes or repeat initialization. This decision was agreed during
[increment 0003 design](increments/0003-action-create-get.md); migration mechanics
require a later explicit design when compatibility becomes necessary.
Node 24's SQLite API is Release Candidate: this trade-off is accepted for the
MVP in exchange for avoiding a separate native npm driver on Windows. Pin the
runtime and isolate the API in the SQLite adapter.

Database calls are synchronous. Keep queries and write transactions short and
bound lock waiting. Normal access by CLI and server must not corrupt the store.
Advanced stale-edit detection and conflict merging remain deferred.

An application operation saves the affected operational data and its Operational
Event Log entries in one transaction. For View moves this includes affected
Action data and instance placement and order, followed by result
validation before commit. Failed operations do not leave partial changes.
This transaction does not extend to externally edited Markdown documents;
do not imply a consistent snapshot across the filesystem and SQLite.

Inbox processing remains a sequence of individual operations. Resolve only after
the intended results succeed; a later failure does not roll back earlier results.
No event sourcing, broker, correlated dual logs or distributed transactions.

Markdown remains authoritative for Projects, Outcomes, Knowledge, and reusable
View definitions. Read it through a separate port to validate owners, obtain
Outcome dependency facts, and load current definitions. View instance data is
authoritative in the same Workspace Operational Store.
An unavailable store must be reported, never treated as empty or silently replaced.
Retain the paused-write backup/restore requirement in the MVP scope.

## View evaluation and write command boundary

Delivered in 0021: CLI `show view VIEW_ID [--json]` coordinates instance and
current definition reads with the existing Action repository through ports.
Domain code routes unplaced Actions uniquely and orders members by fixed ascending
ID; every definition column remains visible. All Workspace Actions are candidates,
without contextual owner narrowing. Existing blocking projection reads candidate
and prerequisite facts from one SQLite statement; it validates before routing.
Get remains configuration-only and list remains definition-independent inventory.
Reads save no placement, rank, timestamps or events. Same-definition instances
show the same content and retain distinct identities. Schema 6 and its five
Action states are unchanged; archival is not available in this tool version.
Effective state defaults win when eligible, otherwise the first eligible ordinary
column in definition order; Blocked takes precedence for blocked non-terminals.
The fallback member order is not persisted manual order. These were the 0021
read-only capabilities; 0023 extends them with current placement below.

Delivered in 0022: `displayView` shares the evaluation read with `showView`,
joining evaluated member IDs to complete existing Action projections from that
same repository result. CLI output remains minimal and unchanged. HTTP exposes
read-only `/api/views` inventory and `/api/views/:id` evaluation, validates their
contracts and binds reads to the server's original Workspace. No per-card browser
fetches or second Action snapshot are used to build View content.

The browser starts in Default Kanban and offers stored instances in a sticky
selector. View boards reuse compact card content and the existing editor, show
actual state, and have no drag/create/reorder controls. The hidden default board
retains in-page filters while its automatic reads and drag sensors are suspended.
All selectors share navigation restrictions for open creation forms, active drags
and pending moves; inactive boards cannot submit state changes. View selection
mounts an isolated read lifecycle; superseded responses cannot change another
selection. Manual and coalesced tab-return refreshes also refresh inventory.
Confirmed edits trigger evaluation without speculative placement. Retained View
content after read failure is stale with saves disabled; draft protection applies
to navigation, including selection from the modal editor. Schema 6 is unchanged.

Delivered in 0023: noninteractive `move action ACTION_ID --view VIEW_ID --column
COLUMN_ID [--reason TEXT] [--waiting-for TEXT] [--json]` works without a server.
Domain movement reuses Action editing/completion rules and the shared column
eligibility/evaluator. The application determines evaluated source from current
transaction facts, validates all destination effects and requests explicit placement
only in the selected instance. Same-column requests are entirely write-free,
preserve actual state and reject either reason option. Cross-column ordinary
moves use the effective destination default. Blocked entry preserves state and
requires/reuses a manual reason; Blocked exit requires no unresolved dependencies
and explicitly clears manual blocking. Ordinary-to-ordinary movement retains it.
Optional waiting text is literal and nonblank and applies only to an ordinary
Waiting default: preserve/replace between Waiting columns and clear on departure.
Reason-only edits emit `action.updated`, without a fictitious state transition.

Schema 7 adds `view_placements`, unique by instance and Action, storing only a
column ID, and `view.placement_changed` events with Action and old/new columns.
New Workspaces use schema 7; schema 6 and all other versions fail without mutation
or implicit migration. The SQLite Action update transaction supplies coherent
before/after Action projections, instances and placements through its application
port. Application reconciliation loads definitions only for affected placements
and uses the domain eligibility implementation against both fact sets, including
direct dependents across instances. Action updates, placement changes and both
event streams commit atomically. Placement-only movement never updates Action
timestamps or emits Action events. Existing HTTP stale-edit checks remain in force.

CLI show and passive web display retain eligible stored placement before normal
routing, including blocked Actions placed in ordinary include_blocked columns.
They keep ascending Action ID order and perform no semantic writes. Known
ineligibility falls back on reads; a relevant successful write removes it.
Temporary external incompatibility reverted before such a write can restore
eligibility even after a read; there are no durable read observations or cached
definitions. Removed referenced column IDs fail explicitly and require restoring
the stable ID. A broken required definition rejects the whole write with context;
unrelated broken Views without affected placements do not block writes. Inventory
remains definition-independent. Browser Refresh sees CLI moves without restart.
Manual ordering, append-on-arrival, View move endpoints/controls, creation in a
column and non-default destination state selection remain deferred. The following
full-profile design also describes those future capabilities; it does not claim
their delivery in 0023.

Delivered in 0024: `move action` accepts optional `--position N`, a positive safe
decimal integer denoting the final one-based destination index after removal.
Same-column bounds are 1..K including the moved card; cross-column entry to K
cards allows 1..K+1. Omission preserves same-column no-op compatibility and appends
on entry. Same-column reorder preserves all Action data and inferred/explicit
placement, including non-default state and dependency-only blocking; reason
options remain forbidden. Same-position requests write nothing, including no
normalization. Only the selected instance receives a requested order.

Schema 8 adds `view_order`, unique by instance/Action and instance/column/rank,
with current dense internal ranks independent from `view_placements`. Contradictory
order fails explicitly. No state copies, dormant ranks or previous-column history
are stored. New instances record initial ascending Action ID order within creation.
Supported CLI/HTTP Action creation and edits reconcile pre/post routing inside the
same transaction as Action data, placements, order and events. Continuing members
retain order; departures discard it and arrivals append. Simultaneous arrivals use
ascending ID; successive commits retain arrival order regardless of ID. One
`view.order_changed` event per changed instance records organization; normalization
never pretends each shifted rank was a user move. Order-only changes produce no
Action update timestamp/event. Schema 7 and all other versions are rejected without
mutation; older Workspaces need a separately designed migration, not supplied here.

Affected-data analysis now includes order-only instances and potential arrivals.
Membership-changing writes, including creation, load all potentially affected
instance definitions, even without placement references; a required broken
definition rejects the whole transaction with instance/definition context. Content
changes can skip an instance proven unrelated by placement/order references.
Pure reorder examines only its selected instance. Existing HTTP stale-edit
protections and bounded SQLite concurrency remain unchanged.

One shared ordered evaluator serves CLI show, HTTP and passive web cards; React
preserves received order. Its Action projections, placements and order come from
one short read-only SQLite transaction, so concurrent commits cannot mix older
Action facts with newer organization data. Markdown remains outside this snapshot.
CLI members expose numeric positions restarting per column, and move results
expose nullable `source_position` and committed
`destination_position`. Reads never write: logically invalid order is ignored,
continuing entries retained and unrecorded members appended by ID. The next
relevant write records evaluated order. External arrivals between writes have no
recoverable chronology; changes reverted before a relevant write can restore
stored eligibility/order even after observation. Removed column IDs referenced
by order remain configuration errors. Default Kanban retains its own behavior;
View web movement, creation in a chosen column and state choice remain deferred.

Definitions are data: state mappings, per-state default columns, target default
states, and blocking inclusion. Domain rules determine eligibility and unique
placement; application code obtains current Workspace/instance facts through
ports. There is no capability registry, executable filter, sorting function,
transition hook, or generic instance-parameter machinery in this stage.
Web/CLI adapters do not implement their own routing or movement semantics.

Evaluation reads the current shared definition. Retain a valid current placement;
otherwise route a blocked Action to the special Blocked column when present,
then use eligible state defaults. Multiple columns accepting a state are normal.
Missing or invalid definitions and contradictory instance data fail evaluation.
Retained GUI data is marked stale with writes disabled; CLI reports structured
failure. Read evaluation never mutates Actions, placements, order, or logs.

Fixed commands coordinate state changes, manual blocking, placement, ordering,
and events. Entering Blocked requires a non-empty manual reason and preserves
execution state. Leaving clears the manual reason only if no dependency block
remains, even for a target that accepts blocked cards. Ordinary destinations
set their default state. Creation uses the target default, or Open plus a reason
in Blocked. Shared domain rules and required state data always apply.

Evaluate the complete candidate and destination within the store transaction
before committing. Any failure rolls back all related writes and events.
The contract excludes Markdown writes and external effects. Reading editable
Markdown is not a distributed snapshot guarantee. Manual/dependency blocking
support must be implemented before the full workflow is advertised.

Order is exclusively manual and instance/column-local. Reordering does not
mutate Action. New arrivals append; neither past positions nor former
organizational columns are restored. Implementation must define write-side
invalidation/reconciliation without writes on reads or reconstruction of
unobserved history. Current placement preserves choices among same-state columns.

No separate planning set or flag is introduced. Snapshot scope chooses the
whole instance or explicit columns; runtime capture remains deferred.
Physical schema, newcomer tie-breaking, required-input UI, concurrency, and
command shapes belong to later implementation increments. The earlier generic
capability design is deferred for complexity and may be revisited for a concrete
need; it is not an extension framework to implement preemptively.

## Application technologies

| Area             | Decision and rationale                                                 |
| ---------------- | ---------------------------------------------------------------------- |
| Core             | Plain TypeScript; no application framework or DI container             |
| Persistence      | node:sqlite; embedded and supplied with Node                           |
| HTTP             | Fastify; thin HTTP adapter with TypeScript support and test facilities |
| CLI              | Commander.js; commands, options and help                               |
| Input validation | Zod; boundary schemas and inferred transport types                     |
| Browser          | React + Vite; interactive UI and development/production build          |
| Routing          | React Router; explicit board, Inbox and Action URLs                    |
| Drag and drop    | dnd-kit; card movement, with an alternative state control              |
| Styling          | CSS Modules                                                            |
| HTTP client      | Native fetch in a small shared frontend data-access layer              |
| Frontend state   | Local React state; no global state framework initially                 |
| Metadata         | yaml frontmatter, commonmark Markdown parsing; Node filesystem APIs    |

Zod checks external shapes, not OWF business rules. Keep transport schemas in
contracts where shared. Do not maintain a second handwritten HTTP schema set.
The domain does not depend on Zod. The same domain rules apply to all callers.

The browser imports contracts, not application code or domain entities.
After a mutation, display the actual accepted result or explain failure.
The first read-only board refreshes on return to the window/tab and by manual
Refresh, coalescing focus/visibility events. Polling and push updates are deferred
by increment 0006; CLI changes are not immediately synchronized while visible.

The production Fastify process serves API and built frontend assets on
127.0.0.1 by default. Vite's server is development-only. LAN hosting is outside
this MVP. CLI JSON output must be machine-readable, with diagnostics on stderr
and consistent exit codes; noninteractive calls must not unexpectedly prompt.

## Navigation

MarkdownObjectReference remains Workspace-rooted url plus optional id, with the
existing consistency rules. Derive Obsidian URLs at the navigation boundary.
The tool does not render or edit Markdown.

The Windows handler accepts owf:action:<id> without a Workspace parameter.
One registered Workspace is selected automatically; multiple Workspaces require
selection; none offers registration. A missing Action is reported with a way to
choose another Workspace. Never infer the Workspace from handler working directory.

The handler opens the selected Action in the browser UI. Exact server startup,
discovery, port selection and shutdown behavior remain open; CLI independence
must be preserved when these are designed.

## Open details and next gate

Still to define when relevant: physical schema, ID encoding, exact CLI/API
contracts, server lifecycle, migration/backup mechanics, optional Markdown-ID
lookup capability, HTTP-local-access protection details, dependency patch
versions and distribution packaging.

The technology choices and directory responsibilities are agreed. None of the
open details or illustrative paths authorizes additional MVP features.
The approved first increment establishes Workspace initialization and CLI tooling.

## Technology references

- [Node 24 SQLite](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)
- [Fastify](https://fastify.dev/docs/latest/)
- [Commander.js](https://github.com/tj/commander.js)
- [Zod](https://zod.dev/)
- [React with Vite](https://react.dev/learn/build-a-react-app-from-scratch)
- [React Router](https://reactrouter.com/start/declarative/installation)
- [dnd-kit](https://dndkit.com/)
- [yaml](https://eemeli.org/yaml/)

## Web View movement (0025)

The browser uses dnd-kit mouse, touch and keyboard sensors with explicit insertion
slots and a distinct append target. A dedicated drag handle preserves detail
activation. The Workspace-bound `POST /api/views/:id/moves` adapter validates shared
contracts and invokes the same single-transaction move operation as CLI. Schema 8,
coherent evaluation snapshots and write reconciliation are unchanged. Evaluation
also supplies the configured Blocked column ID for the reason-only dialog.

The browser freezes reads during a gesture or required Blocked reason dialog,
queues tab refresh, guards navigation and prevents duplicate submissions. Waiting
requires no prompt. Numeric insertion positions use execute-time membership;
concurrent CLI organization does not imply neighbour anchoring. Every outcome
refreshes authoritative membership/order. Rejection, unknown transport outcome and
confirmed commit with read failure have distinct feedback; stale content disables
movement and saves. There is no automatic mutation retry or board revision.
