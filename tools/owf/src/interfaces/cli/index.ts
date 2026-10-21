import { Command, CommanderError } from 'commander';
import {
  initOptions,
  createOptions,
  createActionOptions,
  listActionsOptions,
  setActionOptions,
  createViewOptions,
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
  ActionProjection,
  ActionInput,
  ActionResult,
  ListActionsInput,
  ListActionsResult,
  SetActionInput,
} from '../../application/actions/index.js';
import type {
  CreateViewInput,
  ViewResult,
  ListViewsResult,
  ViewInstance,
} from '../../application/views/index.js';

function once(label: string) {
  return (value: string, previous: string | undefined) => {
    if (previous !== undefined)
      throw new WorkspaceError(
        'INVALID_ARGUMENT',
        `Supply ${label} only once.`,
      );
    return value;
  };
}

function onceFlag(label: string) {
  return (_value: string, previous: boolean | undefined) => {
    if (previous)
      throw new WorkspaceError(
        'INVALID_ARGUMENT',
        `Supply ${label} only once.`,
      );
    return true;
  };
}

export async function runCli(
  argv: string[],
  version: string,
  initialize: (title: string | undefined) => WorkspaceResult,
  create: (input: ContextInput) => CreateResult,
  createAction: (input: ActionInput) => ActionResult,
  getAction: (identifier: string) => ActionResult,
  listActions: (input: ListActionsInput) => ListActionsResult,
  setAction: (identifier: string, input: SetActionInput) => ActionResult,
  serve: (port: number) => Promise<string>,
  views: {
    create(input: CreateViewInput): ViewResult;
    get(id: string): ViewResult;
    list(): ListViewsResult;
  },
): Promise<void> {
  let json = false;
  const program = new Command()
    .name('owf')
    .description(
      'Initialize an OWF Workspace; manage contexts, Actions and View instances',
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
  program
    .command('serve')
    .description(
      'Serve an Action board with inline creation for this Workspace on 127.0.0.1; requires built web assets',
    )
    .option('--port <port>', 'Local port (default: 4317)', '4317')
    .action(async (options: { port: string }) => {
      if (
        !/^\d+$/.test(options.port) ||
        Number(options.port) < 1 ||
        Number(options.port) > 65535
      )
        throw new WorkspaceError(
          'INVALID_ARGUMENT',
          'Port must be an integer from 1 to 65535.',
        );
      console.log(
        `Action board: ${await serve(Number(options.port))}\nCreate Actions with Add Action; press Ctrl+C to stop.`,
      );
    });
  const creation = program
    .command('create')
    .description('Create Markdown work contexts, an Action or a View instance');
  creation
    .command('view')
    .description(
      'Create an independent View instance from a current Markdown definition; does not evaluate Actions',
    )
    .requiredOption(
      '--title <title>',
      'Nonempty single-line instance title',
      once('--title'),
    )
    .requiredOption(
      '--definition <url>',
      'Workspace-rooted Markdown URL under /_views/',
      once('--definition'),
    )
    .option('--json', 'Emit saved instance metadata as JSON')
    .action((options: unknown) => {
      const parsed = createViewOptions.parse(options);
      json = parsed.json ?? false;
      const result = views.create(parsed);
      console.log(
        json ? JSON.stringify({ ok: true, ...result }) : renderView(result),
      );
    });
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
      'Create an Action (default open); owner defaults to nearest Project/Outcome, then Workspace (/)',
    )
    .requiredOption('--title <title>', 'Nonempty single-line title')
    .option(
      '--owner <url>',
      'Workspace-rooted owner URL; overrides context; / selects the Workspace',
    )
    .option('--description <text>', 'Markdown description')
    .option(
      '--state <state>',
      'Initial state: open (default), in_progress, waiting, completed, cancelled; supply once',
      (value: string, previous: string | undefined) => {
        if (previous !== undefined)
          throw new WorkspaceError(
            'INVALID_ARGUMENT',
            'Supply --state only once.',
          );
        return value;
      },
    )
    .option(
      '--waiting-for <text>',
      'Optional nonblank literal reason; only with --state waiting; supply once',
      (value: string, previous: string | undefined) => {
        if (previous !== undefined)
          throw new WorkspaceError(
            'INVALID_ARGUMENT',
            'Supply --waiting-for only once.',
          );
        return value;
      },
    )
    .option('--json', 'Emit one JSON result')
    .action((options: unknown) => {
      const parsed = createActionOptions.parse(options);
      json = parsed.json ?? false;
      const result = createAction({
        title: parsed.title,
        state: parsed.state,
        waitingFor: parsed.waitingFor,
        ...(parsed.owner === undefined ? {} : { owner: parsed.owner }),
        ...(parsed.description === undefined
          ? {}
          : { description: parsed.description }),
      });
      console.log(
        json ? JSON.stringify({ ok: true, ...result }) : renderAction(result),
      );
    });
  program
    .command('set')
    .description('Change operational objects')
    .command('action')
    .description(
      'Edit Action content, owner, state, reasons or prerequisites atomically; identical requests succeed unchanged',
    )
    .addHelpText(
      'after',
      `
The identifier is the dependent source; dependency targets are its prerequisites.
Only completed targets satisfy an edge. Entering completed requires every remaining
target completed. Cancellation allows unresolved dependencies. Clear any manual
reason explicitly when entering either terminal state. Later target changes affect
derived blocking without rewriting the source state. Cycles can be represented.

Examples (replace placeholders with real Action UUIDs or owf:action:UUID URIs):
  owf set action {id} --manual-block "Missing access" --add-dependency {prerequisite-id}
  owf set action {id} --remove-dependency {old-id} --add-dependency {new-id}
  owf set action {id} --clear-manual-block --state completed

JSON preserves the Action envelope and adds optional manual_block, depends_on
(canonical URI array), and derived blocking: blocked, manual,
unresolved_dependencies, dependencies [{ uri, title, state, satisfied }].
`,
    )
    .argument('<identifier>', 'UUID or owf:action:<UUID>')
    .option(
      '--state <state>',
      'open, in_progress, waiting, completed, cancelled',
      once('--state'),
    )
    .option(
      '--waiting-for <text>',
      'Nonblank literal waiting reason; resulting state must be waiting',
      once('--waiting-for'),
    )
    .option(
      '--clear-waiting-for',
      'Remove the reason while staying waiting',
      onceFlag('--clear-waiting-for'),
    )
    .option(
      '--manual-block <text>',
      'Nonblank literal block reason; resulting state must be open, in_progress or waiting; supply once',
      once('--manual-block'),
    )
    .option(
      '--clear-manual-block',
      'Explicitly clear manual reason, including with a terminal transition',
      onceFlag('--clear-manual-block'),
    )
    .option(
      '--add-dependency <identifier>',
      'Source depends on this prerequisite Action UUID/URI in this Workspace; repeatable',
      (value: string, previous: string[] = []) => [...previous, value],
    )
    .option(
      '--remove-dependency <identifier>',
      'Remove a prerequisite Action UUID/URI; repeatable; completion requires remaining targets completed',
      (value: string, previous: string[] = []) => [...previous, value],
    )
    .option('--title <title>', 'Nonempty single-line title', once('--title'))
    .option(
      '--description <text>',
      'Literal Markdown, including empty text',
      once('--description'),
    )
    .option(
      '--clear-description',
      'Remove the optional description',
      onceFlag('--clear-description'),
    )
    .option(
      '--owner <url>',
      'Workspace-rooted owner URL; / selects Workspace',
      once('--owner'),
    )
    .option('--json', 'Emit the updated or unchanged Action')
    .action((identifier: string, options: unknown) => {
      const parsed = setActionOptions.parse(options);
      json = parsed.json ?? false;
      const result = setAction(identifier, parsed);
      console.log(
        json ? JSON.stringify({ ok: true, ...result }) : renderAction(result),
      );
    });
  const get = program
    .command('get')
    .description('Retrieve an operational object');
  get
    .command('view')
    .description(
      'Retrieve a View instance and validate its current shared definition; no Action evaluation',
    )
    .argument('<id>', 'Stored View instance ID')
    .option(
      '--json',
      'Emit separate instance metadata and resolved definition configuration',
    )
    .action((id: string, options: { json?: boolean }) => {
      json = options.json ?? false;
      const result = views.get(id);
      console.log(
        json ? JSON.stringify({ ok: true, ...result }) : renderView(result),
      );
    });
  get
    .command('action')
    .description(
      'Retrieve an Action by UUID or owf:action URI, with separate blocking and all prerequisite details',
    )
    .argument(
      '<identifier>',
      'UUID or owf:action:<UUID>; replace placeholders with a real ID',
    )
    .option(
      '--json',
      'Emit one JSON result including manual_block, depends_on and complete derived blocking',
    )
    .action((identifier: string, options: { json?: boolean }) => {
      json = options.json ?? false;
      const result = getAction(identifier);
      console.log(
        json ? JSON.stringify({ ok: true, ...result }) : renderAction(result),
      );
    });
  const list = program.command('list').description('List operational objects');
  list
    .command('views')
    .description(
      'List stored View instances by ascending ID without loading definitions',
    )
    .option('--json', 'Emit structured instance records')
    .action((options: { json?: boolean }) => {
      json = options.json ?? false;
      const result = views.list();
      console.log(
        json
          ? JSON.stringify({ ok: true, ...result })
          : result.result.views.length
            ? result.result.views.map(renderViewInstance).join('\n\n')
            : 'No View instances found.',
      );
    });
  list
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
    .option(
      '--json',
      'Emit complete Action projections including manual_block, depends_on and derived blocking; targets resolve outside filters',
    )
    .option(
      '--search <text>',
      'Literal case-insensitive substring in title or description; trim edges, keep diacritics; supply once; AND with owner/states',
      once('--search'),
    )
    .option(
      '--state <state>',
      'open, in_progress, waiting, completed, cancelled; repeat for any state, combined with owner',
      (value: string, previous: string[] = []) => [...previous, value],
    )
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
                    `Title: ${action.title}\nID: ${action.id}\nState: ${action.state}\n${renderBlocking(action)}\nOwner: ${action.owner.url}${action.waiting_for === undefined ? '' : `\nWaiting for: ${action.waiting_for}`}`,
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
        '--definition',
        '--slug',
        '--owner',
        '--expected-result',
        '--description',
        '--state',
        '--waiting-for',
        '--search',
        '--manual-block',
        '--add-dependency',
        '--remove-dependency',
      ].includes(arg ?? '')
    ) {
      index++;
      continue;
    }
    if (arg === '--json') json = true;
  }
  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) return;
    const code =
      error instanceof WorkspaceError
        ? error.code
        : error instanceof CommanderError
          ? 'INVALID_ARGUMENT'
          : operationalArgs[0] === 'set' && operationalArgs[1] === 'action'
            ? 'ACTION_UPDATE_FAILED'
            : operationalArgs[0] === 'create' && operationalArgs[1] === 'action'
              ? 'ACTION_CREATE_FAILED'
              : (operationalArgs[0] === 'get' &&
                    operationalArgs[1] === 'action') ||
                  (operationalArgs[0] === 'list' &&
                    operationalArgs[1] === 'actions')
                ? 'ACTION_READ_FAILED'
                : operationalArgs[0] === 'create'
                  ? 'CREATION_FAILED'
                  : operationalArgs[0] === 'serve'
                    ? 'SERVER_START_FAILED'
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

