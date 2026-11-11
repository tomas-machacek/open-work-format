import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Locator } from '@playwright/test';
import {
  initialize,
  createAction,
  createView,
  captureInbox,
  getInbox,
  listInbox,
  showView,
} from '../../src/bootstrap/workspaces.js';
import { serve } from '../../src/bootstrap/server.js';
import { cleanup, temporaryDirectory } from '../support/workspace.js';

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error('Missing Inbox layout geometry');
  return rect;
}

test('Inbox reclaims board width in both modes and retains drafts through responsive layouts', async ({
  page,
}, testInfo) => {
  const root = temporaryDirectory();
  initialize(root, 'Inbox layout');
  mkdirSync(join(root, '_views'));
  copyFileSync(
    new URL('../../docs/examples/work-board.md', import.meta.url),
    join(root, '_views', 'board.md'),
  );
  const view = createView(root, {
    title: 'Layout View',
    definition: '/_views/board.md',
  }).result.view;
  for (let i = 0; i < 12; i++) {
    captureInbox(root, `Thought ${i}`);
    createAction(root, { title: `Layout Action ${i}` });
  }
  const server = await serve(root, 0);
  try {
    const address = server.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing port');
    const wide = { width: 1440, height: 1000 };
    await page.setViewportSize(wide);
    await page.goto(`http://127.0.0.1:${address.port}`);
    const inbox = page.getByRole('complementary', { name: 'Inbox' });
    const capture = page.getByLabel('Capture a thought');
    const submit = inbox.getByRole('button', { name: 'Add to Inbox' });
    const surface = page.locator('[class*="surface"]');
    const workspace = page
      .locator('[class*="workspace"]')
      .filter({ has: inbox })
      .first();
    const selector = page.getByRole('combobox', { name: 'Display' });
    await expect(
      inbox.getByRole('button', { name: 'Hide Inbox (12)' }),
    ).toBeVisible();
    const draft = 'Retained thought\nwith a second line';
    await capture.fill(draft);
    await page.getByLabel('Search title or description').fill('Layout');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.getByRole('article')).toHaveCount(12);
    await page.getByLabel('Search title or description').fill('Unsent filter');
    const boardRequests: string[] = [];
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET') writes.push(request.url());
      else if (/\/api\/(actions|views)(\/|\?|$)/.test(request.url()))
        boardRequests.push(request.url());
    });
    for (const mode of ['default', 'view']) {
      await selector.selectOption(mode === 'view' ? view.id : '');
      const board = page.getByLabel(
        mode === 'view' ? 'View board' : 'Action board',
        { exact: true },
      );
      await expect(board.getByRole('article')).toHaveCount(12);
      const header = page.getByRole('banner');
      expect(
        (await box(header)).y + (await box(header)).height,
      ).toBeLessThanOrEqual((await box(inbox)).y);
      // Native tab order reaches Inbox only after the header's Display selector.
      await selector.focus();
      await page.keyboard.press('Tab');
      await expect(
        inbox.getByRole('button', { name: /Hide Inbox/ }),
      ).toBeFocused();
      const reads = boardRequests.length;
      const expanded = await box(surface);
      const left = await box(inbox);
      expect(left.x).toBe(0);
      expect(left.x + left.width).toBe(expanded.x);
      await page.screenshot({
        path: testInfo.outputPath(`${mode}-expanded.png`),
      });
      await inbox.getByRole('button', { name: /Hide Inbox/ }).click();
      const full = await box(surface);
      const available = await box(workspace);
      expect(full.x).toBe(available.x);
      expect(full.width).toBe(available.width);
      expect(full.width - expanded.width).toBe(left.width);
      expect((await box(inbox)).y + (await box(inbox)).height).toBe(full.y);
      const refresh = page
        .getByRole('main')
        .getByRole('button', { name: 'Refresh', exact: true });
      const appearance = (button: Locator) =>
        button.evaluate(
          (element: {
            ownerDocument: {
              defaultView: {
                getComputedStyle: (node: unknown) => {
                  fontFamily: string;
                  fontSize: string;
                  fontWeight: string;
                  lineHeight: string;
                  padding: string;
                  border: string;
                  borderRadius: string;
                  color: string;
                  backgroundColor: string;
                };
              } | null;
            };
          }) => {
            const css =
              element.ownerDocument.defaultView!.getComputedStyle(element);
            return [
              css.fontFamily,
              css.fontSize,
              css.fontWeight,
              css.lineHeight,
              css.padding,
              css.border,
              css.borderRadius,
              css.color,
              css.backgroundColor,
            ];
          },
        );
      await page.mouse.move(0, 0);
      for (const button of [
        submit,
        inbox.getByRole('button', { name: /Show Inbox/ }),
        inbox.getByRole('button', { name: 'Refresh Inbox', exact: true }),
      ])
        expect(await appearance(button)).toEqual(await appearance(refresh));
      for (const width of [1440, 1920]) {
        await page.setViewportSize({ width, height: 1000 });
        const field = await box(capture);
        expect(field.width).toBe(560);
        const contentLeft = (
          await box(page.getByRole('main').locator('section').first())
        ).x;
        expect(field.x).toBe(contentLeft);
        expect(
          (await box(header)).y + (await box(header)).height,
        ).toBeLessThanOrEqual((await box(inbox)).y);
        expect((await box(surface)).width).toBe(width);
        const add = await box(submit);
        const toggle = await box(
          inbox.getByRole('button', { name: /Show Inbox/ }),
        );
        const reload = await box(
          inbox.getByRole('button', { name: 'Refresh Inbox', exact: true }),
        );
        expect(add.x - (field.x + field.width)).toBeLessThanOrEqual(12);
        expect(toggle.x - (add.x + add.width)).toBeLessThanOrEqual(24);
        expect(reload.x - (toggle.x + toggle.width)).toBeLessThanOrEqual(24);
      }
      await page.setViewportSize(wide);
      await submit.hover();
      await expect(submit).toHaveCSS('background-color', 'rgb(234, 240, 233)');
      await page.screenshot({ path: testInfo.outputPath(`${mode}-hover.png`) });
      await page.mouse.move(0, 0);
      await submit.focus();
      await expect(submit).toHaveCSS('outline-style', 'solid');
      await page.screenshot({ path: testInfo.outputPath(`${mode}-focus.png`) });
      await surface.evaluate((element: { scrollTop: number }) => {
        element.scrollTop = 500;
      });
      for (const control of [
        capture,
        submit,
        inbox.getByRole('button', { name: /Show Inbox/ }),
      ])
        await expect(control).toBeInViewport({ ratio: 1 });
      await page.screenshot({
        path: testInfo.outputPath(`${mode}-collapsed.png`),
      });
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 844, height: 390 },
        wide,
      ]) {
        await page.setViewportSize(viewport);
        await expect(capture).toHaveValue(draft);
        await expect(selector).toHaveValue(mode === 'view' ? view.id : '');
        await expect(submit).toBeInViewport({ ratio: 1 });
      }
      await inbox.getByRole('button', { name: /Show Inbox/ }).click();
      expect((await box(surface)).width).toBe(expanded.width);
      expect(boardRequests).toHaveLength(reads);
      expect(writes).toHaveLength(0);
    }
    // A pointer move uses geometry measured after the panel/strip transitions.
    const source = page.getByRole('region', {
      name: 'New to organize',
      exact: true,
    });
    const card = source.getByRole('article').first();
    const actionId = await card.getAttribute('data-action-id');
    await card.scrollIntoViewIfNeeded();
    const from = await box(card);
    await page.mouse.move(from.x + 5, from.y + 5);
    await page.mouse.down();
    await page.mouse.move(from.x + 16, from.y + 5, { steps: 3 });
    await expect(card).toHaveAttribute('data-dragging', 'true');
    const target = page.getByLabel('Todo: append', { exact: true });
    const to = await box(target);
    await page.mouse.move(to.x + to.width / 2, to.y + to.height - 20, {
      steps: 12,
    });
    await expect(
      page.getByLabel('Todo: position 1', { exact: true }),
    ).toHaveAttribute('class', /activeSlot/);
    await page.mouse.up();
    await expect
      .poll(() =>
        showView(root, view.id)
          .result.columns.find((column) => column.id === 'todo')
          ?.members.some((action) => action.id === actionId),
      )
      .toBe(true);
    await selector.selectOption('');
    await expect(page.getByLabel('Search title or description')).toHaveValue(
      'Unsent filter',
    );
    await expect(page.getByRole('article')).toHaveCount(12);
    await expect(capture).toHaveValue(draft);
    await inbox.getByRole('button', { name: /Hide Inbox/ }).click();
    await submit.click();
    await expect(capture).toHaveValue('');
    expect(
      listInbox(root).result.items.filter((item) => item.text === draft),
    ).toHaveLength(1);
    await page.reload();
    await expect(
      inbox.getByRole('button', { name: /Show Inbox/ }),
    ).toBeVisible();
    expect((await box(surface)).width).toBe(wide.width);
    await submit.click();
    await expect(inbox.getByRole('alert')).toHaveText(
      'Enter nonblank Inbox text.',
    );
    await expect(inbox.getByRole('alert')).toBeInViewport({ ratio: 1 });
    expect((await box(inbox)).y + (await box(inbox)).height).toBe(
      (await box(surface)).y,
    );
    await page.screenshot({
      path: testInfo.outputPath('collapsed-validation.png'),
    });
    await inbox.getByRole('button', { name: /Show Inbox/ }).click();
    await page.reload();
    await expect(
      inbox.getByRole('button', { name: /Hide Inbox/ }),
    ).toBeVisible();
    expect((await box(inbox)).x + (await box(inbox)).width).toBe(
      (await box(surface)).x,
    );
  } finally {
    await server.close();
    cleanup(root);
  }
});

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
        expect(inboxBox.x + inboxBox.width).toBeLessThanOrEqual(workBox.x);
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
      await inbox.getByRole('button', { name: /Hide Inbox/ }).click();
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
      await expect(
        inbox.getByRole('button', { name: 'Add to Inbox' }),
      ).toHaveCSS('opacity', '0.55');
      await page.screenshot({
        path: testInfo.outputPath('inbox-uncertain-layout.png'),
        fullPage: true,
      });
      await inbox.getByRole('button', { name: 'Refresh Inbox' }).click();
      await expect(
        inbox.getByRole('button', { name: 'Add to Inbox' }),
      ).toBeDisabled();
      await inbox.getByRole('button', { name: /Show Inbox/ }).click();
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

