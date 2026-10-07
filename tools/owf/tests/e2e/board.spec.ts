import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { z } from 'zod';
import { boardAction } from '../../src/contracts/index.js';
import { cleanup, temporaryDirectory } from '../support/workspace.js';
const cli = resolve('dist/bootstrap/cli.js');
test('search and recursive owner scope match CLI; excluded writes and keyboard movement stay usable', async ({
  page,
  context,
}, testInfo) => {
  const root = temporaryDirectory();
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout;
  };
  const action = (...args: string[]) =>
    z
      .object({ result: z.object({ action: boardAction }) })
      .parse(JSON.parse(run('create', 'action', ...args, '--json'))).result
      .action;
  run('init', '--title', 'Filter journey');
  run('create', 'project', '--title', 'Alpha');
  run(
    'create',
    'project',
    '--title',
    'Alpha sibling',
    '--slug',
    'alpha-sibling',
  );
  run('create', 'outcome', '--title', 'Ready', '--owner', '/_projects/alpha/');
  run(
    'create',
    'outcome',
    '--title',
    'Nested',
    '--owner',
    '/_projects/alpha/ready/',
  );
  run(
    'create',
    'outcome',
    '--title',
    'Ready',
    '--owner',
    '/_projects/alpha-sibling/',
  );
  const direct = action(
    '--title',
    'Direct',
    '--description',
    'Only description has needle',
    '--owner',
    '/_projects/alpha/',
  );
  const nested = action(
    '--title',
    'Nested task',
    '--description',
    '**needle**',
    '--owner',
    '/_projects/alpha/ready/nested/',
  );
  action(
    '--title',
    'Sibling task',
    '--description',
    'needle',
    '--owner',
    '/_projects/alpha-sibling/ready/',
  );
  const server = spawn(process.execPath, [cli, 'serve', '--port', '14321'], {
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
    await expect.poll(() => output).toContain('http://127.0.0.1:14321');
    await page.goto('http://127.0.0.1:14321');
    const filters = page.getByRole('form', { name: 'Board filters' });
    const search = filters.getByLabel('Search title or description');
    const picker = filters.getByRole('combobox');
    await search.fill('  needle  ');
    await search.press('Enter');
    await expect(
      page.getByRole('status', { name: 'Board refresh' }),
    ).toHaveText('3 matching Actions · up to date');
    await picker.fill('/_projects/alpha/');
    await expect(filters.getByRole('option')).toHaveCount(3);
    await picker.press('ArrowDown');
    await picker.press('Enter');
    await expect(filters.getByText('Unapplied filter changes')).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(3);
    await filters.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('article')).toHaveAttribute(
      'data-action-id',
      direct.id,
    );
    await filters.getByRole('checkbox').check();
    await filters.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.getByRole('article')).toHaveCount(2);
    const cliIds = z
      .object({ result: z.object({ actions: z.array(boardAction) }) })
      .parse(
        JSON.parse(
          run(
            'list',
            'actions',
            '--search',
            'needle',
            '--owner',
            '/_projects/alpha/',
            '--recursive',
            '--json',
          ),
        ),
      )
      .result.actions.map((item) => item.id);
    expect(
      await Promise.all(
        (await page.getByRole('article').all()).map((card) =>
          card.getAttribute('data-action-id'),
        ),
      ),
    ).toEqual(cliIds);
    await page.screenshot({
      path: testInfo.outputPath('filters-desktop.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: testInfo.outputPath('filters-narrow.png'),
      fullPage: true,
    });
    expect(
      await page.evaluate('document.documentElement.scrollWidth <= innerWidth'),
    ).toBe(true);
    await page.setViewportSize({ width: 1280, height: 900 });
    // Applied selection and unapplied drafts survive an actual return to the tab.
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setFocusEmulationEnabled', {
      enabled: false,
    });
    await search.fill('unapplied draft');
    const away = await context.newPage();
    const awaySession = await context.newCDPSession(away);
    await awaySession.send('Emulation.setFocusEmulationEnabled', {
      enabled: false,
    });
    await away.bringToFront();
    run('set', 'action', nested.id, '--title', 'CLI changed nested');
    await page.bringToFront();
    await expect(
      page.getByRole('article').getByText('CLI changed nested'),
    ).toBeVisible();
    await expect(search).toHaveValue('unapplied draft');
    await away.close();
    await page.locator(`[data-action-id="${direct.id}"]`).focus();
    await page.keyboard.press('Enter');
    const detail = page.getByRole('dialog', { name: 'Edit Action' });
    await detail.getByLabel(/Description/).fill('No selected text');
    await detail.getByRole('button', { name: 'Save changes' }).click();
    await expect(
      page.getByText(/saved successfully but the Action does not match/),
    ).toBeVisible();
    await expect(page.locator(`[data-action-id="${direct.id}"]`)).toHaveCount(
      0,
    );
    const open = page.getByRole('region', { name: 'Open', exact: true });
    await open.getByRole('button', { name: 'Add Action' }).click();
    const form = open.getByRole('form');
    await form.getByLabel('Title', { exact: true }).fill('Excluded creation');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      page.getByText(
        'Excluded creation: saved successfully but the Action does not match current filters.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(1);
    await page.locator(`[data-action-id="${nested.id}"]`).focus();
    await page.keyboard.press('Space');
    await expect(
      page.locator(`[data-action-id="${nested.id}"]`),
    ).toHaveAttribute('class', /dragging/);
    // dnd-kit attaches the keyboard listener on the next task.
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
    ).toHaveAttribute('data-action-id', nested.id);
    await filters.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByRole('article')).toHaveCount(4);
    await expect(
      page.getByRole('article').getByText('Excluded creation'),
    ).toBeVisible();
    await expect(search).toHaveValue('');
    await expect(filters.getByRole('checkbox')).toBeDisabled();
  } finally {
    const exited = once(server, 'exit');
    server.kill();
    await exited;
    cleanup(root);
  }
});
async function dragCard(
  page: Page,
  from: Locator,
  to: Locator,
  targetOffsetX?: number,
) {
  // Filters push the board below the initial viewport. Use current visible
  // geometry rather than releasing the pointer outside the browser viewport.
  await to.scrollIntoViewIfNeeded();
  await from.scrollIntoViewIfNeeded();
  const start = await from.boundingBox();
  const end = await to.boundingBox();
  expect(start).not.toBeNull();
  expect(end).not.toBeNull();
  await page.mouse.move(
    start!.x + start!.width / 2,
    start!.y + start!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    end!.x + (targetOffsetX ?? end!.width / 2),
    end!.y + end!.height / 2,
    {
      steps: 12,
    },
  );
  await page.mouse.up();
}
test('built board quietly reflects a CLI change on return to the tab', async ({
  page,
  context,
}) => {
  const root = temporaryDirectory();
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout;
  };
  run('init', '--title', 'Browser journey');
  const server = spawn(process.execPath, [cli, 'serve', '--port', '14317'], {
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
    await expect.poll(() => output).toContain('http://127.0.0.1:14317');
    await page.goto('http://127.0.0.1:14317');
    // Playwright emulates focus on every page by default. Disable that so
    // tab switching produces real browser visibility/focus events.
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setFocusEmulationEnabled', {
      enabled: false,
    });
    await expect(
      page.getByText('No Actions yet.', { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
      'Open0',
      'In Progress0',
      'Waiting0',
      'Completed0',
      'Cancelled0',
    ]);
    run(
      'create',
      'action',
      '--title',
      'Wait for HR',
      '--state',
      'waiting',
      '--waiting-for',
      'HR reply',
    );
    const response = z
      .object({ result: z.object({ action: z.object({ id: z.string() }) }) })
      .parse(
        JSON.parse(
          run('create', 'action', '--title', 'Confirm delivery', '--json'),
        ),
      );
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(
      page
        .getByRole('region', { name: 'Waiting', exact: true })
        .getByText('Wait for HR'),
    ).toBeVisible();
    await expect(page.getByText('HR reply')).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Open', exact: true })
        .getByText('Confirm delivery'),
    ).toBeVisible();
    const away = await context.newPage();
    const awaySession = await context.newCDPSession(away);
    await awaySession.send('Emulation.setFocusEmulationEnabled', {
      enabled: false,
    });
    await away.bringToFront();
    run(
      'set',
      'action',
      response.result.action.id,
      '--state',
      'waiting',
      '--waiting-for',
      'Supplier reply',
    );
    // Delay this one real response to observe the quiet in-flight presentation.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/actions', async (route) => {
      await gate;
      await route.continue();
    });
    await page.bringToFront();
    await expect(
      page.getByRole('status', { name: 'Board refresh' }),
    ).toHaveText('Refreshing…');
    await expect(
      page
        .getByRole('region', { name: 'Open', exact: true })
        .getByText('Confirm delivery'),
    ).toBeVisible();
    release();
    await expect(
      page
        .getByRole('region', { name: 'Waiting', exact: true })
        .getByText('Confirm delivery'),
    ).toBeVisible();
    await expect(page.getByText('Supplier reply')).toBeVisible();
    await away.close();
  } finally {
    if (server.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
    cleanup(root);
  }
});

