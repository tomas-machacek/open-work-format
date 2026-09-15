# OWF Tool MVP Scope

> Status: Agreed scope for the first tool MVP; non-normative.
> This document defines implementation scope, not additional OWF Core requirements.

## 1. Goal

Make daily Inbox capture and Action management practical for a human through a
local web interface and for an existing AI agent through a CLI. Keep Markdown
context accessible in Obsidian and preserve navigation between that context and
operational objects.

The MVP is a standalone local application. Its first Action interface is a
Kanban board; OWF itself does not prescribe Kanban or a particular application.

## 2. Application Boundary

- A web interface runs in a normal browser, independently of AI conversations.
- A CLI exposes the same operational capabilities to agents.
- Both interfaces use shared operation logic, validation, and one authoritative
  Operational Store per Workspace.
- Obsidian provides Markdown reading and editing.
- Existing AI products operate on the Workspace and invoke the CLI. The MVP
  does not implement an agent or require a particular AI product.

The first implementation uses local storage. This is an MVP choice, not a
restriction on OWF: the broader design also permits external storage.

## 3. Included Capabilities

### Workspace setup

Register an existing OWF Workspace directory, list registered Workspaces, and
select the active Workspace. Configure its local Operational Store and the
Obsidian vault mapping needed for navigation.

An unavailable store must be reported as unavailable, never interpreted as an
empty Workspace or silently replaced with a new store.

### Capture and Inbox

Provide a quick capture entry point with a choice between a new Inbox Item and
a direct Action. A short text is sufficient for an Inbox Item; a title is
sufficient for an Action. Inbox capture also accepts an optional URL. Other
locations, such as an email description or filesystem path, can be recorded
as text.

Provide Inbox listing, detail, editing, discard, and explicit resolution.
Processing happens through individual operations chosen by the user or agent.
Resolve an item only after the intended results have been created successfully.
If a later operation fails, earlier successful operations remain and the Inbox
Item remains unresolved.

Inbox capture does not require an owner or capture-context relationship.

### Actions

Support creation, reading, editing, state changes, owner changes, and archival
according to the existing Operational Store model.

- A title-only Action starts in `open` and belongs to the Workspace when no
  explicit owner or applicable context is supplied.
- Creation accepts an explicit owner even when the current context is different.
  Explicit owner selection takes precedence over contextual defaults.
- Project and Outcome selection must be quick and searchable.
- Support the agreed waiting reason, manual blocking reason, and dependencies
  on Actions and Outcomes.
- Show derived blocking and its reasons separately from intrinsic state.
- Keep Action identity stable across title changes, owner changes, and archival.

Provide a Kanban board grouped by intrinsic state, card movement for valid state
transitions, Action detail, title search, and direct-owner and state filters.
Archived Actions remain retrievable and are excluded from ordinary active views
unless requested.

Board movement must apply the same state rules as the CLI. Card order does not
introduce priority or execution-order semantics.

### Human and agent access

Expose the supported Inbox and Action operations through the CLI, including
reading, listing, filtering, and discovering available owners. Provide
machine-readable output and clear errors suitable for an agent.

GUI and CLI operations must have equivalent capabilities and validation.
The GUI must reflect changes made through the CLI; simple refresh or polling
is sufficient for the MVP.

### Navigation

From an Action, open its owner or a referenced Markdown document in Obsidian.
Store Markdown references using the agreed `MarkdownObjectReference` model:
Workspace-rooted `url` and optional `id`. Derive the Obsidian navigation URL
at the application boundary.

From Markdown, support opening the corresponding Action through
`owf:action:<id>` using a Windows URI handler and the web application.

The handler chooses the Workspace as follows:

- One registered Workspace: select it automatically.
- Multiple registered Workspaces: offer a selection.
- No registered Workspace: offer Workspace registration.
- Action absent in the selected Workspace: explain the failure and allow
  choosing another Workspace.

The URI does not include a Workspace parameter in this iteration. The handler
must not infer the Workspace from its process working directory.

A Markdown document can link back to an Action using this URI. Automatic
insertion of links or a generated backlinks interface is not required.

### Persistence and basic reliability

Use the minimum Operational Event Log already described in the design notes.
No unified log, correlation IDs, event-sourcing architecture, or dedicated
history browser is required.

Each operation on one object must either save a complete valid result or leave
that object unchanged. Report failures clearly. Multi-object processing is a
sequence of separate operations, not an all-or-nothing transaction.

Provide a documented backup and restore procedure with writes paused, consistent
with the existing storage design. Advanced concurrent-edit handling is deferred.

## 4. Explicitly Outside the MVP

- Screenshots for both Inbox Items and Actions, including capture, attachment
  management, and copying images into Markdown. These are nice-to-have future
  capabilities; existing screenshot design notes do not make them MVP requirements.
- A custom Markdown renderer, editor, or file browser.
- An Obsidian plugin or embedded GUI inside an AI conversation.
- An AI agent, LLM integration, or custom agent harness.
- An MCP interface; local agent access uses the CLI.
- Cloud storage implementations and synchronization.
- Advanced concurrent editing, conflict detection, and conflict merging.
- Automated multi-object Inbox processing, bulk operations, and automations.
- A general View editor, automated Review or Planning, and View Snapshots.
- A dedicated Event Log browsing interface.

## 5. Acceptance Scenarios

The MVP is usable when the following flows work end to end:

1. Capture a thought as an Inbox Item with minimal interruption, or create an
   Action directly and quickly select its owner.
2. Process an Inbox Item through individual operations and explicitly resolve
   it once its intended results are safely stored.
3. Manage Actions on the board, inspect waiting or blocking reasons, and
   complete or archive them under the agreed state rules.
4. Open an Action's Outcome or Project in Obsidian and edit its Markdown there.
5. Let an external agent inspect and update the same Actions through the CLI,
   then see those updates in the web interface.
6. Follow an `owf:action:<id>` link from Markdown to the correct Action after
   automatic Workspace selection or explicit selection when needed.
7. Attempt an invalid operation and receive an understandable error without
   partially changing the affected object.
8. Restore a Workspace's operational data using the documented backup procedure.

None of these scenarios requires screenshot support.

## 6. Candidate Implementation Slice

The following remains a candidate, not the agreed first increment. The first
increment and its acceptance criteria will be selected after architecture and
development decisions have been recorded and checked.

A possible complete path is: register a Workspace, create an Action through the
CLI, display it in the web interface, change its state in the GUI, verify the
result through the CLI, and exercise navigation to Markdown and back.

Then expand to the remaining capabilities above. This slice establishes the
shared operational logic and cross-application navigation before broader UI work.

The agreed technology stack and structural decisions are recorded in the
[Tool Architecture](../../tools/owf/docs/architecture.md). The physical store
schema, exact CLI syntax and URI handler lifecycle details remain open
implementation decisions.

## 7. Related Design Documents

- [Tool Architecture](../../tools/owf/docs/architecture.md)
- [Development Guidelines](../../tools/owf/docs/development-guidelines.md)
- [Design Principles](principles.md)
- [Operational Store Design Notes](operational-store-notes.md)
- [Representation Profile Design Notes](representation-profile-notes.md)

The existing logical model and operation rules remain the design baseline.
This document identifies the subset and application experience to deliver first;
it does not remove deferred capabilities from the broader OWF design.
