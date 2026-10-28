import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import {
  initialize,
  createAction,
  createView,
  showView,
} from '../../src/bootstrap/workspaces.js';
import { serve } from '../../src/bootstrap/server.js';
import { cleanup, temporaryDirectory } from '../support/workspace.js';

let root: string;
let view: string;
let server: Awaited<ReturnType<typeof serve>>;
test.beforeEach(async ({ page }) => {
  root = temporaryDirectory();
  initialize(root, 'View interaction');
  mkdirSync(join(root, '_views'));
  writeFileSync(
    join(root, '_views', 'board.md'),
    '---\ntype: OWF View Definition\ntitle: Interaction\nowf:\n  renderer: kanban\n  columns:\n    - id: source\n      title: Source\n      status: open\n    - id: target\n      title: Target\n      status: in_progress\n    - id: blocked\n      title: Blocked\n      type: blocked\n---\n# Interaction\n',
  );
  view = createView(root, {
    title: 'Interaction',
    definition: '/_views/board.md',
  }).result.view.id;
  for (const title of ['A', 'B', 'C', 'D']) createAction(root, { title });
  server = await serve(root, 0);
  const address = server.server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`http://127.0.0.1:${address.port}`);
  await page.getByRole('combobox', { name: 'Display' }).selectOption(view);
  await expect(
    page
      .getByRole('region', { name: 'Source', exact: true })
      .getByRole('article'),
  ).toHaveCount(4);
});
test.afterEach(async () => {
  await server.close();
  cleanup(root);
});

for (const blocked of [false, true])
  test(`pending ${blocked ? 'reason' : 'ordinary'} move blocks cancellation, another drag, detail and navigation`, async ({
    page,
  }) => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requests = 0;
    await page.route('**/moves', async (route) => {
      requests++;
      await pending;
      await route.continue();
    });
    const handle = page.getByRole('button', { name: 'Drag A', exact: true });
    await handle.focus();
    await page.keyboard.press('Space');
    await expect(handle).toHaveAttribute('aria-pressed', 'true');
    // Wait for dnd-kit's pickup measurement before sending the next key.
    await expect(
      page.getByLabel('Source: position 1', { exact: true }),
    ).toHaveAttribute('class', /activeSlot/);
    if (blocked) {
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Home');
    } else await page.keyboard.press('End');
    await page.keyboard.press('Space');
    const dialog = page.getByRole('dialog', { name: 'Blocked reason' });
    if (blocked) {
      await dialog.getByLabel('Reason', { exact: true }).fill('Access');
      await dialog.getByRole('button', { name: 'Confirm move' }).click();
    }
    try {
      await expect.poll(() => requests).toBe(1);
      if (blocked) {
        await expect(
          dialog.getByRole('button', { name: 'Cancel', exact: true }),
        ).toBeDisabled();
        await expect(
          dialog.getByRole('button', { name: 'Confirm move' }),
        ).toBeDisabled();
        await expect(
          dialog.getByRole('textbox', { name: 'Reason', exact: true }),
        ).toBeDisabled();
        await expect(dialog).toBeFocused();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Escape');
        await expect(dialog).toBeFocused();
      } else {
        const otherHandle = page.getByRole('button', {
          name: 'Drag B',
          exact: true,
        });
        await expect(otherHandle).toBeDisabled();
        await page
          .getByRole('article', { name: 'B. Press Enter to edit', exact: true })
          .focus();
        await page.keyboard.press('Space');
        await page.keyboard.press('Escape');
        await page.keyboard.press('Enter');
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }
      await expect(
        page.getByRole('combobox', { name: 'Display' }),
      ).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Refresh', exact: true }),
      ).toBeDisabled();
      release();
      await expect(
        page.getByRole('status').filter({ hasText: 'Move succeeded.' }),
      ).toBeVisible();
      await expect(
        page.getByRole('combobox', { name: 'Display' }),
      ).toBeEnabled();
      const columns = showView(root, view).result.columns;
      if (blocked)
        expect(
          columns.find((c) => c.id === 'blocked')!.members.map((a) => a.title),
        ).toEqual(['A']);
      else
        expect(columns[0]!.members.map((a) => a.title)).toEqual([
          'B',
          'C',
          'D',
          'A',
        ]);
      expect(requests).toBe(1);
    } finally {
      release();
    }
  });

test('Home and End show their insertion targets in a long column and persist the selected positions', async ({
  page,
}) => {
  for (let i = 0; i < 12; i++) createAction(root, { title: `Long ${i}` });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  const source = page.getByRole('region', { name: 'Source', exact: true });
  await expect(source.getByRole('article')).toHaveCount(16);
  const handle = page.getByRole('button', { name: 'Drag A', exact: true });
  await handle.focus();
  await page.keyboard.press('Space');
  await expect(handle).toHaveAttribute('aria-pressed', 'true');
  await expect(
    source.getByLabel('Source: position 1', { exact: true }),
  ).toHaveAttribute('class', /activeSlot/);
  await page.keyboard.press('End');
  const last = source.getByLabel('Source: position 16', { exact: true });
  await expect(last).toBeInViewport();
  await expect(last).toHaveAttribute('class', /activeSlot/);
  await page.keyboard.press('Space');
  const order = () =>
    showView(root, view).result.columns[0]!.members.map((a) => a.title);
  await expect.poll(() => order().at(-1)).toBe('A');
  const before = order();
  await expect(handle).toBeEnabled();
  await handle.scrollIntoViewIfNeeded();
  await handle.focus();
  await page.keyboard.press('Space');
  await expect(handle).toHaveAttribute('aria-pressed', 'true');
  await expect(
    source.getByLabel('Source: position 16', { exact: true }),
  ).toHaveAttribute('class', /activeSlot/);
  await page.keyboard.press('Home');
  const first = source.getByLabel('Source: position 1', { exact: true });
  await expect(first).toBeInViewport();
  await expect(first).toHaveAttribute('class', /activeSlot/);
  await page.keyboard.press('Space');
  await expect.poll(order).toEqual(['A', ...before.slice(0, -1)]);
});
