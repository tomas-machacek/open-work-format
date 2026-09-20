export const workspaceGuide = `# Workspace agent guide

This directory is the OWF Workspace. Commands discover the Workspace and current
Project/Outcome context from the working directory. Actions are stored in the
Workspace Operational Store. The CLI must be installed on
PATH, or invoked as node followed by its built dist/bootstrap/cli.js entry point.
Use owf --help and command --help to inspect supported options.

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

Preserve existing files. Never recreate or repair a Workspace by overwriting
content. Projects and Outcomes are Markdown; Actions use the Operational Store.
Existing navigation indexes are preserved and may need manual updates. Existing
Workspace instructions are never refreshed automatically.
`;
