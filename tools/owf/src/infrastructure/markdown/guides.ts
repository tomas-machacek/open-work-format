import { stringify } from 'yaml';

const workspace = `## Layout, authority and navigation

README.md holds Workspace metadata, index.md navigation, log.md Markdown history,
AGENTS.md agent integration instructions, and _store/owf.sqlite the default store.
Projects and Outcomes provide authoritative Markdown work context. Knowledge and
reusable View definitions are Markdown. Actions, independent View instances,
their placement/order and operational history are authoritative in the store.

Projects live under _projects/; Outcomes nest under Projects or other Outcomes.
_knowledge/ contains Knowledge Documents, including these guides in
_knowledge/owf/. _views/ holds reusable definitions. Directory index.md files
provide navigation and are not Concept documents.
Start at [Workspace navigation](/index.md).

## Context and ownership

Commands discover the Workspace from the working directory. Creation uses the
nearest Project/Outcome unless --owner overrides it. Actions fall back to the
Workspace (/); Outcomes require a Project or Outcome. Projects always go under
/_projects/. Choose owners whose work an Action meaningfully advances.

Owners are Workspace-rooted directory URLs beginning and ending with /.
Use forward slashes even on Windows and encode special characters in segments,
for example /_projects/My%20project/. They are not native filesystem paths.

\`\`\`sh
owf create project --title "Kitchen" --slug kitchen --json
owf create outcome --title "Design approved" --owner /_projects/kitchen/ --expected-result "The kitchen design is approved." --slug approved-design --json
cd _projects/kitchen
owf create outcome --title "Materials selected"
\`\`\`

--slug sets the directory name; otherwise it is derived from the title.
--expected-result defaults to the Outcome title. Outcomes express results and
are not automatically achieved when all known Actions finish. This CLI creates
their Markdown context but has no Outcome lifecycle transition commands.
Listing Actions and evaluating Views do not narrow to the current directory.
Use explicit owner filters. Moving/removing owner directories does not repair
stored Action references; preserve identity and inspect affected links.

## Initialization and recovery

\`\`\`sh
owf init --title "My work"
\`\`\`

Fresh init requires an existing directory outside any Workspace. Repeat init
discovers and validates an existing Workspace without changing anything,
refreshing or backfilling absent guides. Older retained AGENTS.md files may lack
new topic links.

Fresh init rejects collisions with README.md, root index.md, log.md, AGENTS.md or
_store, including empty store directories. Existing physical Knowledge directories
can be used; existing topic files and Knowledge indexes are preserved with
warnings identifying retained content and manual navigation work. Unsafe path
collisions fail. Never overwrite user guidance or navigation.

Unavailable storage is an error, not an empty collection. Unsupported schemas
are refused without mutation or migration. Keep the original Workspace intact,
inspect diagnostics and use a separate disposable directory for experiments.
Never reset or replace a store to bypass errors. There is no documentation
refresh, force-overwrite, migration or upgrade command.

AGENTS.md is an integration artifact outside the Knowledge envelope. The
knowledge/document subset targets OKF compatibility; the whole tree including
AGENTS.md is not a strict OKF bundle.
See [Actions](actions.md), [Views](views.md) and [deletion](deletion.md).
`;

