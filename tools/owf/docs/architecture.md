# OWF Tool Architecture

> Status: Agreed implementation baseline, 2026-09-15. The first increment is complete.

## Purpose and authority

This document records how the first tool implements the
[MVP scope](../../../docs/design/mvp-scope.md). Its technology choices are not
requirements on other OWF implementations.

Domain semantics come from [Core v0](../../../spec/core-v0.md) and the agreed
[Operational Store design](../../../docs/design/operational-store-notes.md).
The MVP scope selects capabilities; it does not redefine their semantics.
[Development guidelines](development-guidelines.md) define engineering practice.
Unresolved conflicts must be reported rather than silently resolved by changing
the specification.

## Package and directory structure

Use one npm package and lockfile under tools/owf/. Keeping specification and
implementation together allows related changes to be reviewed together.
Separate packages are deferred until distribution or reuse needs justify them.

Planned layout; directories and abstractions are created only when needed:

| Path                              | Responsibility                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------- |
| src/domain/workspaces/            | Workspace metadata/name rules; no filesystem access                             |
| src/application/workspaces/       | Workspace initialization and discovery use cases                                |
| src/domain/actions/               | Action aggregate, value objects and domain rules                                |
| src/domain/inbox/                 | Inbox Item aggregate and rules                                                  |
| src/domain/references/            | Shared domain identifiers and references                                        |
| src/application/actions/          | Action use cases                                                                |
| src/application/inbox/            | Inbox use cases                                                                 |
| src/application/ports/            | Repositories, transactions, Markdown lookup, clock and ID generation interfaces |
| src/infrastructure/sqlite/        | SQL, mapping, migrations and repository/transaction implementations             |
| src/infrastructure/markdown/      | Reading Markdown objects and metadata                                           |
| src/infrastructure/configuration/ | Workspace configuration and registration storage                                |
| src/interfaces/cli/               | Argument parsing, use-case invocation and output                                |
| src/interfaces/http/              | HTTP requests, use-case invocation and responses                                |
| src/interfaces/uri/               | Incoming OWF URI handling and navigation coordination                           |
| src/contracts/                    | Transport schemas and types, without domain rules                               |
| src/bootstrap/                    | Entry points and concrete dependency wiring                                     |
| src/web/                          | Browser UI and API client                                                       |
| tests/acceptance/features/        | Gherkin acceptance scenarios                                                    |
| tests/acceptance/steps/           | Scenario bindings to application operations                                     |
| tests/integration/                | Technical integration tests                                                     |
| tests/e2e/                        | CLI process and browser journeys                                                |
| tests/support/                    | Small genuinely shared test fixtures                                            |
| scripts/                          | Portable development/release support when needed                                |

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

Use node:sqlite, parameterized SQL and simple versioned migrations, without ORM.
Node 24's SQLite API is Release Candidate: this trade-off is accepted for the
MVP in exchange for avoiding a separate native npm driver on Windows. Pin the
runtime and isolate the API in the SQLite adapter.

Database calls are synchronous. Keep queries and write transactions short and
bound lock waiting. Normal access by CLI and server must not corrupt the store.
Advanced stale-edit detection and conflict merging remain deferred.

An application operation saves the affected object and its Operational Event
Log entry in one transaction. Failed operations do not leave partial changes.
This transaction does not extend to externally edited Markdown documents;
do not imply a consistent snapshot across the filesystem and SQLite.

Inbox processing remains a sequence of individual operations. Resolve only after
the intended results succeed; a later failure does not roll back earlier results.
No event sourcing, broker, correlated dual logs or distributed transactions.

Markdown remains authoritative for Projects, Outcomes and Knowledge. Read it
through a separate port to validate owners and obtain Outcome dependency facts.
An unavailable store must be reported, never treated as empty or silently replaced.
Retain the paused-write backup/restore requirement in the MVP scope.

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
| Metadata         | yaml package for YAML frontmatter; Node filesystem APIs                |

Zod checks external shapes, not OWF business rules. Keep transport schemas in
contracts where shared. Do not maintain a second handwritten HTTP schema set.
The domain does not depend on Zod. The same domain rules apply to all callers.

The browser imports contracts, not application code or domain entities.
After a mutation, display the actual accepted result or explain failure.
Polling while the UI is open and refresh on window focus reveal CLI changes;
the polling interval is an implementation detail.

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
