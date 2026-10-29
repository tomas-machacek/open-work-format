import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page, type Locator } from '@playwright/test';
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
  // Retain loaded Default Kanban cards to exercise focus with hidden duplicates.
  await expect(page.getByRole('article')).toHaveCount(4);
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

const cardNamed = (page: Page, title: string) =>
  page.getByRole('article', {
    name: `${title}. Press Enter to edit or Space to move`,
    exact: true,
  });
async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error('Missing interaction geometry');
  return rect;
}
async function pickup(page: Page, title: string) {
  const card = cardNamed(page, title);
  await card.scrollIntoViewIfNeeded();
  const rect = await box(card);
  await page.mouse.move(rect.x + 5, rect.y + 5);
  await page.mouse.down();
  await page.mouse.move(rect.x + 14, rect.y + 5, { steps: 3 });
  await expect(card).toHaveAttribute('data-dragging', 'true');
}

test('compact board has stable generous insertion regions; pointer moves preserve explicit and append semantics', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1200 });
  const requests: unknown[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/moves'))
      requests.push(request.postDataJSON() as unknown);
  });
  const source = page.getByRole('region', { name: 'Source', exact: true });
  const target = page.getByRole('region', { name: 'Target', exact: true });
  await expect(
    page.getByText(/Insert at \d|Append to column|Move card/),
  ).toHaveCount(0);
  await expect(source.getByRole('button')).toHaveCount(0);
  const a = await box(cardNamed(page, 'A'));
  const b = await box(cardNamed(page, 'B'));
  expect(b.y - (a.y + a.height)).toBe(12);
  expect(a.height).toBeLessThan(130);
  await page.screenshot({
    path: test.info().outputPath('resting-board.png'),
    fullPage: true,
  });

  const positions = () =>
    source.getByRole('article').evaluateAll(
      (
        cards: {
          getBoundingClientRect(): {
            x: number;
            y: number;
            width: number;
            height: number;
          };
        }[],
      ) =>
        cards.map((card) => {
          const { x, y, width, height } = card.getBoundingClientRect();
          return { x, y, width, height };
        }),
    );
  const resting = await positions();
  await pickup(page, 'D');
  // Aim well inside the first card rather than at the two-pixel indicator.
  await page.mouse.move(a.x + a.width / 2, a.y + 20, { steps: 12 });
  const first = source.getByLabel('Source: position 1', { exact: true });
  await expect(first).toHaveAttribute('class', /activeSlot/);
  expect(await positions()).toEqual(resting);
  for (let i = 0; i < 4; i++) {
    await page.mouse.move(a.x + a.width / 2 + i, a.y + 20 + i);
    await expect(first).toHaveAttribute('class', /activeSlot/);
  }
  expect(await positions()).toEqual(resting);
  await expect(page.locator('[class*="activeSlot"]')).toHaveCount(1);
  expect((await box(first)).height).toBe(2);
  await page.screenshot({
    path: test.info().outputPath('active-drag.png'),
    fullPage: false,
  });
  await page.mouse.up();
  await expect(source.getByRole('heading', { level: 3 })).toHaveText([
    'D',
    'A',
    'B',
    'C',
  ]);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(cardNamed(page, 'D')).toBeFocused();

  const drop = async (title: string, column: string, position?: number) => {
    await pickup(page, title);
    const to = page.getByLabel(
      `${column}: ${position === undefined ? 'append' : `position ${position}`}`,
      { exact: true },
    );
    const rect = await box(to);
    await page.mouse.move(
      rect.x + rect.width / 2,
      rect.y + (position === undefined ? rect.height - 20 : 10),
      { steps: 15 },
    );
    await page.mouse.up();
    await expect(
      page.getByRole('button', { name: 'Refresh', exact: true }),
    ).toBeEnabled();
  };
  // Down to explicit last; up to a middle insertion.
  await drop('D', 'Source', 4);
  await expect(source.getByRole('heading', { level: 3 })).toHaveText([
    'A',
    'B',
    'C',
    'D',
  ]);
  expect(requests.at(-1)).toMatchObject({ column: 'source', position: 4 });
  await drop('D', 'Source', 2);
  await expect(source.getByRole('heading', { level: 3 })).toHaveText([
    'A',
    'D',
    'B',
    'C',
  ]);

  // Natural empty content, far below the first boundary, is explicit position 1.
  await pickup(page, 'D');
  const empty = target.getByLabel('Target: append', { exact: true });
  const emptyRect = await box(empty);
  await page.mouse.move(
    emptyRect.x + emptyRect.width / 2,
    emptyRect.y + emptyRect.height / 2,
    { steps: 15 },
  );
  await expect(
    target.getByLabel('Target: position 1', { exact: true }),
  ).toHaveAttribute('class', /activeSlot/);
  await page.mouse.up();
  await expect(target.getByRole('heading', { level: 3 })).toHaveText(['D']);
  expect(requests.at(-1)).toMatchObject({ column: 'target', position: 1 });
  await drop('B', 'Target', 1);
  await expect(target.getByRole('heading', { level: 3 })).toHaveText([
    'B',
    'D',
  ]);
  await drop('C', 'Target', 2);
  await expect(target.getByRole('heading', { level: 3 })).toHaveText([
    'B',
    'C',
    'D',
  ]);
  await drop('A', 'Target', 4);
  await expect(target.getByRole('heading', { level: 3 })).toHaveText([
    'B',
    'C',
    'D',
    'A',
  ]);
  expect(requests.at(-1)).toMatchObject({ column: 'target', position: 4 });
  // Same-column append intentionally preserves order; cross-column arrival appends.
  await drop('B', 'Target');
  await expect(target.getByRole('heading', { level: 3 })).toHaveText([
    'B',
    'C',
    'D',
    'A',
  ]);
  expect(requests.at(-1)).not.toHaveProperty('position');
  await drop('B', 'Source');
  await expect(source.getByRole('heading', { level: 3 })).toHaveText(['B']);
  await drop('B', 'Target');
  await expect(target.getByRole('heading', { level: 3 })).toHaveText([
    'C',
    'D',
    'A',
    'B',
  ]);
  expect(requests.at(-1)).not.toHaveProperty('position');
  expect(
    showView(root, view)
      .result.columns.find((c) => c.id === 'target')!
      .members.map((a) => a.title),
  ).toEqual(['C', 'D', 'A', 'B']);
});

