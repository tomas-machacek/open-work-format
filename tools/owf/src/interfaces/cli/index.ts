import { Command, CommanderError } from 'commander';
import { initOptions } from '../../contracts/index.js';
import {
  WorkspaceError,
  type WorkspaceResult,
} from '../../application/workspaces/index.js';

export function runCli(
  argv: string[],
  version: string,
  initialize: (title: string | undefined) => WorkspaceResult,
): void {
  let json = false;
  const program = new Command()
    .name('owf')
    .description('Initialize a local OWF Workspace')
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
  // Recognize the output option even when Commander rejects another argument.
  const operationalArgs = argv.slice(2);
  for (let index = 0; index < operationalArgs.length; index++) {
    const arg = operationalArgs[index];
    if (arg === '--') break;
    if (arg === '--title') {
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
          : 'INITIALIZATION_FAILED';
    const message = error instanceof Error ? error.message : String(error);
    if (json)
      console.log(JSON.stringify({ ok: false, error: { code, message } }));
    else console.error(`${code}: ${message}`);
    process.exitCode =
      code === 'INVALID_ARGUMENT' || code === 'INVALID_TITLE' ? 2 : 1;
  }
}
