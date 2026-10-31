import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { boardAction } from '../../src/contracts/index.js';
import { cleanup, temporaryDirectory } from '../support/workspace.js';
import { z } from 'zod';

// The real-store journey retains keyboard editing, cancellation, saving and drag
// regressions from 0018. The final checks also exercise touch disclosures/picking.
test.use({ hasTouch: true });
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
    test.setTimeout(60_000);
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
      await expect(detail.getByLabel('Title', { exact: true })).toBeFocused();
      // Refresh keeps an open picker usable even when the form is still clean.
      await detail
        .getByRole('button', { name: '+ Add prerequisite', exact: true })
        .click();
      await detail.getByRole('button', { name: 'Refresh blocking' }).click();
      await expect(
        detail.getByLabel('Add prerequisite', { exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(detail).toBeVisible();
      await expect(
        detail.getByRole('button', { name: '+ Add prerequisite', exact: true }),
      ).toBeFocused();
      await tabTo(page, detail.getByLabel('Manual block'));
      await page.keyboard.press('Space');
      await page.keyboard.press('Tab');
      await expect(detail.getByLabel('Manual blocking reason')).toBeFocused();
      await page.keyboard.type('Access approval');
      const add = detail.getByRole('button', {
        name: '+ Add prerequisite',
        exact: true,
      });
      await expect(
        detail.getByRole('list', { name: 'Prerequisite candidates' }),
      ).toHaveCount(0);
      await tabTo(page, add);
      await page.keyboard.press('Enter');
      await expect(
        detail.getByLabel('Add prerequisite', { exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(add).toBeFocused();
      await expect(detail.getByText('Discard unsaved changes?')).toHaveCount(0);
      await page.keyboard.press('Enter');
      await page.keyboard.type('Outside');
      const candidate = detail
        .getByRole('list', { name: 'Prerequisite candidates' })
        .getByRole('button', {
          name: /Add prerequisite.*Outside prerequisite/,
        });
      await expect(candidate).toBeVisible();
      const candidateRow = candidate.locator('..');
      await expect(candidateRow).toContainText('/_projects/beta/');
      const identity = candidateRow.getByRole('button', {
        name: 'Identity for Outside prerequisite',
      });
      await tabTo(page, identity);
      await expect(detail.getByRole('tooltip')).toContainText(
        `owf:action:${target.id}`,
      );
      await page.keyboard.press('Escape');
      await expect(detail.getByRole('tooltip')).toHaveCount(0);
      await expect(candidate).toBeVisible();
      await page.keyboard.press('Shift+Tab');
      await expect(
        detail.getByLabel('Add prerequisite', { exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(candidate).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(detail).toBeVisible();
      await expect(detail.getByText(/Added/)).toBeVisible();
      const remove = detail.getByRole('button', {
        name: `Remove prerequisite owf:action:${target.id}`,
      });
      await tabTo(page, remove);
      await page.keyboard.press('Enter');
      await expect(add).toBeFocused();
      await page.keyboard.press('Enter');
      await page.keyboard.type('Outside');
      await expect(candidate).toBeVisible();
      await page.keyboard.press('Enter');
      await expect(candidate).toBeFocused();
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
      await tabTo(page, detail.getByLabel('Title', { exact: true }));
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
      await expect(card.getByRole('alert')).toHaveCount(0);
      await expect(page.getByRole('alert')).toContainText(
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
          .getByRole('region', { name: 'Blocking' })
          .getByText('completed · Satisfied'),
      ).toBeVisible();
      await tabTo(page, detail.getByLabel('Manual block'));
      await page.keyboard.press('Space');
      await expect(
        detail.getByText('Saving will clear the manual block.'),
      ).toBeVisible();
      // Screenshot the scrollable detail at the blocking/picker section.
      await add.scrollIntoViewIfNeeded();
      const selectedRow = detail
        .getByRole('list', { name: 'Prerequisites', exact: true })
        .getByRole('listitem');
      const selectedIdentity = selectedRow.getByRole('button', {
        name: 'Identity for Outside prerequisite',
      });
      await selectedIdentity.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      const selectedLayout = async () => ({
        row: await selectedRow.boundingBox(),
        add: await add.boundingBox(),
        scroll: await detail.evaluate(
          (element: { scrollTop: number }) => element.scrollTop,
        ),
      });
      const beforeHover = await selectedLayout();
      await selectedIdentity.hover();
      await expect(detail.getByRole('tooltip')).toBeVisible();
      expect(await selectedLayout()).toEqual(beforeHover);
      await page.screenshot({
        path: testInfo.outputPath(`floating-identity-${viewport.width}.png`),
      });
      await page.mouse.move(0, 0);
      await expect(detail.getByRole('tooltip')).toHaveCount(0);
      expect(await selectedLayout()).toEqual(beforeHover);
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
      await expect(detail.getByLabel('Manual block')).toBeDisabled();
      await expect(
        detail
          .getByRole('region', { name: 'Blocking' })
          .getByText('Corrected prerequisite'),
      ).toBeVisible();
      await expect(
        detail
          .getByRole('region', { name: 'Blocking' })
          .getByText('open · Unresolved'),
      ).toBeVisible();
      // Refresh a target-only CLI change with a source draft still open.
      await tabTo(page, detail.getByLabel('Title', { exact: true }));
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.type('Preserved draft');
      await add.tap();
      const refreshSearch = detail.getByLabel('Add prerequisite', {
        exact: true,
      });
      await refreshSearch.fill('Corrected prerequisite');
      const refreshCandidates = detail.getByRole('list', {
        name: 'Prerequisite candidates',
      });
      await expect(
        refreshCandidates.getByText('Corrected prerequisite', { exact: true }),
      ).toBeVisible();
      run(
        'set',
        'action',
        target.id,
        '--state',
        'completed',
        '--title',
        'Refreshed target',
        '--owner',
        '/_projects/alpha/',
      );
      await detail.getByRole('button', { name: 'Refresh blocking' }).tap();
      await expect(
        detail
          .getByRole('list', { name: 'Prerequisites', exact: true })
          .getByText('Refreshed target'),
      ).toBeVisible();
      await expect(detail.getByLabel('Title', { exact: true })).toHaveValue(
        'Preserved draft',
      );
      await expect(
        detail.getByRole('button', { name: 'Save changes' }),
      ).toBeEnabled();
      await expect(
        refreshCandidates.getByText('Refreshed target', { exact: true }),
      ).toBeVisible();
      await expect(
        refreshCandidates.getByText('/_projects/alpha/', { exact: true }),
      ).toBeVisible();
      await expect(
        refreshCandidates.getByText('completed', { exact: true }),
      ).toBeVisible();
      await expect(refreshSearch).toHaveValue('Corrected prerequisite');
      await page.keyboard.press('Escape');
      await expect(add).toBeFocused();
      const blocking = detail.getByRole('region', {
        name: 'Blocking',
        exact: true,
      });
      await expect(
        blocking.getByText('/_projects/alpha/', { exact: true }),
      ).toBeVisible();
      const touchIdentity = blocking.getByRole('button', {
        name: 'Identity for Refreshed target',
      });
      await touchIdentity.tap();
      await expect(detail.getByRole('tooltip')).toContainText(
        `owf:action:${target.id}`,
      );
      await expect(detail.getByRole('tooltip')).toContainText(
        '/_projects/alpha/',
      );
      await page.keyboard.press('Escape');
      await expect(detail.getByRole('tooltip')).toHaveCount(0);
      await expect(detail).toBeVisible();
      await add.tap();
      const input = detail.getByLabel('Add prerequisite', { exact: true });
      await input.fill('Source combined');
      const touchCandidate = detail
        .getByRole('list', { name: 'Prerequisite candidates' })
        .getByRole('button', { name: /Add prerequisite.*Source combined/ });
      await touchCandidate.tap();
      await expect(add).toBeFocused();
      await expect(blocking.getByText('Added', { exact: true })).toBeVisible();
      const savedRemove = blocking.getByRole('button', {
        name: `Remove prerequisite owf:action:${target.id}`,
      });
      await savedRemove.tap();
      await expect(
        blocking.getByText('Removed', { exact: true }),
      ).toBeVisible();
      const undo = blocking.getByRole('button', {
        name: `Undo removal of prerequisite owf:action:${target.id}`,
      });
      await undo.tap();
      await expect(blocking.getByText('Removed', { exact: true })).toHaveCount(
        0,
      );
      const longSlug =
        'long-owner-path-for-prerequisite-display-and-touch-verification';
      run('create', 'project', '--title', 'Long owner', '--slug', longSlug);
      for (let index = 0; index < 6; index++)
        run(
          'create',
          'action',
          '--title',
          `Long prerequisite ${index} ${'UnbrokenTitle'.repeat(8)}`,
          '--owner',
          `/_projects/${longSlug}/`,
        );
      await add.tap();
      await input.fill('Long prerequisite');
      const longResults = detail.getByRole('list', {
        name: 'Prerequisite candidates',
      });
      await expect(longResults.getByRole('listitem')).toHaveCount(6);
      await blocking.getByRole('button', { name: 'Refresh blocking' }).tap();
      await expect(input).toHaveValue('Long prerequisite');
      await expect(longResults.getByRole('listitem')).toHaveCount(6);
      await expect(detail.getByLabel('Title', { exact: true })).toHaveValue(
        'Preserved draft',
      );
      await expect(input).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(add).toBeFocused();
      await expect(detail.getByText('Discard unsaved changes?')).toHaveCount(0);
      await add.tap();
      await input.fill('Long prerequisite');
      await expect(longResults.getByRole('listitem')).toHaveCount(6);
      const dialogBounds = await detail.boundingBox();
      const resultsBounds = await longResults.boundingBox();
      expect(resultsBounds!.y).toBeGreaterThanOrEqual(dialogBounds!.y);
      expect(resultsBounds!.y + resultsBounds!.height).toBeLessThanOrEqual(
        dialogBounds!.y + dialogBounds!.height,
      );
      expect(
        await longResults.evaluate(
          (element: { scrollHeight: number; clientHeight: number }) =>
            element.scrollHeight > element.clientHeight,
        ),
      ).toBe(true);
      expect(
        await detail.evaluate(
          (element: { scrollWidth: number; clientWidth: number }) =>
            element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`long-picker-touch-${viewport.width}.png`),
      });
      const longIdentity = longResults
        .getByRole('button', { name: /^Identity for/ })
        .last();
      const tooltip = longIdentity.locator('..').getByRole('tooltip');
      async function expectIdentityInView() {
        await expect(tooltip).toContainText(`/_projects/${longSlug}/`);
        const identityBounds = (await tooltip.boundingBox())!;
        const bounds = (await detail.boundingBox())!;
        // Floating identity can overlap the list boundary, but stays within
        // the dialog without changing its rows or scrolling either container.
        expect(identityBounds.y).toBeGreaterThanOrEqual(bounds.y - 1);
        expect(identityBounds.y + identityBounds.height).toBeLessThanOrEqual(
          bounds.y + bounds.height + 1,
        );
        expect(identityBounds.x).toBeGreaterThanOrEqual(bounds.x - 1);
        expect(identityBounds.x + identityBounds.width).toBeLessThanOrEqual(
          bounds.x + bounds.width + 1,
        );
      }
      await page.mouse.move(0, 0);
      await tabTo(page, longIdentity);
      await expectIdentityInView();
      await page.keyboard.press('Escape');
      await expect(tooltip).toHaveCount(0);
      await expect(longIdentity).toBeFocused();
      const candidateLayout = async () => ({
        label: await longIdentity.boundingBox(),
        results: await longResults.boundingBox(),
        listScroll: await longResults.evaluate(
          (element: { scrollTop: number }) => element.scrollTop,
        ),
        dialogScroll: await detail.evaluate(
          (element: { scrollTop: number }) => element.scrollTop,
        ),
      });
      const beforeCandidateHover = await candidateLayout();
      await longIdentity.hover();
      await expectIdentityInView();
      expect(await candidateLayout()).toEqual(beforeCandidateHover);
      await page.keyboard.press('Escape');
      await page.mouse.move(0, 0);
      await longIdentity.tap();
      await expectIdentityInView();
      await page.screenshot({
        path: testInfo.outputPath(`last-identity-touch-${viewport.width}.png`),
      });
      await page.keyboard.press('Escape');
      await expect(longResults).toBeVisible();
      await longResults
        .getByRole('button', { name: /^Add prerequisite/ })
        .last()
        .tap();
      await expect(add).toBeFocused();
      // A failed Workspace refresh retains known rows, paths and the draft.
      await page.route('**/api/actions*', (route) => route.abort('failed'));
      await blocking.getByRole('button', { name: 'Refresh blocking' }).tap();
      await expect(
        blocking.getByText('Target facts stale/unavailable. Refresh to retry.'),
      ).toBeVisible();
      await add.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath(`pending-error-touch-${viewport.width}.png`),
      });
      await expect(detail.getByLabel('Title', { exact: true })).toHaveValue(
        'Preserved draft',
      );
      expect(
        await detail.evaluate(
          (element: { scrollWidth: number; clientWidth: number }) =>
            element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
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