test('native text selection and copy, click/detail, cancellation and controls stay distinct from background drag', async ({
  page,
  context,
}) => {
  createAction(root, { title: 'Selectable title for copying' });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  const card = cardNamed(page, 'Selectable title for copying');
  const title = card.getByRole('heading');
  await expect(title).toBeVisible();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  let writes = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/moves') && request.method() === 'POST')
      writes++;
  });
  const textRect = await page.evaluate<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>(`(() => {
    const element = [...document.querySelectorAll('h3')].find(element => element.textContent === 'Selectable title for copying');
    const range = document.createRange();
    range.selectNodeContents(element);
    const rect = range.getClientRects()[0];
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  })()`);
  await page.mouse.move(textRect.x + 1, textRect.y + textRect.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    textRect.x + textRect.width - 1,
    textRect.y + textRect.height / 2,
    { steps: 15 },
  );
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate<string>('window.getSelection()?.toString()'))
    .toBe('Selectable title for copying');
  await expect(card).not.toHaveAttribute('data-dragging', 'true');
  await page.keyboard.press('Control+c');
  expect(await page.evaluate<string>('navigator.clipboard.readText()')).toBe(
    'Selectable title for copying',
  );
  await page.waitForTimeout(450);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(writes).toBe(0);
  await title.dblclick({ position: { x: 12, y: textRect.height / 2 } });
  await expect
    .poll(() => page.evaluate<string>('window.getSelection()?.toString()'))
    .not.toBe('');
  await page.waitForTimeout(450);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate('window.getSelection()?.removeAllRanges()');
  await title.click();
  const detail = page.getByRole('dialog');
  await expect(detail).toBeVisible();
  await detail.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(card).toBeFocused();
  // A below-threshold background gesture is still a click.
  const rect = await box(card);
  await page.mouse.move(rect.x + 5, rect.y + 5);
  await page.mouse.down();
  await page.mouse.move(rect.x + 7, rect.y + 6);
  await page.mouse.up();
  await expect(detail).toBeVisible();
  await detail.getByRole('button', { name: 'Cancel', exact: true }).click();
  for (const cancel of ['escape', 'outside', 'gutter']) {
    await pickup(page, 'Selectable title for copying');
    if (cancel === 'escape') await page.keyboard.press('Escape');
    else
      await page.mouse.move(5, cancel === 'gutter' ? rect.y + 20 : 5, {
        steps: 15,
      });
    await page.mouse.up();
    await expect(card).not.toHaveAttribute('data-dragging', 'true');
    await page.waitForTimeout(450);
    await expect(detail).toHaveCount(0);
    await expect(card).toBeFocused();
  }
  // A future embedded control must not activate a sensor or bubble into detail.
  await card.evaluate(
    (element: { insertAdjacentHTML(position: string, html: string): void }) => {
      element.insertAdjacentHTML(
        'beforeend',
        '<button>Embedded control</button>',
      );
    },
  );
  const control = card.getByRole('button', { name: 'Embedded control' });
  await control.click();
  await expect(detail).toHaveCount(0);
  const c = await box(control);
  await page.mouse.move(c.x + 4, c.y + 4);
  await page.mouse.down();
  await page.mouse.move(c.x + 30, c.y + 4, { steps: 4 });
  await page.mouse.up();
  await expect(card).not.toHaveAttribute('data-dragging', 'true');
  expect(writes).toBe(0);
  await control.evaluate((element: { remove(): void }) => element.remove());
  await card.focus();
  await page.keyboard.press('Enter');
  await expect(detail).toBeVisible();
  await detail.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(detail).toHaveCount(0);
  await expect(card).toBeFocused();
  await page.keyboard.press('Space');
  await expect(card).toHaveAttribute('data-dragging', 'true');
  await page.keyboard.press('Enter');
  await expect(detail).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(card).toBeFocused();
  expect(writes).toBe(0);
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
    const handle = page
      .locator('[data-action-id]')
      .filter({ has: page.getByRole('heading', { name: 'A', exact: true }) });
    await handle.focus();
    await page.keyboard.press('Space');
    await expect(handle).toHaveAttribute('data-dragging', 'true');
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
      await dialog
        .getByLabel('Manual blocking reason', { exact: true })
        .fill('Access');
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
          dialog.getByRole('textbox', {
            name: 'Manual blocking reason',
            exact: true,
          }),
        ).toBeDisabled();
        await expect(dialog).toBeFocused();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Escape');
        await expect(dialog).toBeFocused();
      } else {
        const otherHandle = page.getByRole('article', {
          name: 'B. Press Enter to edit or Space to move',
          exact: true,
        });
        await expect(otherHandle).toHaveAttribute('aria-disabled', 'true');
        await page
          .getByRole('article', {
            name: 'B. Press Enter to edit or Space to move',
            exact: true,
          })
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

test('keyboard announces exact insertion and append, restores focus and keeps Enter distinct from Space', async ({
  page,
}) => {
  const card = cardNamed(page, 'A');
  const live = page
    .getByRole('status')
    .filter({ hasText: /Card picked up|position|append|Drag cancelled/ });
  await card.focus();
  await page.keyboard.press('Space');
  await expect(
    page.getByLabel('Source: position 1', { exact: true }),
  ).toHaveAttribute('class', /activeSlot/);
  await page.keyboard.press('ArrowDown');
  await expect(live).toContainText('Source, position 2');
  await page.keyboard.press('ArrowRight');
  await expect(live).toContainText('Target, append');
  await page.keyboard.press('Home');
  await expect(live).toContainText('Target, position 1');
  await page.keyboard.press('ArrowDown');
  await expect(live).toContainText('Target, append');
  await page.keyboard.press('Escape');
  await expect(card).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Refresh', exact: true }),
  ).toBeEnabled();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await page.keyboard.press('Space');
  await expect(
    page.getByLabel('Source: position 1', { exact: true }),
  ).toHaveAttribute('class', /activeSlot/);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await expect(
    page
      .getByRole('region', { name: 'Target', exact: true })
      .getByRole('heading', { level: 3 }),
  ).toHaveText(['A']);
  await expect(card).toBeFocused();
  expect(
    showView(root, view).result.columns.find((c) => c.id === 'target')!
      .members[0]!.title,
  ).toBe('A');
});

