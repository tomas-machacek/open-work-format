export const workspaceGuide = `# Workspace agent guide

This directory is the OWF Workspace. Commands discover the Workspace and current
Project/Outcome context from the working directory. The CLI must be installed on
PATH, or invoked as node followed by its built dist/bootstrap/cli.js entry point.
Use owf --help and command --help to inspect supported options.

## Basic operations

Initialize an existing directory (repeat init preserves the existing Workspace):

\`\`\`sh
owf init --title "My work"
owf create project --title "Kitchen" --slug kitchen --json
owf create outcome --title "Design approved" --owner /_projects/kitchen/ --expected-result "The kitchen design is approved." --slug approved-design --json
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

Preserve existing files. Never recreate or repair a Workspace by overwriting
content. Projects and Outcomes are Markdown; Actions and Inbox commands are not
available yet. Existing navigation indexes are preserved and may need manual
updates. Existing Workspace instructions are never refreshed automatically.
`;
