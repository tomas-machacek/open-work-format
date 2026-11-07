import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import {
  initialize,
  createAction,
  createView,
  captureInbox,
  getInbox,
  listInbox,
} from '../../src/bootstrap/workspaces.js';
import { serve } from '../../src/bootstrap/server.js';
import { cleanup, temporaryDirectory } from '../support/workspace.js';

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`Inbox capture, processing, CLI reconciliation and independent scrolling at ${viewport.width}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    const root = temporaryDirectory();
    initialize(root, 'Inbox browser trial');
    mkdirSync(join(root, '_views'));
    copyFileSync(
      new URL('../../docs/examples/work-board.md', import.meta.url),
      join(root, '_views', 'board.md'),
    );
    const view = createView(root, {
      title: 'My work',
      definition: '/_views/board.md',
    }).result.view;
    for (let i = 0; i < 18; i++) {
      createAction(root, { title: `Action ${i}` });
      captureInbox(root, `Thought ${i}\nDetails to process later.`);
    }
    const long = captureInbox(
      root,
      '  Život 🧭\nhttps://example.com\n[not a link](x)\t\n' +
        'Long literal thought\n'.repeat(100),
    ).result.item;
    const server = await serve(root, 0);
    try {
      const address = server.server.address();
      if (!address || typeof address === 'string')
        throw new Error('Missing port');
      await page.setViewportSize(viewport);
      await page.goto(`http://127.0.0.1:${address.port}`);
      const inbox = page.getByRole('complementary', { name: 'Inbox' });
      const capture = page.getByLabel('Capture a thought');
      const list = inbox.getByRole('list');
      const boardSurface = page
        .locator('[class*="surface"]')
        .filter({ has: page.getByLabel('Action board', { exact: true }) });
      await expect(
        inbox.getByRole('button', { name: 'Hide Inbox (19)' }),
      ).toBeVisible();
      await capture.fill('Keep across hide/show');
      await inbox.getByRole('button', { name: /Hide Inbox/ }).click();
      await expect(list).toBeHidden();
      await expect(capture).toHaveValue('Keep across hide/show');
      const literal =
        '\tŽivot 🧭\nhttps://example.com/?x=1&y=2\n# literal [text](x)  ';
      await capture.fill(literal);
      await capture.press('Tab');
      await expect(
        inbox.getByRole('button', { name: 'Add to Inbox' }),
      ).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(capture).toHaveValue('');
      expect(listInbox(root).result.items.at(-1)?.text).toBe(literal);
      // Capture does not reset the current board filter or its unsent draft.
      await page
        .getByLabel('Search title or description')
        .fill('Unsent filter');
      await inbox.getByRole('button', { name: /Show Inbox/ }).click();
      await expect(page.getByLabel('Search title or description')).toHaveValue(
        'Unsent filter',
      );
      await page
        .getByRole('combobox', { name: 'Display' })
        .selectOption(view.id);
      await capture.fill('From a selected View');
      await inbox.getByRole('button', { name: 'Add to Inbox' }).click();
      await expect(capture).toHaveValue('');
      await inbox.getByRole('button', { name: /Hide Inbox/ }).click();
      await page.reload();
      await expect(
        inbox.getByRole('button', { name: /Show Inbox/ }),
      ).toBeVisible();
      await expect(list).toBeHidden();
      await inbox.getByRole('button', { name: /Show Inbox/ }).click();
      await expect(list.getByRole('listitem')).toHaveCount(21);
      await page
        .getByRole('combobox', { name: 'Display' })
        .selectOption(view.id);
      const captureBox = await capture.boundingBox();
      expect(captureBox).not.toBeNull();
      await inbox
        .locator('#inbox-list')
        .evaluate((element: { scrollTop: number; scrollHeight: number }) => {
          element.scrollTop = element.scrollHeight;
        });
      const surface = page.locator('[class*="surface"]');
      await surface.evaluate((element: { scrollTop: number }) => {
        element.scrollTop = 450;
      });
      await expect(capture).toBeInViewport({ ratio: 1 });
      expect(await capture.boundingBox()).toEqual(captureBox);
      const inboxBox = (await inbox.boundingBox())!;
      const workBox = (await surface.boundingBox())!;
      if (viewport.width > 1100)
        expect(workBox.x + workBox.width).toBeLessThanOrEqual(inboxBox.x);
      else expect(inboxBox.y + inboxBox.height).toBeLessThanOrEqual(workBox.y);
      expect(
        await page.evaluate(
          'document.documentElement.scrollWidth <= innerWidth',
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath('inbox-layout.png'),
        fullPage: true,
      });
      const longRow = list
        .getByRole('button')
        .filter({ hasText: 'Long literal thought' });
      await longRow.click();
      const detail = page.getByRole('dialog', {
        name: 'Inbox Item',
        exact: true,
      });
      const text = detail.getByLabel('Full Inbox text');
      await expect(text).toBeFocused();
      await detail.getByRole('button', { name: 'Refresh Inbox' }).focus();
      await page.keyboard.press('Tab');
      await expect(text).toBeFocused();
      await expect(text).toHaveValue(long.text);
      await expect(detail.getByRole('link')).toHaveCount(0);
      for (const name of ['Save changes', 'Cancel', 'Resolve', 'Discard'])
        await expect(
          detail.getByRole('button', { name, exact: true }),
        ).toBeInViewport({ ratio: 1 });
      await text.evaluate(
        (element: { scrollTop: number; scrollHeight: number }) => {
          element.scrollTop = element.scrollHeight;
        },
      );
      await page.screenshot({
        path: testInfo.outputPath('inbox-long-editor.png'),
        fullPage: true,
      });
      await text.fill('Changed thought\n  Literally preserved.');
      await page.keyboard.press('Escape');
      await expect(
        detail.getByRole('button', { name: 'Continue editing' }),
      ).toBeFocused();
      await detail.getByRole('button', { name: 'Continue editing' }).click();
      await detail.getByRole('button', { name: 'Save changes' }).click();
      await expect(
        detail.getByRole('button', { name: 'Resolve', exact: true }),
      ).toBeEnabled();
      expect(getInbox(root, long.id).result.item.text).toBe(
        'Changed thought\n  Literally preserved.',
      );
      await detail
        .getByRole('button', { name: 'Resolve', exact: true })
        .click();
      await expect(detail).toBeHidden();
      await expect(capture).toBeFocused();
      expect(
        listInbox(root).result.items.some((item) => item.id === long.id),
      ).toBe(false);
      const firstRow = list.getByRole('button').first();
      const discarded = listInbox(root).result.items[0]!;
      await firstRow.click();
      await detail
        .getByRole('button', { name: 'Discard', exact: true })
        .click();
      await expect(
        detail.getByRole('button', { name: 'Continue editing' }),
      ).toBeFocused();
      await detail.getByRole('button', { name: 'Continue editing' }).click();
      expect(getInbox(root, discarded.id).result.item.text).toBe(
        discarded.text,
      );
      await detail
        .getByRole('button', { name: 'Discard', exact: true })
        .click();
      await expect(
        detail.getByRole('group', { name: 'Confirm discard' }),
      ).toContainText(discarded.id);
      await detail
        .getByRole('button', { name: 'Confirm discard', exact: true })
        .click();
      await expect(detail).toBeHidden();
      await expect(capture).toBeFocused();
      const cli = (...args: string[]) =>
        execFileSync(
          process.execPath,
          [
            fileURLToPath(
              new URL('../../dist/bootstrap/cli.js', import.meta.url),
            ),
            ...args,
          ],
          { cwd: root, encoding: 'utf8' },
        );
      cli('capture', 'inbox', '--text', 'CLI captured thought');
      await inbox.getByRole('button', { name: 'Refresh Inbox' }).click();
      await expect(
        list.getByRole('button').filter({ hasText: 'CLI captured thought' }),
      ).toBeVisible();
      const current = listInbox(root).result.items[0]!;
      cli('set', 'inbox', current.id, '--text', 'CLI replacement\n  literal');
      await page.evaluate('window.dispatchEvent(new Event("focus"))');
      await expect(
        list.getByRole('button').filter({ hasText: 'CLI replacement' }),
      ).toBeVisible();
      await list
        .getByRole('button')
        .filter({ hasText: 'CLI replacement' })
        .click();
      cli(
        'set',
        'inbox',
        current.id,
        '--text',
        'CLI changed while editor open',
      );
      await detail.getByRole('button', { name: 'Refresh Inbox' }).click();
      await expect(
        detail.getByRole('group', { name: 'External Inbox changes' }),
      ).toContainText('CLI changed while editor open');
      await expect(text).toHaveValue('CLI replacement\n  literal');
      await expect(
        detail.getByRole('button', { name: 'Save changes', exact: true }),
      ).toBeDisabled();
      await expect(
        detail.getByRole('button', { name: 'Resolve', exact: true }),
      ).toBeDisabled();
      await detail
        .getByRole('button', { name: 'Replace draft with current text' })
        .click();
      await expect(text).toHaveValue('CLI changed while editor open');
      await expect(text).toBeFocused();
      await text.fill('Unsaved recovery draft');
      cli(
        'set',
        'inbox',
        current.id,
        '--text',
        'CLI replacement beside a draft',
      );
      await detail.getByRole('button', { name: 'Refresh Inbox' }).click();
      await expect(
        detail.getByRole('group', { name: 'External Inbox changes' }),
      ).toContainText('CLI replacement beside a draft');
      await expect(text).toHaveValue('Unsaved recovery draft');
      await detail
        .getByRole('button', { name: 'Keep my draft for saving' })
        .click();
      await expect(
        detail.getByRole('button', { name: 'Save changes', exact: true }),
      ).toBeEnabled();
      await expect(
        detail.getByRole('button', { name: 'Resolve', exact: true }),
      ).toBeDisabled();
      cli('resolve', 'inbox', current.id);
      await detail.getByRole('button', { name: 'Refresh Inbox' }).click();
      await expect(
        detail.getByText(/This Inbox Item is missing/),
      ).toBeVisible();
      await expect(text).toHaveValue('Unsaved recovery draft');
      await detail.getByRole('button', { name: 'Cancel', exact: true }).click();
      await detail.getByRole('button', { name: 'Discard changes' }).click();
      await expect(capture).toBeFocused();
      await page.getByRole('combobox', { name: 'Display' }).selectOption('');
      await boardSurface.evaluate((element: { scrollTop: number }) => {
        element.scrollTop = 0;
      });
      await page.getByRole('article').first().click();
      const actionEditor = page.getByRole('dialog', { name: 'Edit Action' });
      await expect(actionEditor).toBeVisible();
      await actionEditor
        .getByRole('button', { name: 'Cancel', exact: true })
        .click();
      await expect(actionEditor).toBeHidden();
      await page.route('**/api/inbox', async (route) => {
        if (route.request().method() === 'POST') await route.abort('failed');
        else await route.continue();
      });
      await capture.fill('Keep when outcome is unknown');
      await inbox.getByRole('button', { name: 'Add to Inbox' }).click();
      await expect(inbox.getByText(/Write outcome unknown/)).toBeVisible();
      await expect(capture).toHaveValue('Keep when outcome is unknown');
      await page.getByRole('button', { name: 'Dismiss notification' }).click();
      expect(
        await page.evaluate(
          'document.documentElement.scrollHeight <= innerHeight',
        ),
      ).toBe(true);
      const recoveryBox = (await inbox
        .locator('[class*="capture"]')
        .boundingBox())!;
      const visibleSurface = (await surface.boundingBox())!;
      if (viewport.width <= 1100)
        expect(recoveryBox.y + recoveryBox.height).toBeLessThanOrEqual(
          visibleSurface.y,
        );
      await page.screenshot({
        path: testInfo.outputPath('inbox-uncertain-layout.png'),
        fullPage: true,
      });
      await inbox.getByRole('button', { name: 'Refresh Inbox' }).click();
      const allow = inbox.getByRole('button', {
        name: 'I inspected Inbox; allow writes',
      });
      await expect(allow).toBeEnabled();
      await allow.scrollIntoViewIfNeeded();
      await expect(allow).toBeInViewport({ ratio: 1 });
      await allow.click();
      await expect(capture).toBeFocused();
      await expect(capture).toHaveValue('Keep when outcome is unknown');
      await expect(
        inbox.getByRole('button', { name: 'Add to Inbox' }),
      ).toBeEnabled();
    } finally {
      await server.close();
      cleanup(root);
    }
  });
}

