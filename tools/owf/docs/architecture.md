# OWF Tool Architecture

> Status: Agreed implementation baseline, established 2026-09-15.
> Current-state documentation includes CLI and browser Inbox support through increment 0037.
> Historical delivery decisions and deferred capabilities are separated below.

## Purpose and authority

This document records structural decisions for the first tool, not requirements
on other OWF implementations. [Core v0](../../../spec/core-v0.md), the agreed
[Operational Store design](../../../docs/design/operational-store-notes.md) and
[Views profile](../../../docs/design/views-profile-notes.md) own domain semantics.
[MVP scope](../../../docs/design/mvp-scope.md) selects capabilities; it does not
redefine semantics or imply that all selected capabilities are already delivered.
[Development guidelines](development-guidelines.md) own engineering practice.

Use the [code map](code-map.md) for current implementation entry points and test
routes. Read the relevant sections here for decisions; consult
[delivery history](#historical-delivery-decisions) for their rationale and owning
increments. Report semantic conflicts rather than silently changing requirements.
Only an agreed increment authorizes its implementation scope.

## Package and directory structure

Use one npm package and lockfile under tools/owf/. Keeping specification and
implementation together allows related changes to be reviewed together.
Separate packages are deferred until distribution or reuse needs justify them.

The [code map's layer table](code-map.md#layers-and-entry-points) owns the current
source inventory. Organize by domain responsibility within layers; avoid global
entities/services folders, generic utils/common dumping grounds and speculative
base classes. Create directories and abstractions only when needed.

Unit/component tests live beside source as *.test.ts or *.test.tsx. Technical
integration, acceptance and CLI/browser journeys live under tests/integration/,
tests/acceptance/ and tests/e2e/; tests/support/ holds genuinely shared fixtures.
Dedicated shared-reference modules and URI handling remain deferred. Inbox has
separate domain/application modules and a SQLite adapter; scripts/ owns verification tooling.

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
adapters for integration without permitting production shortcuts.

Domain code has no filesystem, network, database, environment, framework,
console, current-clock or random-ID access. Time and IDs are supplied as values.
Application coordinates through ports without importing concrete adapters.
CLI and HTTP handlers do not access the database directly or implement OWF rules.
Concrete infrastructure adapters are isolated from one another.

dependency-cruiser owns the dependency graph and public-entry checks, including
aliases and relative imports; ESLint handles prohibited runtime usage. SQLite
access belongs only in its persistence adapter. Wiring belongs in bootstrap,
without a DI container.

## Domain and application model

Workspace is the operation context, not an aggregate containing every object.
An Action includes its owner reference, outgoing dependencies and state-related
values. Independent View instances reference reusable Markdown definitions;
instance identity, explicit placement and order are not fields on Action.

Domain operations express intent and validate transitions rather than accepting
arbitrary replacement. Application loads related facts through purpose-specific
ports and domain evaluates them; domain objects never fetch their dependencies.
Cross-object coordination must preserve the transaction boundary below.

Do not start with a generic Repository<T> or use-case framework. Replacing
persistence also needs equivalent query/transaction behavior and a data migration;
interfaces alone do not make it automatic. An Inbox Item is a separate aggregate root with immutable ID/capture time
and literal plain-text content. CLI and HTTP capture/edit/resolve/discard use application
ports and share current-data/event transactions, independently of Action/View
reconciliation. Consumption removes the current item while preserving history.

## Execution and persistence

CLI directly invokes the shared application library in its own process and must
work without the web server. HTTP invokes the same use cases. Both use one local
SQLite database per Workspace, located inside it by default. This local placement
is an implementation choice, not a general OWF restriction.

Use node:sqlite and parameterized SQL, without an ORM. Its isolation and pinned
Node runtime retain the accepted trade-off of avoiding a separate native npm
driver on Windows. The current store is schema 10, initialized and validated by the
SQLite adapter. Unsupported versions fail without mutation or replacement;
implicit migrations during reads, writes or repeat initialization are forbidden.
Compatibility and migrations need a separately agreed design. The original
no-migration rationale is in [0003](increments/0003-action-create-get.md).

Calls are synchronous. Keep queries and transactions short, with bounded lock
waiting. CLI and server access must not corrupt the store. HTTP Action edits
already compare expected snapshots inside write transactions; advanced conflict
merging remains deferred.

Operational data and its Operational Event Log entries commit in one transaction.
Action writes reconcile affected View placement/order and dependent routing in
that transaction; failed operations leave no partial data or events. View reads
obtain Action projections, placements and order from one read-only store snapshot.
Do not imply a consistent snapshot across SQLite and externally edited Markdown.

Markdown remains authoritative for Projects, Outcomes, Knowledge and reusable
View definitions. Read it through ports for owner validation and definitions.
Operational Inbox Items, Actions, View instances and their organization/history belong in the
store. An unavailable store is an error, never an empty Workspace. Retain the
MVP's paused-write backup/restore requirement. No event sourcing, broker,
correlated dual logs or distributed transactions are introduced.

## View evaluation and write command boundary

Current CLI supports instance creation, inventory, configuration reads, read-only
evaluation, moves, positional order and deletion. HTTP and web expose inventory,
display, shared Action editing, View moves/reordering and creation in ordinary
columns. View-instance deletion remains CLI-only. Default Kanban is not a stored
View instance. The [Views profile](../../../docs/design/views-profile-notes.md)
owns the full contract; the following locates current implementation boundaries.

Definitions are data, not executable filters, sorting functions or transition
hooks. Domain owns validation, eligibility, unique routing, move effects and
instance/column-local manual order. Application obtains current facts through
ports; adapters and React do not independently implement routing semantics.

Evaluation retains eligible placement, otherwise applies blocked/state routing.
All Workspace Actions are candidates; Default-board filters do not narrow Views.
Every configured column remains visible. Current placement/order reads are
write-free: continuing entries retain order, unrecorded arrivals append by ID,
and the next relevant write records evaluated organization. Removed referenced
column IDs fail explicitly. Reads do not remember unobserved arrival chronology.

Writes evaluate the complete candidate/destination before commit. Cross-column
ordinary moves use the destination default; entering Blocked preserves state and
requires/reuses a manual reason, while leaving requires resolved dependencies
and clears the manual reason. Same-column positional movement preserves Action
data and placement; same-position requests are write-free. Placement/order-only
writes do not update Action timestamps or invent Action events.

Reconciliation includes affected instances and potential arrivals. A required
broken definition rejects the whole transaction with context; content changes
can skip instances proven unrelated. Pure reordering examines only the selected
instance. New instances record initial ID order; later writes append arrivals
while retaining continuing members. Independent instances organize shared Actions.

Creation in an ordinary View column derives its default state and verifies the
current definition precondition, then commits Action, placement, order and events
together. Blocked-column creation is not supported. Global Action deletion rejects
surviving incoming dependencies, including terminal referrers, and cleans up all
organization atomically. View deletion removes its instance/organization without
loading the definition or deleting Actions. Historical events survive deletion.

## Browser read and write lifecycle

The browser starts in Default Kanban. Workspace retains that board and its filter
drafts while a selected View mounts its own lifecycle. Hidden Default-board reads
and drag sensors are suspended. API-client creation/deletion events update retained
board data; see the [code map](code-map.md#nonlocal-effects-to-inspect) for producers
and consumers.

Manual Refresh and coalesced return-to-tab reads obtain current data and View
inventory. There is no polling or push channel. Superseded responses cannot
replace newer confirmed data or publish obsolete errors. Confirmed Action
snapshots and server-confirmed filter membership are separate concerns.

View gestures and required Blocked-reason input freeze reads and queue refresh.
Navigation guards cover forms, pending moves and drafts, including modal selectors.
Pointer, touch and keyboard movement preserve native text selection and focus.
Retained stale View content disables movement and saves until refresh succeeds.

Successful Action mutations are silent. Failures use one transient floating
notification on the active surface, including native dialogs. Validation stays
beside fields; persistent stale/uncertain indicators and recovery restrictions
outlive notification expiry. Confirmed writes followed by failed refreshes remain
confirmed writes and must not be repeated. Mutations are never retried automatically.
See [0030](increments/0030-quiet-web-feedback.md) for the feedback contract and
[UI test discipline](development-guidelines.md#tests-and-acceptance-criteria).

Workspace owns `useInbox` and retains one `Inbox` outside both board components.
Its permanent capture/toggle and independently scrolling list occupy a left panel
on wide screens and a bounded region above the board on narrow screens. Hiding
the list changes the Workspace grid to a compact capture strip above a full-width
work surface, releasing list height on narrow screens. CSS rearranges the retained
components without remounting capture or boards or initiating board reads. The board scrolls
inside its own work surface; its header and horizontal columns retain their behavior.
Inbox visibility is an optional localStorage preference keyed by canonical Workspace
root within the browser origin, never store data. A lightweight Workspace identity
endpoint supplies the server-bound root independently of Inbox/board reads; Inbox
responses also supply identity as a fallback. Storage failure falls back to session state.

`useInbox` owns a separate read generation and pending-write guard. Manual refresh,
opening a hidden list and coalesced focus/visibility events read only Inbox; hidden
lists skip automatic return reads. Writes invalidate older reads, retain confirmed
item snapshots/removals across failed follow-up reads and never retry mutations.
Unknown outcomes preserve drafts and block writes until an explicit successful
refresh and user inspection. Native detail dialogs guard unsaved edits and pending
writes, preserve text across refresh/external consumption and restore focus to the
originating row or permanent capture field. Editors compare retained baselines
with refreshed item text; known external replacements block saves and consumption
until explicitly reconciled, even if a later read fails. Narrow layout bounds the
list independently of the capture area's intrinsic height; low-height board headers
keep navigation compact so cards remain reachable below it. Inbox HTTP callbacks use shared
application Inbox operations and Workspace validation without Action/View evaluation.
See [0036](increments/0036-web-inbox.md) for Inbox behavior and
[0037](increments/0037-inbox-layout.md) for the revised layout and verification.

## Application technologies

| Area             | Current decision and rationale                                        |
| ---------------- | --------------------------------------------------------------------- |
| Core             | Plain TypeScript; no application framework or DI container            |
| Persistence      | node:sqlite; embedded and supplied with the pinned Node runtime       |
| HTTP             | Fastify; thin adapter, loopback hosting and test facilities           |
| CLI              | Commander.js; commands, options and help                              |
| Input validation | Zod; boundary schemas and inferred transport types                    |
| Browser          | React + Vite; local component state, production assets and dev server |
| Drag and drop    | dnd-kit; mouse, touch and keyboard movement                           |
| Styling          | CSS Modules                                                           |
| HTTP client      | Native fetch in a shared frontend client                              |
| Metadata         | yaml frontmatter, commonmark parsing and Node filesystem APIs         |

Zod checks external shapes, not OWF business rules. Keep shared transport schemas
in contracts, not a second handwritten HTTP schema set. Domain does not depend on
Zod; every caller uses the same domain rules.

Production Fastify serves API and built frontend assets on 127.0.0.1. Vite is
development-only, with a local API proxy. Same-origin JSON writes use Host/Origin
checks and strict request shapes. CLI JSON is machine-readable; diagnostics go
to stderr with consistent exit codes and noninteractive behavior.
Exact endpoint shapes and user operations are documented in the [tool README](../README.md).

## Navigation

Current browser selection uses component state, starts at Default Kanban after
reload and offers independent stored View instances. No React Router dependency
or dedicated board/Inbox/Action URL routing is implemented. The tool does not
render or edit Markdown; MarkdownObjectReference remains a Workspace-rooted URL
plus optional ID, with its agreed consistency rules.

Planned Windows protocol navigation accepts owf:action:<id> without a Workspace
parameter and derives Obsidian URLs at the navigation boundary. One registered
Workspace would be selected automatically, multiple would require selection, and
none would offer registration. Never infer the Workspace from handler working
directory. Handler installation and its server discovery/startup/selection
lifecycle are deferred; this describes the agreed direction, not delivered code.

## Open details and next gate

Deferred implementation includes Workspace registration,
Windows URI dispatch and explicit browser URLs (React Router remains the planned
routing choice when those URLs are implemented). Other deferred work includes
Action archiving, View editing in the browser, Snapshots, broader View capabilities,
Markdown-ID lookup, advanced concurrency, migrations, backup/restore tooling,
LAN hosting and distribution packaging. Implement only a separately agreed scope.

The Inbox processing contract is a sequence of individual operations:
resolve after intended results succeed; later failures do not roll back earlier
results. No Inbox aggregate is embedded in Workspace.

Physical schema, ID encoding, current CLI/API contracts, the loopback serve command,
HTTP-local-access checks and pinned dependency versions are already implemented;
they are not open foundational tasks. The [increment index](increments/README.md)
records delivery and the next agreed increment rather than a stale first-increment gate.

## Historical delivery decisions

These notes explain the sequence; earlier schema numbers and read-only phases
are historical, not the current feature set. Detailed contracts, rationale and
verification stay with the linked increments.

| Increment                                               | Decision and resulting boundary                                                                                                                                                                           |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0020](increments/0020-view-instance-cli-foundation.md) | Introduced validated Markdown definitions and independent operational instances, avoiding generic capability/parameter machinery.                                                                         |
| [0021](increments/0021-view-evaluation-cli.md)          | Added read-only evaluation with deterministic ID fallback and no read-side repairs; schema 6 predates placement/order.                                                                                    |
| [0022](increments/0022-web-view-display.md)             | Shared evaluation supplies complete Action projections in one result, avoiding per-card reads and a second Action snapshot. Retained Default Kanban preserves filters.                                    |
| [0023](increments/0023-view-move-cli.md)                | Schema 7 added explicit placement and atomic Action/placement/event reconciliation. Placement is instance-local, not Action data; same-column requests originally remained write-free.                    |
| [0024](increments/0024-view-order-cli.md)               | Schema 8 added order separately from placement, append-on-arrival and coherent read snapshots; pure reorders preserve Action data and do not pin inferred cards.                                          |
| [0025](increments/0025-web-view-moves.md)               | Added web movement and insertion regions without sacrificing text selection, touch scrolling, keyboard/focus handling or authoritative server ordering.                                                   |
| [0027](increments/0027-delete-action-view-cli.md)       | Schema 9 added deletion events and retained historical identities while keeping live organization references constrained. Deletion does not require routing evaluation.                                   |
| [0028](increments/0028-web-action-create-delete.md)     | Added ordinary-column creation and global web deletion using shared transactions, definition preconditions and retained-board notifications.                                                              |
| [0029](increments/0029-workspace-agent-guidance.md)     | Replaced a growing generated entry point with compact instructions and offline topic guides; repository development guidance has a different audience.                                                    |
| [0030](increments/0030-quiet-web-feedback.md)           | Separated temporary operation feedback from persistent recovery state, preserving confirmed writes across refresh races and failures.                                                                     |
| [0035](increments/0035-inbox-cli.md)                    | Schema 10 adds literal-text Inbox Items and atomic capture/update/resolve/discard events. Explicit consumption is independent of resulting work operations; browser Inbox and migrations remain deferred. |
| [0036](increments/0036-web-inbox.md)                    | Adds shared Inbox HTTP operations and a retained browser panel with permanent capture, optional list visibility and independent read/write recovery. Schema 10 remains unchanged.                         |

Earlier full-profile discussion included Blocked-column creation, configurable
state choice and Snapshot capture; those broader capabilities remain deferred.
The simplified data-driven View model replaced a proposed generic capability
framework to limit complexity; revisit extensibility only for a concrete need.
The original decisions are retained in the [Views profile](../../../docs/design/views-profile-notes.md)
and owning increments, not treated as permission to implement the full profile.

## Technology references

- [Node SQLite](https://nodejs.org/api/sqlite.html)
- [Fastify](https://fastify.dev/docs/latest/)
- [Commander.js](https://github.com/tj/commander.js)
- [Zod](https://zod.dev/)
- [React with Vite](https://react.dev/learn/build-a-react-app-from-scratch)
- [React Router (deferred)](https://reactrouter.com/start/declarative/installation)
- [dnd-kit](https://dndkit.com/)
- [yaml](https://eemeli.org/yaml/)
