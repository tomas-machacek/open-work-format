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
cards marked not current; use Retry. Drag cards to change state; use the CLI
to edit their content, owner or waiting reason.

## Basic operations

Initialize an existing directory (repeat init preserves the existing Workspace):

\`\`\`sh
owf init --title "My work"
owf create project --title "Kitchen" --slug kitchen --json
owf create outcome --title "Design approved" --owner /_projects/kitchen/ --expected-result "The kitchen design is approved." --slug approved-design --json
owf create action --title "Call the supplier" --json
owf create action --title "Confirm delivery" --owner / --description "Check the delivery date."
owf create action --title "Wait for HR" --state waiting --waiting-for "HR reply" --json
owf create action --title "Finished call" --state completed
owf get action {id}
owf get action owf:action:{id} --json
owf set action {id} --state waiting --waiting-for "Supplier reply" --json
owf set action {id} --state waiting --waiting-for "New reply date"
owf set action {id} --title "Call supplier" --description "Confirm date" --owner /_projects/kitchen/
owf set action {id} --owner / --clear-description
owf set action {id} --clear-waiting-for
owf list actions --state open --state waiting --owner /_projects/kitchen/ --recursive --json
owf set action {id} --state completed
owf set action {id} --state open
owf list actions --json
owf list actions --owner / --json
owf list actions --owner /_projects/kitchen/ --json
owf list actions --owner /_projects/kitchen/ --recursive --json
owf list actions --search "delivery" --owner /_projects/kitchen/ --recursive --state open --state waiting --json
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

Actions default to open. Supply --state once to create directly in open,
in_progress, waiting, completed or cancelled. Comma-separated states are invalid.
With waiting, optional --waiting-for (supplied once) gives a nonblank literal reason; it is
invalid with other states, including implicit open. Creation saves the state and
reason with one action.created event atomically. Refresh the board to see it.
Their owner is the explicit --owner when supplied,
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

Set action accepts any combination of --title, --description, --owner, --state and
--waiting-for. At least one change option is required. --title is trimmed and
single-line; --description stores literal Markdown (even an empty string), while
--clear-description removes it. --owner / selects the Workspace; any supplied
Project/Outcome owner is checked against its full Markdown ancestry. Omitting
--owner preserves the stored URL even if its Markdown directory is gone. An
Action in any state may be edited. --state accepts open, in_progress, waiting,
completed and cancelled, including reopening terminal Actions. --waiting-for
requires the resulting waiting state; --clear-waiting-for removes the reason
while staying waiting. Leaving waiting clears the reason automatically.
Contradictory and repeated scalar options are rejected. An identical request
returns unchanged without a timestamp or event; one real update commits one
Action and event together. State/reason-only edits emit action.state_changed;
content or owner edits emit action.updated. Clock rollback rejects real edits.

Repeat --state on list actions to match any listed state without duplicates,
combined with the owner scope. Comma-separated states are invalid. Without this
filter, completed and cancelled Actions are included. Get and list are read-only.
Archive, dependencies and derived blocking are not implemented.

This tool requires schema 4. Older stores are refused without migration or
mutation. For this PoC, initialize a fresh disposable directory with owf init;
never reset or replace an existing store. Existing user guidance stays untouched.

Preserve existing files. Never recreate or repair a Workspace by overwriting
content. Projects and Outcomes are Markdown; Actions use the Operational Store.
Existing navigation indexes are preserved and may need manual updates. Existing
Workspace instructions are never refreshed automatically.
`;
