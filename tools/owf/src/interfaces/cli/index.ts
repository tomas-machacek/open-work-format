import { Command, CommanderError } from 'commander';
import { initOptions, createOptions } from '../../contracts/index.js';
import type {
  ContextInput,
  CreateResult,
} from '../../application/contexts/index.js';
import {
  WorkspaceError,
  type WorkspaceResult,
} from '../../application/workspaces/index.js';

export function runCli(
  argv: string[],
  version: string,
  initialize: (title: string | undefined) => WorkspaceResult,
  create: (input: ContextInput) => CreateResult,
): void {
  let json = false;
  const program = new Command()
    .name('owf')
    .description('Initialize an OWF Workspace and create Projects and Outcomes')
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
    .description('Create Markdown work context');
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
  // Recognize output options, but do not mistake option values for flags.
  const operationalArgs = argv.slice(2);
  for (let index = 0; index < operationalArgs.length; index++) {
    const arg = operationalArgs[index];
    if (arg === '--') break;
    if (
      ['--title', '--slug', '--owner', '--expected-result'].includes(arg ?? '')
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
