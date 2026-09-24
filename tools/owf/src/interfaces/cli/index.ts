import { Command, CommanderError } from 'commander';
import {
  initOptions,
  createOptions,
  createActionOptions,
  listActionsOptions,
} from '../../contracts/index.js';
import type {
  ContextInput,
  CreateResult,
} from '../../application/contexts/index.js';
import {
  WorkspaceError,
  type WorkspaceResult,
} from '../../application/workspaces/index.js';
import type {
  ActionInput,
  ActionResult,
  ListActionsInput,
  ListActionsResult,
} from '../../application/actions/index.js';

export function runCli(
  argv: string[],
  version: string,
  initialize: (title: string | undefined) => WorkspaceResult,
  create: (input: ContextInput) => CreateResult,
  createAction: (input: ActionInput) => ActionResult,
  getAction: (identifier: string) => ActionResult,
  listActions: (input: ListActionsInput) => ListActionsResult,
): void {
  let json = false;
  const program = new Command()
    .name('owf')
    .description(
      'Initialize an OWF Workspace; create contexts and create, get, or list Actions',
    )
    .version(version)
    .exitOverride();
  program.configureOutput({
    writeErr: () => {
      /* Errors are rendered once below. */
    },
  });
  program
    .command('init')
    .description('Initialize the current directory, or discover its Workspace')
    .option('--title <title>', 'Workspace title')
    .option('--json', 'Emit a JSON result')
    .action((options: unknown) => {
      const parsed = initOptions.parse(options);
      json = parsed.json ?? false;
      const result = initialize(parsed.title);
      console.log(
        json
          ? JSON.stringify({ ok: true, result })
          : `${result.status}\nRoot: ${result.root}\nTitle: ${result.title}\nStore: ${result.store}`,
      );
    });
  const creation = program
    .command('create')
    .description('Create Markdown work contexts or an operational Action');
  for (const type of ['project', 'outcome'] as const) {
    const command = creation
      .command(type)
      .description(
        type === 'project'
          ? 'Create a top-level Project in /_projects/'
          : 'Create an Outcome under the explicit or nearest contextual owner',
      )
      .requiredOption('--title <title>', 'Nonempty single-line title')
      .option(
        '--slug <slug>',
        'Portable directory name; defaults to title-derived slug',
      )
      .option('--json', 'Emit one JSON result including warnings');
    if (type === 'outcome')
      command
        .option(
          '--owner <url>',
          'Workspace-rooted directory URL; overrides current context',
        )
        .option(
          '--expected-result <text>',
          'Single-line expected result; defaults to title',
        );
    command.action((options: unknown) => {
      const parsed = createOptions.parse(options);
      json = parsed.json ?? false;
      const { result, warnings } = create({ type, ...parsed });
      console.log(
        json
          ? JSON.stringify({ ok: true, result, warnings })
          : `created ${result.type}\nTitle: ${result.title}\nRoot: ${result.root}\nURL: ${result.url}\nPath: ${result.path}\nOwner: ${result.owner}`,
      );
      if (!json)
        for (const warning of warnings)
          console.error(`${warning.code}: ${warning.message}`);
    });
  }
  creation
    .command('action')
    .description(
      'Create an open Action; owner defaults to nearest Project/Outcome, then Workspace (/)',
    )
    .requiredOption('--title <title>', 'Nonempty single-line title')
    .option(
      '--owner <url>',
      'Workspace-rooted owner URL; overrides context; / selects the Workspace',
    )
    .option('--description <text>', 'Markdown description')
    .option('--json', 'Emit one JSON result')
    .action((options: unknown) => {
      const parsed = createActionOptions.parse(options);
      json = parsed.json ?? false;
      const result = createAction({
        title: parsed.title,
        ...(parsed.owner === undefined ? {} : { owner: parsed.owner }),
        ...(parsed.description === undefined
          ? {}
          : { description: parsed.description }),
      });
      console.log(
        json ? JSON.stringify({ ok: true, ...result }) : renderAction(result),
      );
    });
  const get = program
    .command('get')
    .description('Retrieve an operational object');
  get
    .command('action')
    .description('Retrieve an Action by UUID or owf:action URI')
    .argument(
      '<identifier>',
      'UUID or owf:action:<UUID>; replace placeholders with a real ID',
    )
    .option('--json', 'Emit one JSON result')
    .action((identifier: string, options: { json?: boolean }) => {
      json = options.json ?? false;
      const result = getAction(identifier);
      console.log(
        json ? JSON.stringify({ ok: true, ...result }) : renderAction(result),
      );
    });
  program
    .command('list')
    .description('List operational objects')
    .command('actions')
    .description(
      'List all Actions in the current Workspace, regardless of working directory',
    )
    .option(
      '--owner <url>',
      'Match the exact direct owner URL; / selects Workspace-owned Actions',
    )
    .option(
      '--recursive',
      'Include stored descendant owner URLs; requires --owner',
    )
    .option('--json', 'Emit one JSON result with complete Action records')
    .action((options: unknown) => {
      const parsed = listActionsOptions.parse(options);
      json = parsed.json ?? false;
      const result = listActions(parsed);
      console.log(
        json
          ? JSON.stringify({ ok: true, ...result })
          : result.result.actions.length === 0
            ? 'No Actions found.'
            : result.result.actions
                .map(
                  (action) =>
                    `Title: ${action.title}\nID: ${action.id}\nState: ${action.state}\nOwner: ${action.owner.url}`,
                )
                .join('\n\n'),
      );
    });
  // Recognize output options, but do not mistake option values for flags.
  const operationalArgs = argv.slice(2);
  for (let index = 0; index < operationalArgs.length; index++) {
    const arg = operationalArgs[index];
    if (arg === '--') break;
    if (
      [
        '--title',
        '--slug',
        '--owner',
        '--expected-result',
        '--description',
      ].includes(arg ?? '')
    ) {
      index++;
      continue;
    }
    if (arg === '--json') json = true;
  }
  try {
    program.parse(argv);
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) return;
    const code =
      error instanceof WorkspaceError
        ? error.code
        : error instanceof CommanderError
          ? 'INVALID_ARGUMENT'
          : operationalArgs[0] === 'create' && operationalArgs[1] === 'action'
            ? 'ACTION_CREATE_FAILED'
            : (operationalArgs[0] === 'get' &&
                  operationalArgs[1] === 'action') ||
                (operationalArgs[0] === 'list' &&
                  operationalArgs[1] === 'actions')
              ? 'ACTION_READ_FAILED'
              : operationalArgs[0] === 'create'
                ? 'CREATION_FAILED'
                : 'INITIALIZATION_FAILED';
    const message = error instanceof Error ? error.message : String(error);
    if (json)
      console.log(JSON.stringify({ ok: false, error: { code, message } }));
    else console.error(`${code}: ${message}`);
    process.exitCode = [
      'INVALID_ARGUMENT',
      'INVALID_TITLE',
      'INVALID_SLUG',
      'INVALID_EXPECTED_RESULT',
    ].includes(code)
      ? 2
      : 1;
  }
}

function renderAction(result: ActionResult): string {
  const { action } = result.result;
  return `${result.result.status} action\nTitle: ${action.title}\nID: ${action.id}\nURI: ${result.result.uri}\nState: ${action.state}\nOwner: ${action.owner.url}\nDescription: ${action.description ?? '(none)'}\nCreated: ${action.created_at}\nUpdated: ${action.updated_at}\nRoot: ${result.result.root}`;
}