function renderViewInstance(view: ViewInstance): string {
  return `Title: ${view.title}\nID: ${view.id}\nDefinition: ${view.definition.url}${view.definition.id === undefined ? '' : ` (ID: ${view.definition.id})`}\nCreated: ${view.created_at}`;
}
function renderView(result: ViewResult): string {
  const { view, definition } = result.result;
  return (
    `${result.result.status} view\n${renderViewInstance(view)}\nRoot: ${result.result.root}` +
    (definition === undefined
      ? ''
      : `\nDefinition title: ${definition.title}\nRenderer: ${definition.renderer}${definition.purpose === undefined ? '' : `\nPurpose: ${definition.purpose}`}\nColumns:\n${definition.columns.map((column) => (column.type === 'blocked' ? `  ${column.id} | ${column.title} | blocked` : `  ${column.id} | ${column.title} | ${column.status.join(', ')} | default: ${column.default_status} | include_blocked: ${String(column.include_blocked)}`)).join('\n')}\nDefaults: ${JSON.stringify(definition.defaults)}\nConfiguration validated; Actions have not been evaluated.`)
  );
}

function renderAction(result: ActionResult): string {
  const { action } = result.result;
  return `${result.result.status} action\nTitle: ${action.title}\nID: ${action.id}\nURI: ${result.result.uri}\nState: ${action.state}\n${renderBlocking(action)}\nOwner: ${action.owner.url}${action.waiting_for === undefined ? '' : `\nWaiting for: ${action.waiting_for}`}\n${action.blocking.dependencies.length === 0 ? 'Dependencies: none' : `Dependencies:\n${action.blocking.dependencies.map((target) => `  ${target.uri} | ${target.title} | ${target.state} | ${target.satisfied ? 'satisfied' : 'unresolved'}`).join('\n')}`}\nDescription: ${action.description ?? '(none)'}\nCreated: ${action.created_at}\nUpdated: ${action.updated_at}\nRoot: ${result.result.root}`;
}

function renderBlocking(action: ActionProjection): string {
  const { blocking } = action;
  const reasons = [
    ...(blocking.manual ? ['manual'] : []),
    ...(blocking.unresolved_dependencies.length
      ? [
          `dependencies: ${blocking.unresolved_dependencies.length} unresolved of ${blocking.dependencies.length}`,
        ]
      : []),
  ];
  return `Blocked: ${blocking.blocked ? `yes (${reasons.join('; ')})` : 'no'}${action.manual_block === undefined ? '' : `\nManual block: ${action.manual_block}`}`;
}