const actions = `## Create and retrieve

\`\`\`sh
owf create action --title "Call the supplier" --json
owf create action --title "Confirm delivery" --owner / --description "Check the delivery date."
owf create action --title "Wait for HR" --state waiting --waiting-for "HR reply" --json
owf create action --title "Finished call" --state completed
owf get action {id}
owf get action owf:action:{id} --json
\`\`\`

Replace {id} with a returned UUID without braces. Stable owf:action:UUID identity
survives rename, state and owner changes inside this Workspace. Descriptions
support literal Markdown/newlines. --json provides machine-readable results and
errors; installed help owns syntax.

Actions start open unless --state selects open, in_progress, waiting, completed
or cancelled. Creation uses [owner context](workspace.md); explicit --owner
overrides it and --owner / selects the Workspace.
Archival and Outcome dependency targets are not implemented.

## Find work

\`\`\`sh
owf list actions --json
owf list actions --owner / --json
owf list actions --owner /_projects/kitchen/ --json
owf list actions --owner /_projects/kitchen/ --recursive --json
owf list actions --search "delivery" --owner /_projects/kitchen/ --recursive --state open --state waiting --json
\`\`\`

Lists cover the Workspace, regardless of working directory. --owner matches
direct ownership; --recursive requires --owner and includes descendant Outcomes.
Repeated --state flags match any selected state, combined with owner/search;
comma-separated states are invalid. Terminal Actions remain included unless
filtered out.

Search finds a literal case-insensitive substring in title OR description,
without ranking. Outer search whitespace is trimmed; diacritics remain significant.
Waiting/manual reasons, prerequisite titles, owner names and IDs are excluded.
No matches succeeds with an empty list; unavailable storage or malformed stored
data fails, even outside a filter.

## Edit and Waiting

\`\`\`sh
owf set action {id} --state waiting --waiting-for "Supplier reply" --json
owf set action {id} --state waiting --waiting-for "New reply date"
owf set action {id} --title "Call supplier" --description "Confirm date" --owner /_projects/kitchen/
owf set action {id} --owner / --clear-description
owf set action {id} --clear-waiting-for
owf set action {id} --state completed
owf set action {id} --state open
\`\`\`

Supply at least one change. A supplied owner is checked against its Markdown
ancestry; omission preserves its stored URL. Any state can be edited; terminal
Actions can be reopened. Clear a description explicitly or store literal text.
Waiting differs from blocking. Its optional nonblank literal reason requires
the resulting waiting state. Omission preserves a current reason; clearing keeps
Waiting, and leaving Waiting clears the reason.

Completion/cancellation enforce [manual-block rules](blocking-and-dependencies.md);
completion also requires satisfied prerequisites. Edits may reroute the shared
Action across [Views](views.md); broken required definitions can reject writes.
Read [permanent deletion](deletion.md) before irreversible global removal.
`;

const blocking = `## Direction and manual reasons

Use the dependent Action as the command ID and its prerequisite as the target.
The source **depends on** the target, including across Projects in this Workspace.

\`\`\`sh
owf set action {id} --manual-block "Missing production access"
owf set action {id} --add-dependency {prerequisite-id}
owf set action {id} --add-dependency {first-id} --add-dependency {second-id}
owf set action {id} --remove-dependency {old-id} --add-dependency {new-id}
owf set action {id} --clear-manual-block --state completed
\`\`\`

Replace placeholders with existing Action UUIDs or owf:action:UUID URIs.
All supplied targets must exist in this Workspace. Repeat add/remove flags for
several edges in one edit; duplicate adds and absent removals are unchanged.
Adding and removing the same target in one request fails. Self-dependencies and
cycles can be stored; no cycle linter is currently provided.

The manual reason is nonblank literal text independent of Waiting/execution
state. Omission preserves it; --clear-manual-block removes it. Clear it before or
together with entering completed or cancelled; terminal results cannot retain it.

## Derived blocking and completion

Only completed prerequisites satisfy dependencies. Cancelled, waiting, open and
in_progress targets remain unresolved. Blocking is separate from execution state;
Waiting alone does not block work.

Completion requires all remaining prerequisites satisfied; ACTION_BLOCKED reports
unresolved IDs. Complete prerequisites or explicitly remove obsolete edges, then
retry. Removing an obsolete edge and completing may be one edit. Cancellation
does not require satisfied dependencies.

Reopening a target changes derived blocking on the next read without changing
dependent states. Already completed sources still allow content edits and an
unchanged completed request. Get/list show State separately from Blocked; detail
shows prerequisite URIs, titles, states and satisfaction. Missing/corrupt
prerequisites fail reads rather than silently unblocking work.

[Browser detail](browser-board.md) edits manual reasons and searchable
Workspace-wide prerequisites in one Save/Cancel flow. Save a cleared manual block
before retrying a terminal board move. [View moves](views.md) into Blocked need a
manual reason and preserve state; leaving requires resolved prerequisites.
[Deleting a prerequisite](deletion.md) fails while another Action references it.
`;