test('low-height Inbox keeps capture and touchable rows above an independently scrolling board', async ({
  browser,
}, testInfo) => {
  const root = temporaryDirectory();
  initialize(root, 'Low-height Inbox');
  for (let i = 0; i < 12; i++) {
    captureInbox(root, `Thought ${i}\nText for inspection.`);
    createAction(root, { title: `Action ${i}` });
  }
  const server = await serve(root, 0);
  const context = await browser.newContext({ hasTouch: true });
  try {
    const page = await context.newPage();
    const address = server.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing port');
    await page.goto(`http://127.0.0.1:${address.port}`);
    const inbox = page.getByRole('complementary', { name: 'Inbox' });
    const capture = page.getByLabel('Capture a thought');
    const surface = page.locator('[class*="surface"]');
    const list = inbox.locator('#inbox-list');
    await expect(
      inbox.getByRole('button', { name: 'Hide Inbox (12)' }),
    ).toBeVisible();
    for (const viewport of [
      { width: 390, height: 600 },
      { width: 844, height: 390 },
      { width: 390, height: 400 },
    ]) {
      await page.setViewportSize(viewport);
      await surface.evaluate((element: { scrollTop: number }) => {
        element.scrollTop = 400;
      });
      const captureBox = await capture.boundingBox();
      const boardScroll = await surface.evaluate(
        (element: { scrollTop: number }) => element.scrollTop,
      );
      await list.evaluate(
        (element: { scrollTop: number; scrollHeight: number }) => {
          element.scrollTop = element.scrollHeight;
        },
      );
      await expect(capture).toBeInViewport({ ratio: 1 });
      expect(await capture.boundingBox()).toEqual(captureBox);
      expect(
        await surface.evaluate(
          (element: { scrollTop: number }) => element.scrollTop,
        ),
      ).toBe(boardScroll);
      const region = (await inbox.boundingBox())!;
      const work = (await surface.boundingBox())!;
      const captureRegion = (await inbox
        .locator('[class*="capture"]')
        .boundingBox())!;
      expect(captureRegion.y + captureRegion.height).toBeLessThanOrEqual(
        work.y,
      );
      expect(region.y + region.height).toBeLessThanOrEqual(work.y);
      const row = list.getByRole('button').last();
      await row.scrollIntoViewIfNeeded();
      await expect(row).toBeInViewport({ ratio: 1 });
      await page.screenshot({
        path: testInfo.outputPath(
          `inbox-${viewport.width}x${viewport.height}.png`,
        ),
        fullPage: true,
      });
      // A real tap checks clipping and hit testing, not just an outer region's box.
      await row.tap();
      const detail = page.getByRole('dialog', {
        name: 'Inbox Item',
        exact: true,
      });
      await expect(detail).toBeVisible();
      await detail.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(row).toBeFocused();
      const card = page.getByRole('article').last();
      await card.evaluate(
        (element: { scrollIntoView: (options: { block: 'end' }) => void }) =>
          element.scrollIntoView({ block: 'end' }),
      );
      // Native scrolling rounds fractional grid geometry to device pixels.
      // Allow less than one pixel on this short card; the tap still checks occlusion.
      await expect(card).toBeInViewport({ ratio: 0.99 });
      await card.tap();
      const actionEditor = page.getByRole('dialog', { name: 'Edit Action' });
      await expect(actionEditor).toBeVisible();
      await actionEditor
        .getByRole('button', { name: 'Cancel', exact: true })
        .click();
      await expect(actionEditor).toBeHidden();
      await expect(capture).toBeInViewport({ ratio: 1 });
      await capture.fill('Keep this draft');
      await inbox.getByRole('button', { name: /Hide Inbox/ }).tap();
      await expect(capture).toHaveValue('Keep this draft');
      await expect(
        inbox.getByRole('button', { name: 'Add to Inbox' }),
      ).toBeInViewport({ ratio: 1 });
      await inbox.getByRole('button', { name: /Show Inbox/ }).tap();
      expect(
        await page.evaluate(
          'document.documentElement.scrollHeight <= innerHeight',
        ),
      ).toBe(true);
    }
  } finally {
    await context.close();
    await server.close();
    cleanup(root);
  }
});
