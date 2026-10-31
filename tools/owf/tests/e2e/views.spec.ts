import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { z } from 'zod';
import {
  boardAction,
  viewResponse,
  viewsResponse,
} from '../../src/contracts/index.js';
import { cleanup, temporaryDirectory } from '../support/workspace.js';

for (const width of [1440, 390]) {
  test(`Views, shared edits and default return at ${width}px`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    const root = temporaryDirectory();
    const cli = resolve('dist/bootstrap/cli.js');
    const run = (...args: string[]) => {
      const result = spawnSync(process.execPath, [cli, ...args], {
        cwd: root,
        encoding: 'utf8',
      });
      expect(result.status, result.stderr).toBe(0);
      return result.stdout;
    };
    const parseAction = (output: string) =>
      z
        .object({ result: z.object({ action: boardAction }) })
        .parse(JSON.parse(output)).result.action;
    run('init', '--title', 'Views browser journey');
    mkdirSync(join(root, '_views'));
    const file = join(root, '_views', 'work-board.md');
    copyFileSync(
      new URL('../../docs/examples/work-board.md', import.meta.url),
      file,
    );
    const valid = readFileSync(file, 'utf8');
    const longTitle =
      'Weekly delivery and follow-up across the whole Workspace with a deliberately long instance title';
    run(
      'create',
      'view',
      '--title',
      longTitle,
      '--definition',
      '/_views/work-board.md',
    );
    run(
      'create',
      'view',
      '--title',
      longTitle,
      '--definition',
      '/_views/work-board.md',
    );
    const views = z
      .object({ result: viewsResponse })
      .parse(JSON.parse(run('list', 'views', '--json'))).result.views;
    const first = views[0]!;
    const second = views[1]!;
    const action = parseAction(
      run(
        'create',
        'action',
        '--title',
        'Waiting for a supplier response with a longer card title',
        '--state',
        'waiting',
        '--waiting-for',
        'A detailed reply from our supplier',
        '--description',
        'Shared detail description',
        '--json',
      ),
    );
    for (let index = 0; index < 8; index++)
      run('create', 'action', '--title', `Open Action ${index + 1}`);
    run('set', 'action', action.id, '--manual-block', 'Supplier unavailable');
    const server = spawn(process.execPath, [cli, 'serve', '--port', '14324'], {
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
      await expect.poll(() => output).toContain('http://127.0.0.1:14324');
      await page.goto('http://127.0.0.1:14324');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Default Kanban',
      );
      const selector = page.getByRole('combobox', { name: 'Display' });
      await expect(selector.locator('option')).toHaveCount(3);
      await page.getByLabel('Search title or description').fill('Open Action');
      await page.getByRole('button', { name: 'Apply filters' }).click();
      await expect(page.getByRole('article')).toHaveCount(8);
      await selector.selectOption(first.id);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        longTitle,
      );
      await expect(page.getByText('View', { exact: true })).toBeVisible();
      await expect(page.getByRole('article')).toHaveCount(9);
      const board = page.locator('[aria-label="View board"]');
      const read = viewResponse.parse(
        await (
          await page.request.get(`http://127.0.0.1:14324/api/views/${first.id}`)
        ).json(),
      );
      await expect(
        page.getByRole('button', { name: '+ Add Action', exact: true }),
      ).toHaveCount(
        read.columns.filter((column) => column.default_status !== undefined)
          .length,
      );
      const displayed: (string | null)[][] = [];
      for (const column of await board.locator('section').all()) {
        displayed.push(
          await Promise.all(
            (await column.getByRole('article').all()).map((card) =>
              card.getAttribute('data-action-id'),
            ),
          ),
        );
      }
      expect(displayed).toEqual(
        read.columns.map((column) => column.members.map((member) => member.id)),
      );
      const blocked = page.getByRole('region', {
        name: 'Blocked',
        exact: true,
      });
      const card = blocked.getByRole('article');
      await expect(card).toContainText('State · waiting');
      await expect(card).toContainText('Blocked · manual');
      await expect(card).toHaveAttribute(
        'aria-roledescription',
        'draggable card',
      );
      await card.focus();
      await page.keyboard.press('Enter');
      const detail = page.getByRole('dialog');
      await expect(detail.getByLabel('Title', { exact: true })).toBeFocused();
      await expect(detail.getByLabel('Description (Markdown)')).toHaveValue(
        'Shared detail description',
      );
      await page.screenshot({
        path: testInfo.outputPath(`view-detail-${width}.png`),
        fullPage: true,
      });
      await detail.getByLabel('Title', { exact: true }).fill('Draft title');
      await detail.getByRole('combobox', { name: 'Display' }).selectOption('');
      await detail.getByRole('button', { name: 'Continue editing' }).click();
      await expect(detail.getByLabel('Title', { exact: true })).toHaveValue(
        'Draft title',
      );
      await detail.getByLabel('Title', { exact: true }).fill(action.title);
      await detail.getByLabel('Manual block', { exact: true }).uncheck();
      await detail.getByRole('button', { name: 'Save changes' }).click();
      await expect(detail).toHaveCount(0);
      const activeCard = page
        .getByRole('region', { name: 'Active', exact: true })
        .getByRole('article');
      await expect(activeCard).toContainText(action.title);
      await expect(activeCard).toBeFocused();
      expect(parseAction(run('get', 'action', action.id, '--json')).state).toBe(
        'waiting',
      );
      await board.evaluate((element: { scrollLeft: number }) => {
        element.scrollLeft = 0;
      });
      await page.evaluate('window.scrollTo(0, 0)');
      await page.screenshot({
        path: testInfo.outputPath(`view-board-${width}.png`),
        fullPage: true,
      });
      await board.evaluate(
        (element: { scrollLeft: number; scrollWidth: number }) => {
          element.scrollLeft = element.scrollWidth;
        },
      );
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      const box = await selector.boundingBox();
      expect(box?.y).toBeGreaterThanOrEqual(0);
      expect((box?.y ?? 900) + (box?.height ?? 0)).toBeLessThan(900);
      expect(
        await page.evaluate<boolean>(
          'document.documentElement.scrollWidth <= innerWidth',
        ),
      ).toBe(true);
      writeFileSync(file, valid.replace('open: new-actions', 'open: todo'));
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      await expect(
        page
          .getByRole('region', { name: 'Todo', exact: true })
          .getByRole('article'),
      ).toHaveCount(8);
      await selector.selectOption(second.id);
      await expect(
        page
          .getByRole('region', { name: 'Todo', exact: true })
          .getByRole('article'),
      ).toHaveCount(8);
      writeFileSync(file, 'Broken definition');
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      await expect(
        page.getByRole('status', { name: 'View refresh' }),
      ).toContainText('Stale · refresh failed');
      await selector.focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Default Kanban',
      );
      await expect(page.getByLabel('Search title or description')).toHaveValue(
        'Open Action',
      );
      await page.getByRole('button', { name: 'Clear filters' }).click();
      await expect(page.getByRole('article')).toHaveCount(9);
      writeFileSync(file, valid);
      const open = page.getByRole('region', { name: 'Open', exact: true });
      await open.getByRole('button', { name: 'Add Action' }).click();
      const form = page.getByRole('form', { name: 'Add Action to Open' });
      await form
        .getByLabel('Title', { exact: true })
        .fill('Created after View');
      let releaseCreate!: () => void;
      const createReleased = new Promise<void>((resolve) => {
        releaseCreate = resolve;
      });
      await page.route('**/api/actions', async (route) => {
        if (route.request().method() === 'POST') await createReleased;
        await route.continue();
      });
      try {
        await form.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(
          form.getByRole('button', { name: 'Saving…', exact: true }),
        ).toBeDisabled();
        await page
          .getByRole('article')
          .filter({ hasText: action.title })
          .click();
        const creationDetail = page.getByRole('dialog');
        const detailSelector = creationDetail.getByRole('combobox', {
          name: 'Display',
        });
        await expect(detailSelector).toBeDisabled();
        releaseCreate();
        await expect(form).toHaveCount(0);
        await expect(detailSelector).toBeEnabled();
        await detailSelector.selectOption(first.id);
        await expect(
          page.getByRole('article').filter({ hasText: 'Created after View' }),
        ).toBeVisible();
        await selector.selectOption('');
      } finally {
        releaseCreate();
        await page.unrouteAll({ behavior: 'wait' });
      }
      const newCard = open
        .getByRole('article')
        .filter({ hasText: 'Created after View' });
      await expect(newCard).toBeVisible();
      await newCard.focus();
      await page.keyboard.press('Space');
      await expect(newCard).toHaveAttribute('class', /dragging/);
      // dnd-kit installs the keyboard listener on the next task.
      await page.waitForTimeout(50);
      await page.keyboard.press('ArrowRight');
      await expect(
        page.getByRole('region', { name: 'In Progress', exact: true }),
      ).toHaveAttribute('class', /dropTarget/);
      await expect(selector).toBeDisabled();
      const unexpectedWrites: string[] = [];
      page.on('request', (request) => {
        if (['POST', 'PATCH'].includes(request.method()))
          unexpectedWrites.push(request.url());
      });
      await page.keyboard.press('Escape');
      await expect(selector).toBeEnabled();
      await selector.selectOption(first.id);
      const passiveCard = page
        .getByRole('article')
        .filter({ hasText: 'Created after View' });
      await passiveCard.focus();
      await page.keyboard.press('Enter');
      const passiveDetail = page.getByRole('dialog');
      const passiveTitle = passiveDetail.getByLabel('Title', { exact: true });
      await passiveTitle.fill('Alpha');
      await passiveTitle.press('End');
      await passiveTitle.press('Space');
      await passiveTitle.pressSequentially('Beta');
      await expect(passiveTitle).toHaveValue('Alpha Beta');
      await passiveDetail.getByRole('button', { name: 'Cancel' }).click();
      await passiveDetail
        .getByRole('button', { name: 'Discard changes' })
        .click();
      await selector.selectOption('');
      expect(unexpectedWrites).toEqual([]);
      const created = parseAction(
        run(
          'get',
          'action',
          (await newCard.getAttribute('data-action-id'))!,
          '--json',
        ),
      );
      expect(created.state).toBe('open');
      await newCard.focus();
      await page.keyboard.press('Space');
      await expect(newCard).toHaveAttribute('class', /dragging/);
      await page.waitForTimeout(50);
      await page.keyboard.press('ArrowRight');
      await expect(
        page.getByRole('region', { name: 'In Progress', exact: true }),
      ).toHaveAttribute('class', /dropTarget/);
      await page.keyboard.press('Space');
      await expect(
        page
          .getByRole('region', { name: 'In Progress', exact: true })
          .getByRole('article'),
      ).toContainText('Created after View');
      await selector.selectOption(first.id);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        longTitle,
      );
      await page.reload();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Default Kanban',
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
}