const views = `## Define and instantiate

Views organize attention without owning Actions. A reusable Markdown definition
is shared; each instance has its own identity, title, placement and order.
Create _views/ and its index.md manually, link that index from the Workspace
index.md, and link definitions from _views/index.md. Nested grouping directories
also use index.md; indexes are not definitions.

Save this complete definition as _views/work-board.md:

\`\`\`markdown
---
type: OWF View Definition
title: Work board
owf:
  renderer: kanban
  purpose: focus
  columns:
    - id: new-actions
      title: New to organize
      status: open
    - id: todo
      title: Todo
      status: open
    - id: blocked
      title: Blocked
      type: blocked
    - id: active
      title: Active
      status: [in_progress, waiting]
      include_blocked: true
    - id: waiting-for
      title: Waiting for
      status: waiting
    - id: done
      title: Done
      status: completed
---

# Work board
\`\`\`

\`\`\`sh
owf create view --definition /_views/work-board.md --title "My work" --json
owf list views --json
owf get view {view-id} --json
owf create action --title "Read the brief" --json
owf show view {view-id}
owf show view {view-id} --json
\`\`\`

Replace {view-id} with the instance UUID and {id} below with the Action UUID.
Definition URLs are Workspace-rooted even from descendants; use forward slashes
and URL encoding, such as /_views/My%20board.md. Each create makes an independent
instance. Optional owf.id identifies the definition and is checked, never repaired.
Get reads configuration; list inventories even broken references; show evaluates
all Workspace Actions with one-based positions per column. Empty columns stay
visible. Reads do not save changes or implicitly narrow to the working directory.

## Routing, placement and order

Eligible stored placements are retained. Otherwise blocked non-terminal Actions
prefer Blocked; otherwise the effective state default wins when eligible, then
the first eligible ordinary column. Ordinary columns accept blocked Actions only
with include_blocked: true. Waiting alone is not blocking. default_status defaults
to the first status; owf.defaults can choose the initial column for a state.
Display never changes actual Action state.
Unplaced Open Actions go to New to organize.

Placement/order belong independently to each instance. New instances start in
ascending Action ID order; continuing members retain order and new arrivals append.
Departure discards position; return is a new arrival. Reordering an inferred member
does not pin placement. Shared definition edits affect all referencing instances
on their next read without renaming them or changing Actions.

## Move and reorder

\`\`\`sh
owf move action {id} --view {view-id} --column todo --position 1 --json
owf move action {id} --view {view-id} --column blocked --reason "Missing access"
owf move action {id} --view {view-id} --column waiting-for --waiting-for "Odpoveď dodávateľa"
owf show view {view-id} --json
owf get action {id} --json
\`\`\`

CLI moves need no server. Ordinary cross-column moves apply the destination's
default state, shared across Views. Active above defaults to in_progress.
Entering Blocked preserves state and needs --reason or an existing manual reason;
dependencies alone do not supply one. Terminal entry fails. Leaving Blocked
requires resolved prerequisites and clears the manual reason. Between ordinary
columns manual blocking remains; shared terminal guards still apply.

--waiting-for is optional only for a cross-column ordinary destination defaulting
to waiting. Between Waiting columns omission preserves the reason; leaving
Waiting clears it. Use set action for reason-only edits.

--position N is the final one-based index after removing the card: 1..K within
its K-card column, or 1..K+1 on entry to K other cards. Omission appends on entry
and is a same-column no-op. Same-column requests preserve actual state and reject
both reason options. Invalid positions fail without clamping; current store facts
determine positions. Only the selected instance receives requested placement/order;
other instances retain independent organization while reflecting shared changes.

## Definition errors and recovery

Relevant writes reconcile membership/organization. Broken required definitions
can reject creation, edits or moves with instance/definition context. Reads never
repair data. Explicitly restore missing stable column IDs or correct the identified
Markdown definition before retrying; never silently alter configuration or reset
the store. Reverting a temporary incompatible edit before a relevant successful
write may restore a choice; a successful write while ineligible can discard it.
list views remains available.

The [browser](browser-board.md) supports View moves, ordering and creation in
ordinary columns. [Delete only an instance](deletion.md) through the CLI to
preserve Actions and the definition.
`;

