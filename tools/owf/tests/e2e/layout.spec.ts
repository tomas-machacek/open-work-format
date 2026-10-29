import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Locator } from '@playwright/test';
import {
  initialize,
  createAction,
  createView,
  getAction,
  moveAction,
  setAction,
  showView,
} from '../../src/bootstrap/workspaces.js';
import { serve } from '../../src/bootstrap/server.js';
import { cleanup, temporaryDirectory } from '../support/workspace.js';

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error('Missing layout geometry');
  return rect;
}

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
  { width: 1280, height: 600 },
]) {
  test(`board width, horizontal columns and persistent editor controls at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    const root = temporaryDirectory();
    initialize(root, 'Layout verification');
    mkdirSync(join(root, '_views'));
    const states = [
      'waiting',
      'open',
      'in_progress',
      'completed',
      'cancelled',
      'open',
      'open',
      'open',
    ];
    writeFileSync(
      join(root, '_views', 'layout.md'),
      `---\ntype: OWF View Definition\ntitle: Layout\nowf:\n  renderer: kanban\n  columns:\n${states.map((state, i) => `    - id: column-${i}\n      title: Column ${i + 1}\n      status: ${state}\n      include_blocked: true`).join('\n')}\n---\n# Layout\n`,
    );
    const view = createView(root, {
      title: 'Layout with eight columns',
      definition: '/_views/layout.md',
    }).result.view.id;
    const action = createAction(root, {
      title: 'Long Action',
      state: 'waiting',
      waitingFor: 'Supplier reply',
      description: 'Long description with context\n'.repeat(40),
    }).result.action;
    const prerequisites = Array.from(
      { length: 10 },
      (_, i) =>
        createAction(root, { title: `Prerequisite ${i + 1}` }).result.action,
    );
    setAction(root, action.id, {
      addDependency: prerequisites.map((item) => `owf:action:${item.id}`),
    });
    const last = createAction(root, { title: 'Last column Action' }).result
      .action;
    moveAction(root, last.id, { view, column: 'column-7' });
    const terminal = createAction(root, {
      title: 'Default last column',
      state: 'cancelled',
    }).result.action;
    const server = await serve(root, 0);
    try {
      const address = server.server.address();
      if (!address || typeof address === 'string')
        throw new Error('Missing port');
      await page.setViewportSize(viewport);
      const writes: string[] = [];
      page.on('request', (request) => {
        if (['POST', 'PATCH', 'DELETE'].includes(request.method()))
          writes.push(request.url());
      });
      await page.goto(`http://127.0.0.1:${address.port}`);
      const selector = page.getByRole('combobox', { name: 'Display' });
      await expect(page.getByRole('article')).toHaveCount(13);

      for (const mode of ['default', 'view']) {
        await selector.selectOption(mode === 'view' ? view : '');
        const board = page.getByLabel(
          mode === 'view' ? 'View board' : 'Action board',
          { exact: true },
        );
        const columns = board.locator(':scope > section');
        await expect(columns).toHaveCount(mode === 'view' ? 8 : 5);
        const titles = await columns
          .getByRole('heading', { level: 2 })
          .allTextContents();
        const aligned = async () => {
          const boxes = await Promise.all((await columns.all()).map(box));
          expect(new Set(boxes.map((rect) => rect.y)).size).toBe(1);
          expect(boxes.every((rect) => rect.width >= 260)).toBe(true);
          expect(
            boxes.every((rect, i) => i === 0 || rect.x > boxes[i - 1]!.x),
          ).toBe(true);
          expect((await box(board)).width).toBe(
            viewport.width - (viewport.width > 1100 ? 80 : 32),
          );
        };
        await aligned();
        if (mode === 'view' && viewport.width === 1920) {
          await page.setViewportSize({ width: 1600, height: viewport.height });
          const below = (await box(board)).width;
          await page.setViewportSize(viewport);
          expect((await box(board)).width - below).toBe(320);
        }
        await columns.last().scrollIntoViewIfNeeded();
        await expect(columns.last()).toBeInViewport({ ratio: 0.9 });
        await expect(columns.getByRole('heading', { level: 2 })).toHaveText(
          titles,
        );
        expect(
          await page.evaluate<number>(
            'document.documentElement.scrollWidth - window.innerWidth',
          ),
        ).toBe(0);
        await page.screenshot({
          path: testInfo.outputPath(`${mode}-board.png`),
          fullPage: true,
        });
        await board.locator(`[data-action-id="${action.id}"]`).click();
        const detail = page.getByRole('dialog', { name: 'Edit Action' });
        const scroll = detail.locator('[class*="editorScroll"]');
        const save = detail.getByRole('button', {
          name: 'Save changes',
          exact: true,
        });
        const cancel = detail.getByRole('button', {
          name: 'Cancel',
          exact: true,
        });
        const controlsVisible = async () => {
          await expect(save).toBeInViewport({ ratio: 1 });
          await expect(cancel).toBeInViewport({ ratio: 1 });
          const content = await box(scroll);
          expect(content.y + content.height).toBeLessThanOrEqual(
            (await box(save)).y,
          );
          expect((await box(detail)).width).toBeLessThanOrEqual(640);
        };
        await controlsVisible();
        const initial = await box(save);
        for (const fraction of [0, 0.5, 1]) {
          await scroll.evaluate(
            (
              element: {
                scrollTop: number;
                scrollHeight: number;
                clientHeight: number;
              },
              value,
            ) => {
              element.scrollTop =
                (element.scrollHeight - element.clientHeight) * value;
            },
            fraction,
          );
          await controlsVisible();
          expect(await box(save)).toEqual(initial);
          await page.screenshot({
            path: testInfo.outputPath(`${mode}-detail-${fraction}.png`),
          });
        }
        // The lower field must scroll into the content area through keyboard focus.
        const waiting = detail.getByLabel('Waiting for (optional)');
        await detail.getByLabel('Title', { exact: true }).focus();
        for (
          let i = 0;
          i < 75 &&
          !(await waiting.evaluate(
            (element: { matches(selector: string): boolean }) =>
              element.matches(':focus'),
          ));
          i++
        )
          await page.keyboard.press('Tab');
        await expect(waiting).toBeFocused();
        const field = await box(waiting);
        const content = await box(scroll);
        expect(field.y).toBeGreaterThanOrEqual(content.y);
        expect(field.y + field.height).toBeLessThanOrEqual(
          content.y + content.height,
        );
        await controlsVisible();
        await page.screenshot({
          path: testInfo.outputPath(`${mode}-lower-field.png`),
        });

        const owner = detail.getByRole('combobox', {
          name: 'Owner',
          exact: true,
        });
        await owner.fill('');
        const owners = detail.getByRole('listbox', {
          name: 'Available owners',
        });
        await expect(owners.getByRole('option').first()).toBeVisible();
        await owners.getByRole('option').first().scrollIntoViewIfNeeded();
        await controlsVisible();
        await page.screenshot({
          path: testInfo.outputPath(`${mode}-owner-picker.png`),
        });
        await owner.press('Escape');
        await expect(detail).toBeVisible();
        const add = detail.getByRole('button', {
          name: '+ Add prerequisite',
          exact: true,
        });
        // An open owner list must not collapse on mouse down and move the Add
        // button away before mouse up, losing the click in this scroll area.
        await owner.click();
        await expect(owners).toBeVisible();
        await add.click();
        await expect(
          detail.getByRole('list', { name: 'Prerequisite candidates' }),
        ).toBeVisible();
        const identity = detail
          .getByRole('button', {
            name: 'Identity for Prerequisite 1',
            exact: true,
          })
          .last();
        // Keep hover away from other identity rows while checking keyboard focus.
        await page.mouse.move(0, 0);
        await identity.focus();
        await expect(detail.getByRole('tooltip')).toBeInViewport({ ratio: 1 });
        await controlsVisible();
        await page.screenshot({
          path: testInfo.outputPath(`${mode}-prerequisite-identity.png`),
        });
        await page.keyboard.press('Escape');
        await expect(detail.getByRole('tooltip')).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(add).toBeFocused();
        await expect(detail).toBeVisible();
        expect(writes).toHaveLength(mode === 'default' ? 0 : 1);

        // Submit from the fixed bar: feedback near the bottom must become visible.
        await detail.getByLabel('Manual block', { exact: true }).check();
        await save.click();
        const error = detail.getByRole('alert');
        await expect(error).toHaveText(
          'Enter a nonblank manual blocking reason.',
        );
        await expect(error).toBeInViewport({ ratio: 1 });
        await controlsVisible();
        await page.screenshot({
          path: testInfo.outputPath(`${mode}-validation.png`),
        });
        // Returning to the invalid field hides the feedback. The same local
        // rejection must reveal it again even when its message is unchanged.
        const manualReason = detail.getByLabel('Manual blocking reason', {
          exact: true,
        });
        await manualReason.fill('   ');
        await expect(error).not.toBeInViewport();
        await save.click();
        await expect(error).toBeInViewport({ ratio: 1 });
        await expect(manualReason).toHaveValue('   ');
        expect(writes).toHaveLength(mode === 'default' ? 0 : 1);
        await controlsVisible();
        await page.screenshot({
          path: testInfo.outputPath(`${mode}-repeated-validation.png`),
        });
        await detail.getByLabel('Manual block', { exact: true }).uncheck();
        await detail
          .getByLabel('Title', { exact: true })
          .fill(`${mode} saved title`);
        await waiting.fill(`${mode} lower field saved`);
        await save.click();
        await expect(detail).toHaveCount(0);
        expect(getAction(root, action.id).result.action).toMatchObject({
          title: `${mode} saved title`,
          waiting_for: `${mode} lower field saved`,
        });
        await board.locator(`[data-action-id="${action.id}"]`).click();
        await detail.getByLabel('Title', { exact: true }).fill('Unsaved draft');
        await cancel.click();
        await detail
          .getByRole('button', { name: 'Discard changes', exact: true })
          .click();
        await expect(detail).toHaveCount(0);
        await expect(
          board.locator(`[data-action-id="${action.id}"]`),
        ).toBeFocused();
        expect(getAction(root, action.id).result.action.title).toBe(
          `${mode} saved title`,
        );
      }
      expect(writes).toHaveLength(2);
      // Move from the final View column after horizontal scrolling, then do the
      // same with Default Kanban's terminal columns. Reuse existing movement rules.
      const lastCard = page
        .getByLabel('View board', { exact: true })
        .locator(`[data-action-id="${last.id}"]`);
      await lastCard.scrollIntoViewIfNeeded();
      await lastCard.focus();
      await page.keyboard.press('Space');
      await expect(lastCard).toHaveAttribute('data-dragging', 'true');
      // The drag library installs its keyboard listener on the next task.
      await page.waitForTimeout(50);
      await page.keyboard.press('ArrowLeft');
      await expect(
        page
          .getByRole('region', { name: 'Column 7', exact: true })
          .locator('[class*="activeSlot"]'),
      ).toHaveCount(1);
      await page.keyboard.press('Space');
      await expect
        .poll(() =>
          showView(root, view)
            .result.columns.find((c) => c.id === 'column-6')!
            .members.some((a) => a.id === last.id),
        )
        .toBe(true);
      await selector.selectOption('');
      const terminalCard = page
        .getByLabel('Action board', { exact: true })
        .locator(`[data-action-id="${terminal.id}"]`);
      await terminalCard.scrollIntoViewIfNeeded();
      await terminalCard.focus();
      await page.keyboard.press('Space');
      await expect(terminalCard).toHaveAttribute('class', /dragging/);
      await page.waitForTimeout(50);
      await page.keyboard.press('ArrowLeft');
      await expect(
        page.getByRole('region', { name: 'Completed', exact: true }),
      ).toHaveAttribute('class', /dropTarget/);
      await page.keyboard.press('Space');
      await expect
        .poll(() => getAction(root, terminal.id).result.action.state)
        .toBe('completed');
    } finally {
      await server.close();
      cleanup(root);
    }
  });
}
