import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import {
  initialize,
  createAction,
  createView,
  getAction,
  showView,
} from '../../src/bootstrap/workspaces.js';
import { serve } from '../../src/bootstrap/server.js';
import { cleanup, temporaryDirectory } from '../support/workspace.js';

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
]) {
  test(`quiet feedback geometry, modal focus and recovery at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, info) => {
    test.setTimeout(60_000);
    const root = temporaryDirectory();
    initialize(root, 'Quiet feedback');
    mkdirSync(join(root, '_views'));
    copyFileSync(
      new URL('../../docs/examples/work-board.md', import.meta.url),
      join(root, '_views/board.md'),
    );
    const view = createView(root, {
      title: 'Work board',
      definition: '/_views/board.md',
    }).result.view;
    const action = createAction(root, {
      title: 'Review proposal',
      description: 'Context\n'.repeat(80),
    }).result.action;
    const server = await serve(root, 0);
    const address = server.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing server port');
    const url = `http://127.0.0.1:${address.port}`;
    try {
      await page.setViewportSize(viewport);
      await page.goto(url);
      await page.clock.install();
      for (const mode of ['default', 'view']) {
        await page
          .locator('header select[aria-label="Display"]:visible')
          .selectOption(mode === 'view' ? view.id : '');
        const board = page.getByLabel(
          mode === 'view' ? 'View board' : 'Action board',
          { exact: true },
        );
        const card = board.locator(`[data-action-id="${action.id}"]`);
        await expect(card).toBeVisible();
        await expect(
          page.getByRole('status', {
            name: mode === 'view' ? 'View refresh' : 'Board refresh',
          }),
        ).toContainText('up to date');
        // A move followed by an edit must leave no accumulated success feedback.
        const viewColumns = showView(root, view.id).result.columns;
        const sourceColumn = viewColumns.findIndex((column) =>
          column.members.some((member) => member.id === action.id),
        );
        const destinationColumn = viewColumns[sourceColumn - 1]?.id;
        await card.focus();
        await page.keyboard.press('Space');
        await expect(card).toHaveAttribute('class', /dragging/i);
        await page.clock.runFor(50);
        await page.keyboard.press(mode === 'view' ? 'ArrowLeft' : 'ArrowRight');
        if (mode === 'default')
          await expect(
            page.getByRole('region', { name: 'In Progress', exact: true }),
          ).toHaveAttribute('class', /dropTarget/);
        await page.keyboard.press('Space');
        if (mode === 'default')
          await expect
            .poll(() => getAction(root, action.id).result.action.state)
            .toBe('in_progress');
        else
          await expect
            .poll(
              () =>
                showView(root, view.id).result.columns.find((column) =>
                  column.members.some((member) => member.id === action.id),
                )?.id,
            )
            .toBe(destinationColumn);
        const movedState = getAction(root, action.id).result.action.state;
        await expect(card).toHaveAttribute('aria-disabled', 'false');
        await expect(
          page.getByRole('status', {
            name: mode === 'view' ? 'View refresh' : 'Board refresh',
          }),
        ).toContainText('up to date');
        await expect(
          page.getByText(/saved successfully|Move succeeded/),
        ).toHaveCount(0);
        await expect(card).toBeFocused();
        // Default Kanban suppresses accidental opens for 300ms after a drop.
        await page.clock.runFor(350);
        await page.keyboard.press('Enter');
        const movedEditor = page.getByRole('dialog', {
          name: 'Edit Action',
          exact: true,
        });
        await movedEditor
          .getByLabel('Title', { exact: true })
          .fill(`Prepared proposal in ${mode}`);
        await movedEditor
          .getByRole('button', { name: 'Save changes', exact: true })
          .click();
        await expect(movedEditor).toHaveCount(0);
        expect(getAction(root, action.id).result.action).toMatchObject({
          title: `Prepared proposal in ${mode}`,
          state: movedState,
        });
        await expect(
          page.getByText(/saved successfully|Move succeeded/),
        ).toHaveCount(0);
        const firstColumn = board.locator(':scope > section').first();
        // An inline creation failure preserves the draft without adding feedback rows.
        await firstColumn
          .getByRole('button', { name: '+ Add Action', exact: true })
          .click();
        const form = firstColumn.getByRole('form');
        await form.getByLabel('Title', { exact: true }).fill('New draft');
        const creationPath =
          mode === 'view'
            ? `${url}/api/views/${view.id}/actions`
            : `${url}/api/actions`;
        await page.route(creationPath, (route) =>
          route.request().method() === 'POST'
            ? route.fulfill({
                status: 503,
                json: {
                  error: {
                    code: 'CONTROLLED_FAILURE',
                    message: 'Creation rejected for verification.',
                  },
                },
              })
            : route.continue(),
        );
        await form
          .getByRole('button', { name: 'Save', exact: true })
          .scrollIntoViewIfNeeded();
        const before = await firstColumn.boundingBox();
        await form.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(page.getByRole('alert')).toContainText(
          'Creation rejected for verification.',
        );
        expect(await firstColumn.boundingBox()).toEqual(before);
        const floating = page.getByLabel('Operation error');
        const rect = await floating.boundingBox();
        expect(rect).not.toBeNull();
        expect(rect!.x).toBeGreaterThanOrEqual(0);
        expect(rect!.x + rect!.width).toBeLessThanOrEqual(viewport.width);
        await page.screenshot({
          path: info.outputPath(`${mode}-error.png`),
          fullPage: true,
        });
        await page.mouse.move(0, 0);
        await page.clock.runFor(8000);
        await expect(page.getByLabel('Operation error')).toHaveCount(0);
        await expect(form.getByLabel('Title', { exact: true })).toHaveValue(
          'New draft',
        );
        expect(await firstColumn.boundingBox()).toEqual(before);
        await form.getByRole('button', { name: 'Cancel', exact: true }).click();
        await page.unroute(creationPath);

        await card.click();
        const editor = page.getByRole('dialog', {
          name: 'Edit Action',
          exact: true,
        });
        await editor
          .getByLabel('Title', { exact: true })
          .fill('Preserved draft');
        await page.route(`${url}/api/actions/${action.id}`, (route) =>
          route.fulfill({
            status: 409,
            json: {
              error: {
                code: 'CONTROLLED_REJECTION',
                message: 'Edit rejected for verification.',
              },
            },
          }),
        );
        const scroll = editor.locator('[class*="editorScroll"]');
        const position = await scroll.evaluate(
          (element: { scrollTop: number }) => element.scrollTop,
        );
        const pagePosition = await page.evaluate<number>('window.scrollY');
        const boardPosition = await board.boundingBox();
        await editor
          .getByRole('button', { name: 'Save changes', exact: true })
          .click();
        await expect(editor.getByRole('alert')).toContainText(
          'Edit rejected for verification.',
        );
        expect(
          await scroll.evaluate(
            (element: { scrollTop: number }) => element.scrollTop,
          ),
        ).toBe(position);
        expect(await page.evaluate<number>('window.scrollY')).toBe(
          pagePosition,
        );
        expect(await board.boundingBox()).toEqual(boardPosition);
        const close = editor.getByRole('button', {
          name: 'Dismiss notification',
        });
        await expect(close).toBeVisible();
        await close.focus();
        await page.clock.runFor(9000);
        await expect(editor.getByRole('alert')).toBeVisible();
        await page.screenshot({
          path: info.outputPath(`${mode}-editor-error.png`),
          fullPage: true,
        });
        await page.keyboard.press('Enter');
        await expect(editor.getByRole('alert')).toHaveCount(0);
        await expect(editor.getByLabel('Title', { exact: true })).toBeFocused();
        expect(
          await scroll.evaluate(
            (element: { scrollTop: number }) => element.scrollTop,
          ),
        ).toBe(position);
        await expect(editor.getByLabel('Title', { exact: true })).toHaveValue(
          'Preserved draft',
        );
        // Field validation persists independently of notification lifetime.
        await editor.getByLabel('Title', { exact: true }).fill(' ');
        await editor
          .getByRole('button', { name: 'Save changes', exact: true })
          .click();
        await expect(editor.getByText('Enter a nonblank title.')).toBeVisible();
        await page.clock.runFor(9000);
        await expect(editor.getByText('Enter a nonblank title.')).toBeVisible();
        await editor
          .getByLabel('Title', { exact: true })
          .fill(`Updated proposal in ${mode}`);
        await page.unroute(`${url}/api/actions/${action.id}`);
        const readPath =
          mode === 'view'
            ? `${url}/api/views/${view.id}`
            : `${url}/api/actions`;
        await page.route(readPath, (route) =>
          route.fulfill({
            status: 503,
            json: {
              error: {
                code: 'CONTROLLED_READ_FAILURE',
                message: 'Read unavailable after write.',
              },
            },
          }),
        );
        await editor
          .getByRole('button', { name: 'Save changes', exact: true })
          .click();
        await expect(editor).toHaveCount(0);
        await expect(page.getByRole('alert')).toContainText(
          'completed. Do not repeat the write.',
        );
        expect(getAction(root, action.id).result.action.title).toBe(
          `Updated proposal in ${mode}`,
        );
        await page.mouse.move(0, 0);
        await page.clock.runFor(8000);
        await expect(page.getByRole('alert')).toHaveCount(0);
        await expect(
          page.getByRole('status', {
            name: mode === 'view' ? 'View refresh' : 'Board refresh',
          }),
        ).toContainText(mode === 'view' ? 'Stale' : 'Not current');
        await page.unroute(readPath);
        await page.getByRole('button', { name: /Retry/ }).click();
        await expect(
          page.getByRole('status', {
            name: mode === 'view' ? 'View refresh' : 'Board refresh',
          }),
        ).toContainText('up to date');
        await expect(
          page.getByText(
            /saved successfully|Move succeeded|Action deleted permanently/,
          ),
        ).toHaveCount(0);
      }
    } finally {
      await server.close();
      cleanup(root);
    }
  });
}