const browser = `## Start and refresh

Run owf serve inside the Workspace and open http://127.0.0.1:4317.
Use owf serve --port 4318 if needed. Built web assets are required.
Keep the process running; Ctrl+C stops it. The server stays bound to its Workspace.

The page starts in Default Kanban. Display selects CLI-created View instances;
duplicate titles include IDs. A full reload returns to Default Kanban.
Refresh and returning to the tab reload data, definitions and inventory without
polling. Refresh after CLI changes; no server restart is needed.

Failed reads retain the selected board's last successful cards, marked stale.
Views disable creation, movement and detail saves until successful refresh.
This is not a global write lock: Default Kanban keeps creation and state moves
available, and both modes still offer deletion in detail. Refresh stale data
before deciding what to change or delete; server validation still applies.
Confirmed saves followed by failed refresh are reported separately: do not repeat
the save. Uncertain transport outcomes require refreshing before deciding what
happened. No writes retry
automatically. Missing instances/definitions show explicit errors; Default Kanban
remains selectable for a broken View.

## Default Kanban and detail

Default Kanban supports inline Add Action, state moves, title/description search,
owner and recursive filtering. These filters do not narrow Views; returning
restores in-page values. Click a card or focus it and press Enter for detail.
Edit content/owner, manual reasons and searchable Workspace-wide prerequisites
in one Save/Cancel flow. Save a cleared manual block before retrying a terminal
move. Edits affect the shared Action and can change membership across Views.

## Views: create and organize

Views display all configured columns and actual Action states. Column defaults
do not reinterpret states merely on display. Placement/order are instance-local.
Scroll horizontally when columns exceed the window.

Use + Add Action below an ordinary View column title to create there. The column
supplies its default state and the Action appends there. Blocked has no creation
control. You can select ownership; required definitions/shared validation can reject
creation. Cancel abandons the draft without creating an Action.

Drag from background/padding with a mouse; touch uses a brief hold while swipes
scroll. Text stays selectable and controls do not start drags. The thin insertion
line marks the destination; empty-column content accepts drops and free space
below the last boundary appends.

For keyboard movement, focus a card, press Space, use left/right for columns and
up/down for positions, then Space to drop or Escape to cancel. Home/End choose
first/last; Down beyond last appends. Enter opens detail.
Ordinary cross-column moves can change the shared Action state to the destination
default. Entering Blocked asks for a manual reason only when absent; cancel writes
nothing. Leaving needs resolved prerequisites and clears manual blocking. Waiting
never prompts. Same-column moves only reorder. Concurrent changes can change
neighbours; invalid positions fail. See [Views](views.md) and [blocking](blocking-and-dependencies.md).

Finish/cancel creation, dragging or reason input before switching boards.
Unsaved detail drafts need a discard decision; pending writes prevent navigation.
Refresh is queued during movement and required-reason input.

## Delete globally

Both modes expose Delete Action in detail with confirmation identifying the
Action and warning of permanent global removal and loss of unsaved edits.
Cancel preserves it; confirmation deletes it from every View.
Incoming dependencies reject deletion, including from
terminal Actions; the dialog reports referring Actions for explicit edge removal
or redirection. Refresh after confirmed deletion; do not repeat after refresh failure.

View-instance deletion remains CLI-only. There is no browser definition editor,
View-instance creation/deletion control, archive workflow or Snapshot capture.
Read [permanent deletion](deletion.md) for consequences.
`;