test('create a Waiting Action with Outcome owner and verify persisted values through CLI', async ({
  page,
}) => {
  const root = temporaryDirectory();
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout;
  };
  run('init', '--title', 'Board creation');
  run('create', 'project', '--title', 'Launch', '--slug', 'launch');
  run(
    'create',
    'outcome',
    '--title',
    'Ready',
    '--slug',
    'ready',
    '--owner',
    '/_projects/launch/',
    '--expected-result',
    'Launch approved',
  );
  const server = spawn(process.execPath, [cli, 'serve', '--port', '14318'], {
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
    await expect.poll(() => output).toContain('http://127.0.0.1:14318');
    await page.goto('http://127.0.0.1:14318');
    const waiting = page.getByRole('region', { name: 'Waiting', exact: true });
    await waiting.getByRole('button', { name: 'Add Action' }).click();
    await expect(page.getByLabel('Title', { exact: true })).toBeFocused();
    await page.keyboard.type('Confirm launch');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Review **release** notes');
    await page.keyboard.press('Tab');
    await page
      .getByRole('form', { name: /Add Action/ })
      .getByRole('combobox', { name: 'Owner' })
      .fill('/_projects/launch/ready/');
    await page.getByRole('option', { name: /ready/ }).click();
    await page.keyboard.press('Tab');
    await expect(
      waiting.getByRole('button', { name: 'Refresh owners' }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.type('Approval from team');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    const card = waiting.getByRole('article');
    await expect(card.getByRole('heading')).toHaveText('Confirm launch');
    await expect(card.getByText('Approval from team')).toBeVisible();
    await expect(card.getByText('/_projects/launch/ready/')).toBeVisible();
    const listed = z
      .object({ result: z.object({ actions: z.array(boardAction) }) })
      .parse(JSON.parse(run('list', 'actions', '--json'))).result.actions;
    const saved = listed.find((action) => action.title === 'Confirm launch');
    expect(saved).toBeDefined();
    const id = saved!.id;
    const persisted = z
      .object({ result: z.object({ action: boardAction }) })
      .parse(JSON.parse(run('get', 'action', id, '--json'))).result.action;
    expect(persisted).toMatchObject({
      title: 'Confirm launch',
      description: 'Review **release** notes',
      owner: { url: '/_projects/launch/ready/' },
      state: 'waiting',
      waiting_for: 'Approval from team',
    });
    await page.reload();
    await expect(waiting.getByRole('article')).toHaveCount(1);
    await expect(waiting.getByText('Approval from team')).toBeVisible();
  } finally {
    if (server.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
    cleanup(root);
  }
});

test('drag an Action into Waiting without a reason, then complete and reopen it', async ({
  page,
}) => {
  const root = temporaryDirectory();
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout;
  };
  run('init', '--title', 'Board movement');
  const created = z
    .object({ result: z.object({ action: boardAction }) })
    .parse(
      JSON.parse(run('create', 'action', '--title', 'Move this', '--json')),
    ).result.action;
  const server = spawn(process.execPath, [cli, 'serve', '--port', '14319'], {
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
  const persisted = () =>
    z
      .object({ result: z.object({ action: boardAction }) })
      .parse(JSON.parse(run('get', 'action', created.id, '--json'))).result
      .action;
  try {
    await expect.poll(() => output).toContain('http://127.0.0.1:14319');
    await page.goto('http://127.0.0.1:14319');
    const open = page.getByRole('region', { name: 'Open', exact: true });
    const waiting = page.getByRole('region', { name: 'Waiting', exact: true });
    await expect(open.getByText('Move this')).toBeVisible();
    await dragCard(
      page,
      open.getByRole('heading', { name: 'Move this' }),
      waiting,
      8,
    );
    await expect(waiting.getByText('Move this')).toBeVisible();
    expect(persisted()).toMatchObject({
      id: created.id,
      state: 'waiting',
      owner: created.owner,
    });
    expect(persisted().waiting_for).toBeUndefined();
    await dragCard(
      page,
      waiting.getByRole('article').getByText('/', { exact: true }),
      page.getByRole('region', { name: 'Completed', exact: true }),
    );
    await expect(
      page
        .getByRole('region', { name: 'Completed', exact: true })
        .getByText('Move this'),
    ).toBeVisible();
    expect(persisted().state).toBe('completed');
    await dragCard(
      page,
      page
        .getByRole('region', { name: 'Completed', exact: true })
        .getByRole('article'),
      open,
    );
    await expect(open.getByText('Move this')).toBeVisible();
    expect(persisted()).toMatchObject({
      state: 'open',
      id: created.id,
      created_at: created.created_at,
    });
    await open.getByRole('article').focus();
    await page.keyboard.press('Space');
    await expect(open.getByRole('article')).toHaveAttribute(
      'class',
      /dragging/,
    );
    // The keyboard sensor attaches its key listener on the next task.
    await page.waitForTimeout(50);
    await page.keyboard.press('ArrowRight');
    await expect(
      page.getByRole('region', { name: 'In Progress', exact: true }),
    ).toHaveAttribute('class', /dropTarget/);
    await page.keyboard.press('Space');
    await expect(
      page
        .getByRole('region', { name: 'In Progress', exact: true })
        .getByText('Move this'),
    ).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'In Progress', exact: true })
        .getByRole('article'),
    ).toBeFocused();
    expect(persisted().state).toBe('in_progress');
    const resized = page.evaluate(
      'new Promise(resolve => window.addEventListener("resize", resolve, {once: true}))',
    );
    await page.setViewportSize({ width: 900, height: 844 });
    await resized;
    await page
      .getByRole('region', { name: 'In Progress', exact: true })
      .getByRole('article')
      .focus();
    await page.keyboard.press('Space');
    await expect(
      page
        .getByRole('region', { name: 'In Progress', exact: true })
        .getByRole('article'),
    ).toHaveAttribute('class', /dragging/);
    await page.waitForTimeout(50);
    await page.keyboard.press('ArrowRight');
    await expect(
      page.getByRole('region', { name: 'Waiting', exact: true }),
    ).toHaveAttribute('class', /dropTarget/);
    await page.keyboard.press('ArrowRight');
    await expect(
      page.getByRole('region', { name: 'Completed', exact: true }),
    ).toHaveAttribute('class', /dropTarget/);
    await page.keyboard.press('Escape');
    expect(persisted().state).toBe('in_progress');
    const mobileContext = await page
      .context()
      .browser()!
      .newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      });
    try {
      const mobile = await mobileContext.newPage();
      await mobile.goto('http://127.0.0.1:14319');
      const mobileCard = mobile
        .getByRole('region', { name: 'In Progress', exact: true })
        .getByRole('article');
      const mobileWaiting = mobile.getByRole('region', {
        name: 'Waiting',
        exact: true,
      });
      await expect(mobileCard).toBeVisible();
      expect(await mobileCard.getByRole('combobox').count()).toBe(0);
      expect(
        await mobile.evaluate(
          'document.documentElement.scrollWidth <= window.innerWidth',
        ),
      ).toBe(true);
      const session = await mobileContext.newCDPSession(mobile);
      const scrollStart = await mobileCard.getByRole('heading').boundingBox();
      expect(scrollStart).not.toBeNull();
      const scrollX = scrollStart!.x + scrollStart!.width / 2;
      const scrollY = scrollStart!.y + scrollStart!.height / 2;
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: scrollX, y: scrollY }],
      });
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: scrollX, y: scrollY - 120 }],
      });
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      await expect
        .poll(() => mobile.evaluate('window.scrollY'))
        .toBeGreaterThan(0);
      expect(persisted().state).toBe('in_progress');
      const touchFrom = await mobileCard.getByRole('heading').boundingBox();
      const touchTo = await mobileWaiting.boundingBox();
      expect(touchFrom).not.toBeNull();
      expect(touchTo).not.toBeNull();
      const x = touchFrom!.x + touchFrom!.width / 2;
      const y = touchFrom!.y + touchFrom!.height / 2;
      const targetX = touchTo!.x + touchTo!.width / 2;
      const targetY = touchTo!.y + touchTo!.height / 2;
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y }],
      });
      await expect(mobileCard).toHaveAttribute('class', /dragging/);
      for (let step = 1; step <= 12; step++) {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            {
              x: x + ((targetX - x) * step) / 12,
              y: y + ((targetY - y) * step) / 12,
            },
          ],
        });
      }
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      await expect(mobileWaiting.getByText('Move this')).toBeVisible();
      expect(persisted().state).toBe('waiting');
    } finally {
      await mobileContext.close();
    }
  } finally {
    if (server.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
    cleanup(root);
  }
});

