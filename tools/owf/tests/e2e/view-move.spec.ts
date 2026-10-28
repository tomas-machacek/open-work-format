import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { z } from 'zod';
import { boardAction } from '../../src/contracts/index.js';
import { cleanup, temporaryDirectory } from '../support/workspace.js';

test('CLI and web View organization persist; pointer, keyboard and Blocked reason flow', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1200 });
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
    const peer = parseAction(
      run(
        'create',
        'action',
        '--title',
        'Peer Z',
        '--state',
        'in_progress',
        '--json',
      ),
    );
    const last = parseAction(
      run(
        'create',
        'action',
        '--title',
        'Peer A',
        '--state',
        'in_progress',
        '--json',
      ),
    );
    run(
      'move',
      'action',
      last.id,
      '--view',
      views[0]!,
      '--column',
      'active',
      '--position',
      '1',
    );
    await refresh();
    await expect(
      region('Active').getByRole('heading', { level: 3 }),
    ).toHaveText([last.title, action.title, peer.title]);
    run(
      'move',
      'action',
      peer.id,
      '--view',
      views[0]!,
      '--column',
      'todo',
      '--position',
      '1',
    );
    run(
      'move',
      'action',
      peer.id,
      '--view',
      views[0]!,
      '--column',
      'active',
      '--position',
      '2',
    );
    await refresh();
    await expect(
      region('Active').getByRole('heading', { level: 3 }),
    ).toHaveText([last.title, peer.title, action.title]);
    await page.reload();
    await page
      .getByRole('combobox', { name: 'Display' })
      .selectOption(views[0]!);
    await expect(
      region('Active').getByRole('heading', { level: 3 }),
    ).toHaveText([last.title, peer.title, action.title]);
    await expect(
      region('Active').getByRole('article').first(),
    ).not.toHaveAttribute('aria-roledescription', 'draggable card');

    // Keyboard precise reorder to last, then pointer cross-column insertion.
    const handle = page.getByRole('button', {
      name: `Drag ${last.title}`,
      exact: true,
    });
    await handle.focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    await page.keyboard.press('End');
    await page.waitForTimeout(100);
    await page.keyboard.press('Space');
    await expect(
      region('Active').getByRole('heading', { level: 3 }),
    ).toHaveText([peer.title, action.title, last.title]);
    const dragTo = async (title: string, column: string, position: number) => {
      const from = page.getByRole('button', {
        name: `Drag ${title}`,
        exact: true,
      });
      const to = region(column).getByLabel(`${column}: position ${position}`, {
        exact: true,
      });
      await from.scrollIntoViewIfNeeded();
      await to.scrollIntoViewIfNeeded();
      const a = await from.boundingBox();
      const b = await to.boundingBox();
      if (!a || !b) throw new Error('Missing drag geometry');
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, {
        steps: 15,
      });
      await page.mouse.up();
    };
    await dragTo(last.title, 'Todo', 1);
    await expect(region('Todo').getByRole('article')).toContainText(last.title);
    await dragTo(last.title, 'Blocked', 1);
    const reasonDialog = page.getByRole('dialog', { name: 'Blocked reason' });
    // dnd-kit removes its drag-ending click suppression after 50ms.
    await page.waitForTimeout(100);
    await reasonDialog
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();
    await expect(region('Todo').getByRole('article')).toContainText(last.title);
    await expect(
      page.getByRole('button', { name: 'Refresh', exact: true }),
    ).toBeEnabled();
    await dragTo(last.title, 'Blocked', 1);
    await reasonDialog
      .getByLabel('Reason', { exact: true })
      .fill('Access needed');
    await reasonDialog.getByRole('button', { name: 'Confirm move' }).click();
    await expect(region('Blocked').getByRole('article')).toContainText(
      last.title,
    );
    expect(
      parseAction(run('get', 'action', last.id, '--json')).manual_block,
    ).toBe('Access needed');
    await page.reload();
    await page
      .getByRole('combobox', { name: 'Display' })
      .selectOption(views[0]!);
    await expect(region('Blocked').getByRole('article')).toContainText(
      last.title,
    );
    run('set', 'action', last.id, '--add-dependency', peer.id);
    await refresh();
    const blockedHandle = page.getByRole('button', {
      name: `Drag ${last.title}`,
      exact: true,
    });
    await blockedHandle.focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Space');
    await expect(
      page.getByRole('status').filter({ hasText: /unresolved/i }),
    ).toBeVisible();
    await expect(region('Blocked').getByRole('article')).toContainText(
      last.title,
    );
    run('set', 'action', last.id, '--remove-dependency', peer.id);
    // Clear shared blocking before checking the independently organized second instance.
    run('set', 'action', last.id, '--clear-manual-block');
    await page
      .getByRole('combobox', { name: 'Display' })
      .selectOption(views[1]!);
    await expect(
      region('Active').getByRole('heading', { level: 3 }),
    ).toHaveText([action.title, peer.title]);
    await expect(region('New to organize').getByRole('article')).toContainText(
      last.title,
    );
    // Narrow, horizontally scrolled board: emulate a held touch drag to first.
    await page.setViewportSize({ width: 390, height: 1000 });
    const touchHandle = page.getByRole('button', {
      name: `Drag ${peer.title}`,
      exact: true,
    });
    await touchHandle.scrollIntoViewIfNeeded();
    const firstSlot = region('Active').getByLabel('Active: position 1', {
      exact: true,
    });
    const fromTouch = await touchHandle.boundingBox();
    const toTouch = await firstSlot.boundingBox();
    if (!fromTouch || !toTouch) throw new Error('Missing touch geometry');
    const cdp = await page.context().newCDPSession(page);
    const touch = async (
      type: 'touchStart' | 'touchMove' | 'touchEnd',
      x = 0,
      y = 0,
    ) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
      });
    const x = fromTouch.x + fromTouch.width / 2,
      y = fromTouch.y + fromTouch.height / 2;
    await touch('touchStart', x, y);
    await page.waitForTimeout(250);
    for (let step = 1; step <= 10; step++)
      await touch(
        'touchMove',
        x + ((toTouch.x + toTouch.width / 2 - x) * step) / 10,
        y + ((toTouch.y + toTouch.height / 2 - y) * step) / 10,
      );
    await touch('touchEnd');
    await expect(
      region('Active').getByRole('heading', { level: 3 }),
    ).toHaveText([peer.title, action.title]);
    await page.screenshot({
      path: test.info().outputPath('narrow-touch-view.png'),
      fullPage: true,
    });
  } finally {
    if (server.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
    cleanup(root);
  }
});