test('short recovery layouts retain usable boards and reachable Inbox controls in both modes', async ({
  browser,
}, testInfo) => {
  const root = temporaryDirectory();
  initialize(root, 'Short recovery');
  mkdirSync(join(root, '_views'));
  copyFileSync(
    new URL('../../docs/examples/work-board.md', import.meta.url),
    join(root, '_views', 'board.md'),
  );
  const view = createView(root, {
    title: 'Recovery View',
    definition: '/_views/board.md',
  }).result.view;
  for (let i = 0; i < 12; i++) {
    captureInbox(root, `Thought ${i}\nText for inspection.`);
    createAction(root, { title: `Action ${i}` });
  }
  const server = await serve(root, 0);
  try {
    const address = server.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing port');
    for (const mode of ['default', 'view']) {
      const context = await browser.newContext({
        hasTouch: true,
        viewport: { width: 640, height: 360 },
      });
      try {
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${address.port}`);
        const inbox = page.getByRole('complementary', { name: 'Inbox' });
        const capture = page.getByLabel('Capture a thought');
        const surface = page.locator('[class*="surface"]');
        await expect(
          inbox.getByRole('button', { name: 'Hide Inbox (12)' }),
        ).toBeVisible();
        await page
          .getByRole('combobox', { name: 'Display' })
          .selectOption(mode === 'view' ? view.id : '');
        await expect(page.getByRole('article')).toHaveCount(12);
        await page.route('**/api/inbox', (route) => route.abort('failed'));
        const draft = 'Retained recovery\nwith a second line';
        await capture.fill(draft);
        await inbox.getByRole('button', { name: 'Add to Inbox' }).tap();
        await expect(inbox.getByText(/Write outcome unknown/)).toBeVisible();
        const refresh = inbox.getByRole('button', {
          name: 'Refresh Inbox',
          exact: true,
        });
        await refresh.tap();
        await expect(refresh).toBeEnabled();
        await expect(
          inbox.getByText('Inbox not current. Confirmed writes are retained.'),
        ).toBeVisible();
        await page
          .getByRole('button', { name: 'Dismiss notification' })
          .click();
        for (const viewport of [
          { width: 640, height: 360 },
          { width: 844, height: 390 },
          { width: 390, height: 400 },
        ]) {
          await page.setViewportSize(viewport);
          const card = page.getByRole('article').last();
          await card.evaluate(
            (element: {
              scrollIntoView: (options: { block: 'end' }) => void;
            }) => element.scrollIntoView({ block: 'end' }),
          );
          await expect(card).toBeInViewport({ ratio: 0.99 });
          await card.tap();
          const editor = page.getByRole('dialog', { name: 'Edit Action' });
          await expect(editor).toBeVisible();
          await editor
            .getByRole('button', { name: 'Cancel', exact: true })
            .click();
          await expect(editor).toBeHidden();
          const boardScroll = await surface.evaluate(
            (element: { scrollTop: number }) => element.scrollTop,
          );
          for (const message of [
            inbox.getByText(/Write outcome unknown/),
            inbox.getByText(
              'Inbox not current. Confirmed writes are retained.',
            ),
          ]) {
            await message.scrollIntoViewIfNeeded();
            await expect(message).toBeInViewport({ ratio: 1 });
          }
          const allow = inbox.getByRole('button', {
            name: 'I inspected Inbox; allow writes',
          });
          await allow.scrollIntoViewIfNeeded();
          await expect(allow).toBeInViewport({ ratio: 1 });
          await expect(allow).toBeDisabled();
          await capture.scrollIntoViewIfNeeded();
          await expect(capture).toBeInViewport({ ratio: 1 });
          await expect(capture).toHaveValue(draft);
          await expect(
            inbox.getByRole('button', { name: 'Add to Inbox' }),
          ).toBeDisabled();
          await refresh.scrollIntoViewIfNeeded();
          await expect(refresh).toBeInViewport({ ratio: 1 });
          await expect(
            inbox.getByRole('button', { name: /Hide Inbox/ }),
          ).toBeInViewport({ ratio: 1 });
          expect(
            await surface.evaluate(
              (element: { scrollTop: number }) => element.scrollTop,
            ),
          ).toBe(boardScroll);
          expect(
            await page.evaluate(
              'document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight',
            ),
          ).toBe(true);
          await page.screenshot({
            path: testInfo.outputPath(
              `${mode}-recovery-${viewport.width}x${viewport.height}.png`,
            ),
          });
        }
        await page.unroute('**/api/inbox');
        await refresh.click();
        const allow = inbox.getByRole('button', {
          name: 'I inspected Inbox; allow writes',
        });
        await expect(allow).toBeEnabled();
        await allow.tap();
        await expect(capture).toBeFocused();
        await expect(capture).toHaveValue(draft);
        await expect(
          inbox.getByRole('button', { name: 'Add to Inbox' }),
        ).toBeEnabled();
      } finally {
        await context.close();
      }
    }
  } finally {
    await server.close();
    cleanup(root);
  }
});

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
      const collapsed = await box(surface);
      expect(collapsed.height - work.height).toBeGreaterThanOrEqual(96);
      expect(collapsed.width).toBe(viewport.width);
      expect(collapsed.y).toBe(
        (await box(inbox)).y + (await box(inbox)).height,
      );
      await expect(capture).toHaveValue('Keep this draft');
      await expect(
        inbox.getByRole('button', { name: 'Add to Inbox' }),
      ).toBeInViewport({ ratio: 1 });
      // Validation must fit above the board even in short landscape layouts.
      await capture.fill('');
      await inbox.getByRole('button', { name: 'Add to Inbox' }).tap();
      await expect(inbox.getByRole('alert')).toBeInViewport({ ratio: 1 });
      expect((await box(inbox)).y + (await box(inbox)).height).toBe(
        (await box(surface)).y,
      );
      await page.screenshot({
        path: testInfo.outputPath(
          `collapsed-validation-${viewport.width}x${viewport.height}.png`,
        ),
      });
      await capture.fill('Keep this draft');
      await inbox.getByRole('button', { name: /Show Inbox/ }).tap();
      expect((await box(surface)).height).toBe(work.height);
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
