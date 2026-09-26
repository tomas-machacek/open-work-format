import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { test, expect } from '@playwright/test';
import { z } from 'zod';
import { cleanup, temporaryDirectory } from '../support/workspace.js';
const cli = resolve('dist/bootstrap/cli.js');
test('built board quietly reflects a CLI change on return to the tab', async ({
  page,
  context,
}) => {
  const root = temporaryDirectory();
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout;
  };
  run('init', '--title', 'Browser journey');
  const server = spawn(process.execPath, [cli, 'serve', '--port', '14317'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  server.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  try {
    await expect.poll(() => output).toContain('http://127.0.0.1:14317');
    await page.goto('http://127.0.0.1:14317');
    // Playwright emulates focus on every page by default. Disable that so
    // tab switching produces real browser visibility/focus events.
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setFocusEmulationEnabled', {
      enabled: false,
    });
    await expect(
      page.getByText('No Actions yet.', { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
      'Open0',
      'In Progress0',
      'Waiting0',
      'Completed0',
      'Cancelled0',
    ]);
    const response = z
      .object({ result: z.object({ action: z.object({ id: z.string() }) }) })
      .parse(
        JSON.parse(
          run('create', 'action', '--title', 'Confirm delivery', '--json'),
        ),
      );
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(
      page
        .getByRole('region', { name: 'Open', exact: true })
        .getByText('Confirm delivery'),
    ).toBeVisible();
    const away = await context.newPage();
    const awaySession = await context.newCDPSession(away);
    await awaySession.send('Emulation.setFocusEmulationEnabled', {
      enabled: false,
    });
    await away.bringToFront();
    run(
      'set',
      'action',
      response.result.action.id,
      '--state',
      'waiting',
      '--waiting-for',
      'Supplier reply',
    );
    // Delay this one real response to observe the quiet in-flight presentation.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/actions', async (route) => {
      await gate;
      await route.continue();
    });
    await page.bringToFront();
    await expect(page.getByRole('status')).toHaveText('Refreshing…');
    await expect(
      page
        .getByRole('region', { name: 'Open', exact: true })
        .getByText('Confirm delivery'),
    ).toBeVisible();
    release();
    await expect(
      page
        .getByRole('region', { name: 'Waiting', exact: true })
        .getByText('Confirm delivery'),
    ).toBeVisible();
    await expect(page.getByText('Supplier reply')).toBeVisible();
    await expect(page.getByText(response.result.action.id)).toBeVisible();
    await away.close();
  } finally {
    if (server.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
    cleanup(root);
  }
});