test('edit a Waiting Action in detail and still move its card by dragging', async ({
  page,
}) => {
  const root = temporaryDirectory();
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout;
  };
  run('init', '--title', 'Board edit');
  const created = z
    .object({ result: z.object({ action: boardAction }) })
    .parse(
      JSON.parse(
        run(
          'create',
          'action',
          '--title',
          'Original',
          '--state',
          'waiting',
          '--waiting-for',
          'Old reply',
          '--json',
        ),
      ),
    ).result.action;
  const server = spawn(process.execPath, [cli, 'serve', '--port', '14320'], {
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
    await expect.poll(() => output).toContain('http://127.0.0.1:14320');
    await page.goto('http://127.0.0.1:14320');
    const waiting = page.getByRole('region', { name: 'Waiting', exact: true });
    await waiting.getByRole('article').click();
    const detail = page.getByRole('dialog', { name: 'Edit Action' });
    await expect(detail.getByLabel('Title')).toBeFocused();
    const ownerPicker = detail.getByRole('combobox', { name: 'Owner' });
    await ownerPicker.fill('Board edit');
    await ownerPicker.press('ArrowDown');
    await expect(detail.getByRole('option')).toHaveCount(1);
    await ownerPicker.press('Escape');
    await expect(ownerPicker).toHaveAttribute('aria-expanded', 'false');
    await expect(detail).toBeVisible();
    await expect(waiting.getByRole('article')).not.toHaveAttribute(
      'class',
      /dragging/,
    );
    await ownerPicker.press('ArrowDown');
    await ownerPicker.press('Enter');
    await expect(detail).toBeVisible();
    await detail.getByLabel('Title').fill('Edited title');
    await detail.getByLabel(/Waiting for/).fill('New reply');
    await detail.getByRole('button', { name: 'Save changes' }).click();
    await expect(detail).toBeHidden();
    await expect(waiting.getByRole('article').getByRole('heading')).toHaveText(
      'Edited title',
    );
    await expect(waiting.getByText('New reply')).toBeVisible();
    const saved = z
      .object({ result: z.object({ action: boardAction }) })
      .parse(JSON.parse(run('get', 'action', created.id, '--json')))
      .result.action;
    expect(saved).toMatchObject({
      title: 'Edited title',
      state: 'waiting',
      waiting_for: 'New reply',
    });
    await waiting.getByRole('article').click();
    await detail.getByLabel('Title').fill('Unsaved title');
    await page.keyboard.press('Escape');
    await expect(
      detail.getByRole('button', { name: 'Continue editing' }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(detail.getByLabel('Title')).toBeFocused();
    await expect(detail.getByLabel('Title')).toHaveValue('Unsaved title');
    await detail.getByRole('button', { name: 'Cancel' }).click();
    await expect(
      detail.getByRole('button', { name: 'Continue editing' }),
    ).toBeFocused();
    await detail.getByRole('button', { name: 'Discard changes' }).click();
    await expect(waiting.getByRole('article')).toBeFocused();
    await dragCard(
      page,
      waiting.getByRole('article').getByRole('heading'),
      page.getByRole('region', { name: 'Completed', exact: true }),
    );
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page
        .getByRole('region', { name: 'Completed', exact: true })
        .getByText('Edited title'),
    ).toBeVisible();
    const moved = z
      .object({ result: z.object({ action: boardAction }) })
      .parse(JSON.parse(run('get', 'action', created.id, '--json')))
      .result.action;
    expect(moved.state).toBe('completed');
    expect(moved.waiting_for).toBeUndefined();
  } finally {
    if (server.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
    cleanup(root);
  }
});