test('narrow touch scrolls long columns and the horizontal board; text holds never pick up, background holds reorder', async ({
  page,
}) => {
  for (let i = 0; i < 12; i++) createAction(root, { title: `Long ${i}` });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 800 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
    });
  const a = cardNamed(page, 'A');
  await a.scrollIntoViewIfNeeded();
  let rect = await box(a);
  const before = await page.evaluate<number>('window.scrollY');
  await touch('touchStart', rect.x + 5, rect.y + 60);
  for (let i = 1; i <= 6; i++) {
    await touch('touchMove', rect.x + 5, rect.y + 60 - i * 24);
    await page.waitForTimeout(16);
  }
  await touch('touchEnd');
  await expect
    .poll(() => page.evaluate<number>('window.scrollY'))
    .toBeGreaterThan(before);
  await expect(a).not.toHaveAttribute('data-dragging', 'true');
  await a.scrollIntoViewIfNeeded();
  rect = await box(a);
  // Horizontal swipe starts on padding and immediately moves, preserving pan-x.
  const board = page.getByLabel('View board', { exact: true });
  await touch('touchStart', rect.x + rect.width - 5, rect.y + 8);
  for (let i = 1; i <= 6; i++)
    await touch('touchMove', rect.x + rect.width - 5 - i * 30, rect.y + 8);
  await touch('touchEnd');
  await expect
    .poll(() =>
      board.evaluate((element: { scrollLeft: number }) => element.scrollLeft),
    )
    .toBeGreaterThan(0);
  await a.scrollIntoViewIfNeeded();
  const title = await box(a.getByRole('heading'));
  await touch('touchStart', title.x + 4, title.y + 8);
  await page.waitForTimeout(600);
  await expect(a).not.toHaveAttribute('data-dragging', 'true');
  await touch('touchEnd');
  await page.waitForTimeout(450);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate('window.getSelection()?.removeAllRanges()');
  const d = cardNamed(page, 'D');
  await d.scrollIntoViewIfNeeded();
  const from = await box(d);
  const to = await box(page.getByLabel('Source: position 3', { exact: true }));
  await touch('touchStart', from.x + 5, from.y + 5);
  await expect(d).toHaveAttribute('data-dragging', 'true');
  for (let i = 1; i <= 10; i++)
    await touch(
      'touchMove',
      from.x + 5 + ((to.width / 2 - 5) * i) / 10,
      from.y + 5 + ((to.y + 10 - from.y - 5) * i) / 10,
    );
  await touch('touchEnd');
  await expect(
    page
      .getByRole('region', { name: 'Source', exact: true })
      .getByRole('heading', { level: 3 })
      .nth(2),
  ).toHaveText('D');
  expect(
    showView(root, view)
      .result.columns[0]!.members.slice(0, 4)
      .map((a) => a.title),
  ).toEqual(['A', 'B', 'D', 'C']);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath('narrow-touch-scroll.png'),
  });
});

