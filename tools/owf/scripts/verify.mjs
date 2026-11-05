import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const stageNames = [
  'typecheck',
  'lint',
  'format:check',
  'code-map:check',
  'architecture:check',
  'build',
  'test',
  'test:integration',
  'test:acceptance',
  'test:cli',
  'test:browser',
];

/**
 * Run children serially. Suites own normal server/fixture cleanup; on interruption
 * the runner terminates the entire active process tree before returning failure.
 * @param {{name: string, command: string, args: string[]}[]} stages
 */
export async function runStages(stages) {
  const started = performance.now();
  let interrupted = 0;
  /** @type {import('node:child_process').ChildProcess | undefined} */
  let active;
  /** @type {Promise<void> | undefined} */
  let cleanup;
  /** @param {number} code */
  const interrupt = (code) => {
    if (interrupted) return;
    interrupted = code;
    const pid = active?.pid;
    if (!pid) return;
    if (process.platform === 'win32') {
      cleanup = new Promise((resolve) => {
        const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
          stdio: 'ignore',
        });
        killer.once('error', (error) => {
          console.error(error.message);
          active?.kill();
          resolve();
        });
        killer.once('close', () => resolve());
      });
    } else {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch (error) {
        console.error(String(error));
        active?.kill('SIGKILL');
      }
    }
  };
  const sigint = () => interrupt(130);
  const sigterm = () => interrupt(143);
  process.on('SIGINT', sigint);
  process.on('SIGTERM', sigterm);
  let result = 0;
  try {
    for (const stage of stages) {
      if (interrupted) break;
      const start = performance.now();
      console.log(`\n[verify] START ${stage.name}`);
      /** @type {number} */
      const code = await new Promise((resolve) => {
        active = spawn(stage.command, stage.args, {
          stdio: 'inherit',
          detached: process.platform !== 'win32',
        });
        active.once('error', (error) =>
          console.error(`[verify] ${error.message}`),
        );
        active.once('close', (exitCode, signal) =>
          resolve(exitCode ?? (signal ? 128 : 1)),
        );
      });
      await cleanup;
      active = undefined;
      result = interrupted || (Number(code) < 0 ? 1 : Number(code));
      console.log(
        `[verify] ${result ? 'FAIL' : 'PASS'} ${stage.name} ${((performance.now() - start) / 1000).toFixed(3)}s exit=${result}`,
      );
      if (result) break;
    }
    result = interrupted || result;
    console.log(
      `[verify] TOTAL ${((performance.now() - started) / 1000).toFixed(3)}s exit=${result}`,
    );
    return result;
  } finally {
    process.off('SIGINT', sigint);
    process.off('SIGTERM', sigterm);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const npm = process.env.npm_execpath;
  if (!npm) {
    console.error(
      '[verify] Run via npm run verify (npm_execpath is required).',
    );
    process.exitCode = 1;
  } else {
    process.exitCode = await runStages(
      stageNames.map((name) => ({
        name,
        command: process.execPath,
        args: [npm, 'run', name],
      })),
    );
  }
}
