import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { z } from 'zod';
import { boardAction } from '../../src/contracts/index.js';
import { cleanup, temporaryDirectory } from '../support/workspace.js';

test('CLI placement and Waiting reason refresh into passive Views; detail blocks reconcile organization', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const root = temporaryDirectory();
  const cli = resolve('dist/bootstrap/cli.js');
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(result.status, result.stderr + result.stdout).toBe(0);
    return result.stdout;
  };
  const parseAction = (output: string) =>
    z
      .object({ result: z.object({ action: boardAction }) })
      .parse(JSON.parse(output)).result.action;
  run('init');
  mkdirSync(join(root, '_views'));
  const file = join(root, '_views', 'board.md');
  copyFileSync(
    new URL('../../docs/examples/work-board.md', import.meta.url),
    file,
  );
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(
      '    - id: done',
      '    - id: waiting-for\n      title: Waiting for\n      status: waiting\n    - id: done',
    ),
  );
  const views = ['First', 'Second'].map(
    (title) =>
      z
        .object({ result: z.object({ view: z.object({ id: z.string() }) }) })
        .parse(
          JSON.parse(
            run(
              'create',
              'view',
              '--title',
              title,
              '--definition',
              '/_views/board.md',
              '--json',
            ),
          ),
        ).result.view.id,
  );
  const action = parseAction(
    run('create', 'action', '--title', 'CLI organized work', '--json'),
  );
  const server = spawn(process.execPath, [cli, 'serve', '--port', '14325'], {
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
    await expect.poll(() => output).toContain('http://127.0.0.1:14325');
    await page.goto('http://127.0.0.1:14325');
    const selector = page.getByRole('combobox', { name: 'Display' });
    await selector.selectOption(views[0]!);
    const region = (name: string) =>
      page.getByRole('region', { name, exact: true });
    const refresh = () =>
      page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(region('New to organize').getByRole('article')).toContainText(
      action.title,
    );
    run('move', 'action', action.id, '--view', views[0]!, '--column', 'todo');
    await refresh();
    const card = region('Todo').getByRole('article');
    await expect(card).toContainText(action.title);
    await expect(card).not.toHaveAttribute(
      'aria-roledescription',
      'draggable card',
    );
    await expect(page.getByRole('button', { name: 'Add Action' })).toHaveCount(
      0,
    );
    await selector.selectOption(views[1]!);
    await expect(region('New to organize').getByRole('article')).toContainText(
      action.title,
    );
    await selector.selectOption(views[0]!);
    await card.click();
    const detail = page.getByRole('dialog');
    await detail.getByLabel('Manual block', { exact: true }).check();
    await detail.getByLabel('Manual blocking reason').fill('Missing access');
    await detail.getByRole('button', { name: 'Save changes' }).click();
    await expect(detail).toHaveCount(0);
    await expect(region('Blocked').getByRole('article')).toContainText(
      action.title,
    );
    await region('Blocked').getByRole('article').click();
    await detail.getByLabel('Manual block', { exact: true }).uncheck();
    await detail.getByRole('button', { name: 'Save changes' }).click();
    await expect(region('New to organize').getByRole('article')).toContainText(
      action.title,
    );
    run(
      'move',
      'action',
      action.id,
      '--view',
      views[0]!,
      '--column',
      'waiting-for',
      '--waiting-for',
      'Odpoveď dodávateľa',
    );
    await refresh();
    await expect(region('Waiting for').getByRole('article')).toContainText(
      'Odpoveď dodávateľa',
    );
    await region('Waiting for').getByRole('article').click();
    await expect(detail.getByLabel('Waiting for')).toHaveValue(
      'Odpoveď dodávateľa',
    );
    await detail.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(
      parseAction(run('get', 'action', action.id, '--json')).waiting_for,
    ).toBe('Odpoveď dodávateľa');
    // Default Kanban's existing state controls still reconcile the selected View.
    await selector.selectOption('');
    const defaultCard = region('Waiting').getByRole('article');
    await defaultCard.focus();
    await page.keyboard.press('Space');
    await expect(defaultCard).toHaveAttribute('class', /dragging/);
    await page.waitForTimeout(50);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Space');
    await expect(region('In Progress').getByRole('article')).toContainText(
      action.title,
    );
    await selector.selectOption(views[0]!);
    await expect(region('Active').getByRole('article')).toContainText(
      action.title,
    );
  } finally {
    if (server.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
    cleanup(root);
  }
});
