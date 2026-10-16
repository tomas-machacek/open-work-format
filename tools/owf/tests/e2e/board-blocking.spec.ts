import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { boardAction } from '../../src/contracts/index.js';
import { cleanup, temporaryDirectory } from '../support/workspace.js';
import { z } from 'zod';

// All detail interactions in this journey use keyboard events, including narrow
// viewport scrolling, candidate selection, removal, cancellation and saving.
async function tabTo(page: Page, control: Locator) {
  for (let index = 0; index < 90; index++) {
    if (await control.and(page.locator(':focus')).count()) return;
    await page.keyboard.press('Tab');
  }
  await expect(control).toBeFocused();
}

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`blocking across filtered Projects with keyboard at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
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
    const parsedAction = (output: string) =>
      z
        .object({ result: z.object({ action: boardAction }) })
        .parse(JSON.parse(output)).result.action;
    run('init', '--title', 'Blocking journey');
    run('create', 'project', '--title', 'Alpha');
    run('create', 'project', '--title', 'Beta');
    const source = parsedAction(
      run(
        'create',
        'action',
        '--title',
        'Source',
        '--owner',
        '/_projects/alpha/',
        '--state',
        'waiting',
        '--waiting-for',
        'Reply',
        '--json',
      ),
    );
    const target = parsedAction(
      run(
        'create',
        'action',
        '--title',
        'Outside prerequisite',
        '--owner',
        '/_projects/beta/',
        '--json',
      ),
    );
    const server = spawn(process.execPath, [cli, 'serve', '--port', '14322'], {
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
      await expect.poll(() => output).toContain('http://127.0.0.1:14322');
      await page.goto('http://127.0.0.1:14322');
      const filters = page.getByRole('form', { name: 'Board filters' });
      const owner = filters.getByRole('combobox', { name: 'Owner' });
      await tabTo(page, owner);
      await page.keyboard.type('Alpha');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await tabTo(page, filters.getByRole('button', { name: 'Apply filters' }));
      await page.keyboard.press('Enter');
      const card = page.locator(`[data-action-id="${source.id}"]`);
      await expect(page.getByRole('article')).toHaveCount(1);
      await tabTo(page, card);
      await page.keyboard.press('Enter');
      const detail = page.getByRole('dialog', { name: 'Edit Action' });
      await expect(detail.getByLabel('Title')).toBeFocused();
      await tabTo(page, detail.getByLabel('Manually blocked'));
      await page.keyboard.press('Space');
      await page.keyboard.press('Tab');
      await expect(detail.getByLabel('Manual blocking reason')).toBeFocused();
      await page.keyboard.type('Access approval');
      await tabTo(page, detail.getByLabel('Add prerequisite'));
      await page.keyboard.type('Outside');
      const candidate = detail
        .getByRole('list', { name: 'Prerequisite candidates' })
        .getByRole('button', { name: /Outside prerequisite/ });
      await expect(candidate).toBeVisible();
      await expect(candidate).toContainText('/_projects/beta/');
      await expect(candidate).toContainText(`owf:action:${target.id}`);
      await page.keyboard.press('Enter');
      await expect(candidate).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(detail).toBeVisible();
      await expect(detail.getByText(/Pending addition/)).toBeVisible();
      const remove = detail.getByRole('button', {
        name: `Remove prerequisite owf:action:${target.id}`,
      });
      await tabTo(page, remove);
      await page.keyboard.press('Enter');
      await expect(detail.getByLabel('Add prerequisite')).toBeFocused();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      // Confirm the draft can be cancelled without writing, then continue it.
      await page.keyboard.press('Escape');
      await expect(
        detail.getByRole('button', { name: 'Continue editing' }),
      ).toBeFocused();
      await page.keyboard.press('Enter');
      expect(
        parsedAction(run('get', 'action', source.id, '--json')).depends_on,
      ).toEqual([]);
      await tabTo(page, detail.getByLabel('Title'));
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.type('Source combined');
      await tabTo(page, detail.getByRole('button', { name: 'Save changes' }));
      await page.keyboard.press('Enter');
      await expect(detail).toBeHidden();
      await expect(
        card.getByText('Blocked · manual + 1 prerequisite'),
      ).toBeVisible();
      const saved = parsedAction(run('get', 'action', source.id, '--json'));
      expect(saved).toMatchObject({
        title: 'Source combined',
        manual_block: 'Access approval',
        waiting_for: 'Reply',
        depends_on: [`owf:action:${target.id}`],
      });
      await page.screenshot({
        path: testInfo.outputPath(`board-${viewport.width}.png`),
        fullPage: true,
      });
      await tabTo(page, card);
      await page.keyboard.press('Space');
      await expect(card).toHaveAttribute('class', /dragging/);
      // dnd-kit installs its keyboard listener on the next task.
      await page.waitForTimeout(50);
      await page.keyboard.press('ArrowRight');
      await expect(
        page.getByRole('region', { name: 'Completed', exact: true }),
      ).toHaveAttribute('class', /dropTarget/);
      await page.keyboard.press('Space');
      await expect(card.getByRole('alert')).toContainText(
        'Action detail and save',
      );
      expect(
        parsedAction(run('get', 'action', source.id, '--json')).state,
      ).toBe('waiting');
      run('set', 'action', target.id, '--state', 'completed');
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      await expect(
        card.getByText('Blocked · manual', { exact: true }),
      ).toBeVisible();
      await tabTo(page, card);
      await page.keyboard.press('Enter');
      await expect(
        detail
          .getByRole('region', { name: 'Saved blocking' })
          .getByText('completed · Satisfied'),
      ).toBeVisible();
      await tabTo(page, detail.getByLabel('Manually blocked'));
      await page.keyboard.press('Space');
      await expect(
        detail.getByText('Saving will clear the manual block.'),
      ).toBeVisible();
      // Screenshot the scrollable detail at the blocking/picker section.
      await detail.getByLabel('Add prerequisite').scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath(`detail-${viewport.width}.png`),
      });
      expect(
        await detail.evaluate(
          (element: { scrollWidth: number; clientWidth: number }) =>
            element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      await tabTo(page, detail.getByRole('button', { name: 'Save changes' }));
      await page.keyboard.press('Enter');
      await expect(detail).toBeHidden();
      await tabTo(page, card);
      await page.keyboard.press('Space');
      await expect(card).toHaveAttribute('class', /dragging/);
      await page.waitForTimeout(50);
      await page.keyboard.press('ArrowRight');
      await expect(
        page.getByRole('region', { name: 'Completed', exact: true }),
      ).toHaveAttribute('class', /dropTarget/);
      await page.keyboard.press('Space');
      await expect(
        page
          .getByRole('region', { name: 'Completed', exact: true })
          .getByRole('article'),
      ).toBeVisible();
      run(
        'set',
        'action',
        target.id,
        '--state',
        'open',
        '--title',
        'Corrected prerequisite',
      );
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      await expect(card.getByText('Blocked · 1 prerequisite')).toBeVisible();
      await tabTo(page, card);
      await page.keyboard.press('Enter');
      await expect(detail.getByLabel('Manually blocked')).toBeDisabled();
      await expect(
        detail
          .getByRole('region', { name: 'Saved blocking' })
          .getByText('Corrected prerequisite'),
      ).toBeVisible();
      await expect(
        detail
          .getByRole('region', { name: 'Saved blocking' })
          .getByText('open · Unresolved'),
      ).toBeVisible();
      // Refresh a target-only CLI change with a source draft still open.
      await tabTo(page, detail.getByLabel('Title'));
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.type('Preserved draft');
      run(
        'set',
        'action',
        target.id,
        '--state',
        'completed',
        '--title',
        'Refreshed target',
      );
      await tabTo(
        page,
        detail.getByRole('button', { name: 'Refresh saved facts' }),
      );
      await page.keyboard.press('Enter');
      await expect(
        detail
          .getByRole('region', { name: 'Saved blocking' })
          .getByText('Refreshed target'),
      ).toBeVisible();
      await expect(detail.getByLabel('Title')).toHaveValue('Preserved draft');
      await expect(
        detail.getByRole('button', { name: 'Save changes' }),
      ).toBeEnabled();
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
