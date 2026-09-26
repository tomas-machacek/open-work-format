export const workspaceGuide = `# Workspace agent guide

This directory is the OWF Workspace. Commands discover the Workspace and current
Project/Outcome context from the working directory. Actions are stored in the
Workspace Operational Store. The CLI must be installed on
PATH, or invoked as node followed by its built dist/bootstrap/cli.js entry point.
Use owf --help and command --help to inspect supported options.

## Read-only browser board

Run \`owf serve\` inside this Workspace and open http://127.0.0.1:4317.
Use \`owf serve --port 4318\` if the default port is occupied. Keep the process
running; Ctrl+C stops it. The tool must have been built, including web assets.
The board refreshes on return to its tab or with Refresh. Failed reads retain
cards marked not current; use Retry. All changes still use the CLI.

## Basic operations

Initialize an existing directory (repeat init preserves the existing Workspace):

\`\`\`sh
owf init --title "My work"
owf create project --title "Kitchen" --slug kitchen --json
owf create outcome --title "Design approved" --owner /_projects/kitchen/ --expected-result "The kitchen design is approved." --slug approved-design --json
owf create action --title "Call the supplier" --json
owf create action --title "Confirm delivery" --owner / --description "Check the delivery date."
owf get action {id}
owf get action owf:action:{id} --json
owf set action {id} --state waiting --waiting-for "Supplier reply" --json
owf set action {id} --state waiting --waiting-for "New reply date"
owf list actions --state open --state waiting --owner /_projects/kitchen/ --recursive --json
owf set action {id} --state completed
owf set action {id} --state open
owf list actions --json
owf list actions --owner / --json
owf list actions --owner /_projects/kitchen/ --json
owf list actions --owner /_projects/kitchen/ --recursive --json
\`\`\`

Inside a Project or Outcome, create an Outcome using the nearest owner:

\`\`\`sh
cd _projects/kitchen
owf create outcome --title "Materials selected"
\`\`\`

An explicit --owner always overrides current context. Owners are Workspace-rooted
directory URLs beginning and ending with /, not native filesystem paths. Encode
special characters in URL segments. Outcomes need a Project or Outcome owner;
Projects always go under /_projects/. --slug sets the directory name; otherwise it
is derived from the title. --expected-result defaults to the Outcome title.
--json emits one machine-readable result, including warnings or errors.

Actions start open. Their owner is the explicit --owner when supplied,
otherwise the nearest Project or Outcome in the current directory ancestry,
otherwise this Workspace (URL /). An explicit --owner / always selects the
Workspace. Action descriptions may contain Markdown and newlines. Copy the
returned UUID or owf:action:<uuid> URI to retrieve the Action from any directory
inside its Workspace. --json emits one machine-readable result or error.
In command examples, {id} is a placeholder: replace it with the UUID returned
by create; do not pass the braces or placeholder text literally.

\`list actions\` returns every Action in the discovered Workspace, regardless of
the current directory. \`--owner /\` selects Actions directly owned by the
Workspace. An owner URL without \`--recursive\` selects only Actions directly
owned by that Workspace, Project or Outcome. Add \`--recursive\` to include
Actions whose stored owner URLs are beneath the selected URL, including nested
Outcomes. This uses stored references and complete path segments; moving or
removing an owner directory does not repair or change an Action's stored owner.
A valid filter with no matches succeeds with an empty list. \`--recursive\`
requires \`--owner\`.

State changes accept open, in_progress, waiting, completed and cancelled,
including reopening terminal Actions. --waiting-for is optional, literal and
nonblank, and only valid with --state waiting. While already waiting, supplying
it replaces the reason; omission keeps it. Leaving waiting clears the reason.
An identical request returns unchanged with no new timestamp or event; a real
change returns updated and commits the Action and its event together. State
changes fail without writing if the system clock precedes Action creation;
correct the clock and retry. Identical requests still succeed unchanged. State
changes preserve identity, ownership and creation time, even if the Markdown
owner disappears. Clearing a reason while staying waiting is not supported.

Repeat --state on list actions to match any listed state without duplicates,
combined with the owner scope. Comma-separated states are invalid. Without this
filter, completed and cancelled Actions are included. Get and list are read-only.
Archive, dependencies and derived blocking are not implemented.

This tool requires schema 3. Older stores are refused without migration or
mutation. For this PoC, initialize a fresh disposable directory with owf init;
never reset or replace an existing store. Existing user guidance stays untouched.

Preserve existing files. Never recreate or repair a Workspace by overwriting
content. Projects and Outcomes are Markdown; Actions use the Operational Store.
Existing navigation indexes are preserved and may need manual updates. Existing
Workspace instructions are never refreshed automatically.
`;