const deletion = `## Permanent and global

There is no undo, trash or force bypass. Inspect the target and dependencies first.
CLI deletion removes exactly one object without a confirmation prompt:

\`\`\`sh
owf create action --title "Disposable Action" --json
owf delete action {id}
owf create action --title "Another disposable Action" --json
owf delete action owf:action:{id} --json
owf delete view {view-id} --json
\`\`\`

Use real Action/instance UUIDs from creation/list results without braces.
Commands work from root/descendants without a server. Any other Action depending
on the target rejects deletion with ACTION_IN_USE, even for completed targets or
terminal/cross-owner dependents. Inspect reported URIs/titles and explicitly
remove or redirect those edges with set action on each dependent, using
--remove-dependency and optionally --add-dependency. Never silently discard an edge.

Outgoing/self-dependencies disappear with their source. Global Action deletion
removes its placement/order in every View; surviving cards retain relative order.
Historical events remain. Missing owners/broken definitions do not block deletion.
Markdown links/screenshots are not automatically cleaned up.

## Delete only an instance

Use an instance UUID from owf list views, not a title or definition path.
Deletion removes only that instance and its organization, preserving Actions,
dependencies, the shared Markdown definition and other independent instances.
It works with broken definitions. Default Kanban has no deletable instance ID.
View-instance deletion remains CLI-only.

[Browser detail](browser-board.md) offers confirmed global Action deletion in
both modes; CLI deletion is noninteractive, so confirm intent before running it.
Refresh after CLI changes. A selected View deleted elsewhere reports a missing
instance; select another board. Repeated deletion reports not found.
Unsupported schema/store errors never authorize resetting/replacing storage.
See [workspace recovery](workspace.md), [dependencies](blocking-and-dependencies.md)
and [Views](views.md).
`;

const topics = [
  [
    'workspace',
    'Workspace and owners',
    'Layout, context, owner URLs and safe initialization.',
    workspace,
  ],
  [
    'actions',
    'Actions',
    'Create, find, edit and change execution state or Waiting.',
    actions,
  ],
  [
    'blocking-and-dependencies',
    'Blocking and dependencies',
    'Manual blocks, prerequisites and completion guards.',
    blocking,
  ],
  [
    'views',
    'Views',
    'Definitions, instances, routing, moves and order.',
    views,
  ],
  [
    'browser-board',
    'Browser board',
    'Serve, refresh, create, edit, move and delete Actions.',
    browser,
  ],
  [
    'deletion',
    'Permanent deletion',
    'Global Action cleanup and instance-only View deletion.',
    deletion,
  ],
] as const;

export function workspaceGuides(version: string) {
  const snapshot = `Generated by OWF tool ${version}. This is an initialization snapshot, not
automatically synchronized reference material. This version identifies the tool,
not the Core or OKF specification. Use installed command --help for syntax.`;
  return [
    {
      path: '_knowledge/index.md',
      content:
        '# Index\n\n- [Workspace](../index.md)\n- [OWF guides](owf/index.md)\n',
    },
    {
      path: '_knowledge/owf/index.md',
      content: `# Index

${snapshot}

- [Knowledge navigation](../index.md)
- [Agent entry point](../../AGENTS.md)
${topics.map(([slug, title, description]) => `- [${title}](${slug}.md) — ${description}`).join('\n')}
`,
    },
    ...topics.map(([slug, title, description, body]) => ({
      path: `_knowledge/owf/${slug}.md`,
      content: `---\n${stringify({ type: 'OWF Knowledge Document', title, description })}---\n\n# ${title}\n\n${snapshot}\n\n${body}\n[All OWF guides](index.md) · [Agent entry point](../../AGENTS.md)\n`,
    })),
  ];
}
