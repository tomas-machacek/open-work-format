import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import {
  initialize,
  createView,
  createAction,
  getAction,
  setAction,
  listActions,
  showView,
} from '../../src/bootstrap/workspaces.js';
import { serve } from '../../src/bootstrap/server.js';
import { cleanup, temporaryDirectory } from '../support/workspace.js';

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
  { width: 1280, height: 600 },
]) {
  test(`create, cancel and globally delete in both modes at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, info) => {
    const root = temporaryDirectory();
    initialize(root);
    mkdirSync(join(root, '_views'));
    copyFileSync(
      new URL('../../docs/examples/work-board.md', import.meta.url),
      join(root, '_views', 'board.md'),
    );
    const view = createView(root, {
      title: 'Chosen View',
      definition: '/_views/board.md',
    }).result.view;
    const guarded = createAction(root, {
      title: 'Guarded',
      description: 'Long context\n'.repeat(80),
    }).result.action;
    const dependent = createAction(root, { title: 'Refers to Guarded' }).result
      .action;
    setAction(root, dependent.id, { addDependency: [guarded.id] });
    const server = await serve(root, 0);
    const address = server.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing server');
    try {
      await page.setViewportSize(viewport);
      await page.goto(`http://127.0.0.1:${address.port}`);
      const selector = page
        .locator('header')
        .getByRole('combobox', { name: 'Display' })
        .filter({ visible: true });
      await selector.selectOption(view.id);
      const todo = page.getByRole('region', { name: 'Todo', exact: true });
      await expect(
        page
          .getByRole('region', { name: 'Blocked', exact: true })
          .getByRole('button', { name: '+ Add Action' }),
      ).toHaveCount(0);
      await todo.getByRole('button', { name: '+ Add Action' }).click();
      await expect(
        page.getByRole('textbox', { name: 'Title', exact: true }),
      ).toBeFocused();
      await page
        .getByRole('textbox', { name: 'Title', exact: true })
        .fill('Created in Todo');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(todo.locator('[data-action-id]')).toHaveCount(1);
      await expect(page.locator(':focus')).toHaveText(/Add Action|Refresh/);
      const created = listActions(root).result.actions.find(
        (a) => a.title === 'Created in Todo',
      )!;
      expect(getAction(root, created.id).result.action.state).toBe('open');
      await page.reload();
      await page
        .locator('header')
        .getByRole('combobox', { name: 'Display' })
        .selectOption(view.id);
      await expect(todo.locator('[data-action-id]')).toHaveAttribute(
        'data-action-id',
        created.id,
      );
      await todo.locator('[data-action-id]').focus();
      await page.keyboard.press('Enter');
      const editor = page.getByRole('dialog', {
        name: 'Edit Action',
        exact: true,
      });
      await editor
        .getByRole('textbox', { name: 'Title', exact: true })
        .fill('Unsaved title');
      await editor
        .getByRole('button', { name: 'Delete action', exact: true })
        .click();
      const confirmation = page.getByRole('dialog', {
        name: 'Delete action permanently?',
      });
      await expect(confirmation).toContainText('Created in Todo');
      await expect(
        confirmation.getByRole('button', { name: 'Cancel deletion' }),
      ).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(
        editor.getByRole('textbox', { name: 'Title', exact: true }),
      ).toHaveValue('Unsaved title');
      await expect(
        editor.getByRole('button', { name: 'Delete action', exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      await expect(
        confirmation.getByRole('button', {
          name: 'Permanently delete',
          exact: true,
        }),
      ).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(editor).not.toBeVisible();
      expect(
        listActions(root).result.actions.some((a) => a.id === created.id),
      ).toBe(false);
      expect(
        showView(root, view.id)
          .result.columns.flatMap((c) => c.members)
          .some((a) => a.id === created.id),
      ).toBe(false);
      await page
        .locator('header')
        .getByRole('combobox', { name: 'Display' })
        .filter({ visible: true })
        .selectOption('');
      await page.locator(`[data-action-id="${guarded.id}"]`).focus();
      await page.keyboard.press('Enter');
      await expect(editor).toBeVisible();
      await editor
        .getByRole('textbox', { name: 'Description (Markdown)' })
        .fill('Unsaved long text\n'.repeat(100));
      await editor
        .getByRole('textbox', { name: 'Description (Markdown)' })
        .scrollIntoViewIfNeeded();
      for (const label of ['Save changes', 'Cancel', 'Delete action']) {
        const control = editor.getByRole('button', {
          name: label,
          exact: true,
        });
        await expect(control).toBeInViewport();
      }
      await page.screenshot({
        path: info.outputPath('persistent-delete-bar.png'),
      });
      await editor
        .getByRole('button', { name: 'Delete action', exact: true })
        .click();
      await page.screenshot({
        path: info.outputPath('delete-confirmation.png'),
      });
      await confirmation
        .getByRole('button', { name: 'Permanently delete', exact: true })
        .click();
      await expect(editor.getByRole('alert')).toContainText(
        'Refers to Guarded',
      );
      await page.screenshot({
        path: info.outputPath('dependency-rejection.png'),
      });
      expect(getAction(root, guarded.id).result.action.description).toContain(
        'Long context',
      );
      setAction(root, dependent.id, { removeDependency: [guarded.id] });
      await editor
        .getByRole('button', { name: 'Delete action', exact: true })
        .click();
      await confirmation
        .getByRole('button', { name: 'Permanently delete', exact: true })
        .click();
      await expect(editor).not.toBeVisible();
      expect(
        listActions(root).result.actions.some((a) => a.id === guarded.id),
      ).toBe(false);
    } finally {
      await server.close();
      cleanup(root);
    }
  });
}
