export const workspaceGuide = `# Workspace agent guide

Choose a topic before acting. Run commands inside the Workspace with an installed
\`owf\` on PATH, or Node followed by its built dist/bootstrap/cli.js entry point.
Use \`owf --help\` and command help, such as \`owf create action --help\`,
for supported syntax. The linked guides work offline.

## Authority and essential semantics

Projects and nested Outcomes provide Markdown work context under \`_projects/\`.
Knowledge in \`_knowledge/\` and reusable View definitions in \`_views/\` are
Markdown too. Actions, View instances, their placement/order
and operational history live in the Workspace Operational Store.

Choose meaningful ownership: an Action advances its owner's work. Outcomes
express results; finishing all known Actions does not automatically achieve an
Outcome. Outcome lifecycle commands are not currently implemented. Views organize
attention without owning Actions. Waiting is an execution state; blocking is
separate and comes from a manual reason or unresolved prerequisites.

Commands discover the Workspace from the working directory. Creation uses the
nearest Project/Outcome context unless \`--owner\` overrides it; Action creation
falls back to the Workspace owner \`/\`. Owner URLs start at the Workspace root
and end with \`/\`, including on Windows. Listing does not implicitly narrow to
the current Project/Outcome; supply an explicit owner filter.

Preserve user files and stable identity. Use supported operational interfaces;
never reset or replace a store to bypass an unsupported schema or repair errors.
Unavailable storage is an error, not an empty collection. Permanent deletion
has no undo; inspect dependencies and confirm intent before deleting.

## Start here

\`\`\`sh
owf create action --title "Read the brief" --json
owf list actions --json
owf serve
\`\`\`

Keep the server running and open http://127.0.0.1:4317; Ctrl+C stops it.
Use \`owf serve --port 4318\` if needed. Built web assets are required.
Replace example placeholders such as \`{id}\` with returned IDs.

## Read the relevant topic

- [Workspace and owners](_knowledge/owf/workspace.md): before creating Projects
  or Outcomes, choosing owners, navigating paths or handling initialization.
- [Actions](_knowledge/owf/actions.md): to create, find, edit or change execution
  state, including Waiting.
- [Blocking and dependencies](_knowledge/owf/blocking-and-dependencies.md):
  before adding prerequisites, blocking work or resolving a completion rejection.
- [Views](_knowledge/owf/views.md): to copy a definition, create an instance,
  understand routing, or move and order Actions.
- [Browser board](_knowledge/owf/browser-board.md): to use Default Kanban,
  Action creation in View columns, drag and drop, editing, refresh or deletion dialogs.
- [Permanent deletion](_knowledge/owf/deletion.md): before deleting an Action
  globally or a View instance.
- [Guide index](_knowledge/owf/index.md) and [Workspace navigation](index.md).

Guidance is an initialization snapshot. Repeat init does not refresh or backfill
it; preserve user edits. Each topic identifies its producing tool version.
`;