test('Home, End and pointer scrolling reach visible targets in a long column and persist positions', async ({
  page,
}) => {
  for (let i = 0; i < 12; i++) createAction(root, { title: `Long ${i}` });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  const source = page.getByRole('region', { name: 'Source', exact: true });
  await expect(source.getByRole('article')).toHaveCount(16);
  const handle = source.getByRole('article', {
    name: 'A. Press Enter to edit or Space to move',
    exact: true,
  });
  await handle.focus();
  await page.keyboard.press('Space');
  await expect(handle).toHaveAttribute('data-dragging', 'true');
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
  await expect(handle).toHaveAttribute('aria-disabled', 'false');
  await handle.scrollIntoViewIfNeeded();
  await handle.focus();
  await page.keyboard.press('Space');
  await expect(handle).toHaveAttribute('data-dragging', 'true');
  await expect(
    source.getByLabel('Source: position 16', { exact: true }),
  ).toHaveAttribute('class', /activeSlot/);
  await page.keyboard.press('Home');
  const first = source.getByLabel('Source: position 1', { exact: true });
  await expect(first).toBeInViewport();
  await expect(first).toHaveAttribute('class', /activeSlot/);
  await page.keyboard.press('Space');
  await expect.poll(order).toEqual(['A', ...before.slice(0, -1)]);
  await expect(handle).toHaveAttribute('aria-disabled', 'false');
  await handle.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate<number>('window.scrollY');
  await pickup(page, 'A');
  const from = await box(handle);
  await page.mouse.move(from.x + from.width / 2, 885, { steps: 12 });
  await expect
    .poll(() => page.evaluate<number>('window.scrollY'))
    .toBeGreaterThan(scrollBefore);
  await page.mouse.wheel(0, 3000);
  await expect(last).toBeInViewport();
  const destination = await box(last);
  await page.mouse.move(
    destination.x + destination.width / 2,
    destination.y + 5,
    { steps: 12 },
  );
  await expect(last).toHaveAttribute('class', /activeSlot/);
  await page.mouse.up();
  await expect.poll(() => order().at(-1)).toBe('A');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test.describe('independent review regressions', () => {
  async function pickUp(page: Page) {
    const card = cardNamed(page, 'A');
    await card.focus();
    await page.keyboard.press('Space');
    await expect(card).toHaveAttribute('data-dragging', 'true');
    await expect(
      page.getByLabel('Source: position 1', { exact: true }),
    ).toHaveAttribute('class', /activeSlot/);
  }
  async function dropBlocked(page: Page) {
    await pickUp(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Home');
    await page.keyboard.press('Space');
    const dialog = page.getByRole('dialog', { name: 'Blocked reason' });
    await expect(dialog).toBeVisible();
    // Observe focus after dnd-kit's drag-ending restoration frame.
    await page.evaluate(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    );
    return dialog;
  }

  test('keyboard Blocked entry keeps focus and Tab inside its dialog; Escape cancels without writes', async ({
    page,
  }) => {
    let writes = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/moves'))
        writes++;
    });
    const before = showView(root, view);
    const dialog = await dropBlocked(page);
    const reason = dialog.getByRole('textbox', {
      name: 'Manual blocking reason',
      exact: true,
    });
    const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
    await expect(reason).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(reason).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(cardNamed(page, 'A')).toBeFocused();
    expect(writes).toBe(0);
    expect(showView(root, view)).toEqual(before);
  });

  test('reason cancellation restores the visible View card even when refresh fails', async ({
    page,
  }) => {
    const dialog = await dropBlocked(page);
    // Isolate cancellation recovery from initial modal focus restoration.
    await dialog.getByRole('textbox').focus();
    await page.route(`**/api/views/${view}`, (route) =>
      route.fulfill({
        status: 503,
        json: { error: { code: 'UNAVAILABLE', message: 'Read unavailable' } },
      }),
    );
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText('Stale · refresh failed', { exact: true }),
    ).toBeVisible();
    await expect(cardNamed(page, 'A')).toBeFocused();
  });

  test('completion restores the moved View card after Tab during a pending write', async ({
    page,
  }) => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/moves', async (route) => {
      await pending;
      await route.continue();
    });
    try {
      await pickUp(page);
      await page.keyboard.press('End');
      await page.keyboard.press('Space');
      await expect(cardNamed(page, 'B')).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      await page.keyboard.press('Tab');
      await expect(cardNamed(page, 'B')).toBeFocused();
      release();
      await expect
        .poll(() =>
          showView(root, view).result.columns[0]!.members.map((a) => a.title),
        )
        .toEqual(['B', 'C', 'D', 'A']);
      await expect(
        page.getByRole('button', { name: 'Refresh', exact: true }),
      ).toBeEnabled();
      await expect(cardNamed(page, 'A')).toBeFocused();
    } finally {
      release();
    }
  });

  test("a new text selection cancels another card's deferred click and remains copyable", async ({
    page,
    context,
  }) => {
    const title = 'Text to select on another card';
    createAction(root, { title });
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    const selected = cardNamed(page, title);
    await expect(selected).toBeVisible();
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    let writes = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/moves'))
        writes++;
    });
    const text = await page.evaluate<{
      x: number;
      y: number;
      width: number;
      height: number;
    }>(`(() => {
      const heading = [...document.querySelectorAll('h3')].find(element => element.textContent === 'Text to select on another card');
      const range = document.createRange();
      range.selectNodeContents(heading);
      const rect = range.getClientRects()[0];
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    })()`);
    const a = await box(cardNamed(page, 'A').getByRole('heading'));
    await page.mouse.click(a.x + 3, a.y + 10);
    await page.waitForTimeout(100);
    await page.mouse.move(text.x + 1, text.y + text.height / 2);
    await page.mouse.down();
    // The previous card's 400ms callback must not interrupt this held gesture.
    await page.waitForTimeout(450);
    await page.mouse.move(text.x + text.width - 1, text.y + text.height / 2, {
      steps: 15,
    });
    await page.mouse.up();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate<string>('window.getSelection()?.toString()'))
      .toBe(title);
    await page.keyboard.press('Control+c');
    expect(await page.evaluate<string>('navigator.clipboard.readText()')).toBe(
      title,
    );
    await expect(selected).not.toHaveAttribute('data-dragging', 'true');
    expect(writes).toBe(0);
  });
});
