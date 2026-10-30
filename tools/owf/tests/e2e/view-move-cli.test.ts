import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, test } from 'vitest';
import { z } from 'zod';
import { boardAction } from '../../src/contracts/index.js';
import { initialize } from '../../src/bootstrap/workspaces.js';
import { cleanup, temporaryDirectory } from '../support/workspace.js';
import { semanticSnapshot } from '../support/store-snapshot.js';

const roots: string[] = [];
const cli = resolve('dist/bootstrap/cli.js');
const moveResult = z.object({
  ok: z.literal(true),
  result: z.object({
    status: z.enum(['moved', 'unchanged']),
    type: z.literal('view-move'),
    source: z.string().nullable(),
    source_position: z.number().nullable(),
    destination_position: z.number(),
    destination: z.string(),
    changed: z.boolean(),
    view: z.object({ id: z.string() }),
    action: boardAction,
  }),
  warnings: z.array(z.unknown()),
});
afterEach(() => roots.splice(0).forEach(cleanup));
test('built move CLI works from descendants without a server; generated examples, human/JSON output, errors and schema compatibility', () => {
  const root = temporaryDirectory();
  roots.push(root);
  const { store } = initialize(root);
  const child = join(root, 'nested');
  mkdirSync(child);
  mkdirSync(join(root, '_views'));
  const file = join(root, '_views', 'work-board.md');
  copyFileSync(
    new URL('../../docs/examples/work-board.md', import.meta.url),
    file,
  );
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(
      '    - id: done',
      '    - id: waiting-for\n      title: Waiting for\n      status: waiting\n    - id: done',
    ),
  );
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [cli, ...args], {
      cwd: child,
      encoding: 'utf8',
    });
  const success = (...args: string[]) => {
    const result = run(...args);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    return result.stdout;
  };
  const viewEnvelope = z.object({
    result: z.object({ view: z.object({ id: z.string() }) }),
  });
  const view = viewEnvelope.parse(
    JSON.parse(
      success(
        'create',
        'view',
        '--title',
        'First',
        '--definition',
        '/_views/work-board.md',
        '--json',
      ),
    ),
  ).result.view.id;
  const second = viewEnvelope.parse(
    JSON.parse(
      success(
        'create',
        'view',
        '--title',
        'Second',
        '--definition',
        '/_views/work-board.md',
        '--json',
      ),
    ),
  ).result.view.id;
  const action = z
    .object({ result: z.object({ action: boardAction }) })
    .parse(
      JSON.parse(success('create', 'action', '--title', 'Organize', '--json')),
    ).result.action;
  const moveArgs = ['move', 'action', action.id, '--view', view];
  const parsed = moveResult.parse(
    JSON.parse(success(...moveArgs, '--column', 'todo', '--json')),
  ).result;
  expect(parsed).toMatchObject({
    source: 'new-actions',
    source_position: 1,
    destination_position: 1,
    destination: 'todo',
    changed: true,
    action,
  });
  expect(success('show', 'view', view)).toContain(
    `Todo (todo)\n    1. ${action.id}`,
  );
  expect(success('show', 'view', second)).toContain(
    `New to organize (new-actions)\n    1. ${action.id}`,
  );
  const noOp = semanticSnapshot(root, store);
  expect(success(...moveArgs, '--column', 'todo')).toContain('Changed: false');
  expect(semanticSnapshot(root, store)).toEqual(noOp);
  const human = success(
    ...moveArgs,
    '--column',
    'blocked',
    '--reason',
    'Missing access',
  );
  for (const value of [
    action.id,
    view,
    'Source: todo',
    'Destination: blocked',
    'State: open',
    'Manual block: Missing access',
  ])
    expect(human).toContain(value);
  const waiting = moveResult.parse(
    JSON.parse(
      success(
        ...moveArgs,
        '--column',
        'waiting-for',
        '--waiting-for',
        '  Odpoveď dodávateľa  ',
        '--json',
      ),
    ),
  ).result;
  expect(waiting.action.waiting_for).toBe('  Odpoveď dodávateľa  ');
  expect(waiting.action).not.toHaveProperty('manual_block');
  expect(success('get', 'action', action.id)).toContain(
    'Waiting for:   Odpoveď dodávateľa  ',
  );
  const guide = readFileSync(join(root, '_knowledge/owf/views.md'), 'utf8');
  for (const example of [
    '--column todo',
    '--column blocked --reason "Missing access"',
    '--column waiting-for --waiting-for "Odpoveď dodávateľa"',
  ])
    expect(guide).toContain(example);
  const help = success('move', 'action', '--help');
  expect(help).toContain('--waiting-for');
  expect(help).toContain('--position');
  expect(help).toContain('same-column');
  for (const args of [
    [...moveArgs, '--column', 'waiting-for', '--waiting-for', 'New'],
    [...moveArgs, '--column', 'todo', '--reason', 'Ignored'],
    [...moveArgs, '--column', 'active', '--waiting-for', 'Ignored'],
    [...moveArgs, '--column', 'waiting-for', '--waiting-for', '\t'],
    [...moveArgs, '--column', 'todo', '--column', 'todo'],
    [...moveArgs, '--column', 'todo', '--before', action.id],
    ...['0', '-1', '1.5', 'abc', '1e0', '9007199254740992', '2'].map(
      (position) => [...moveArgs, '--column', 'todo', '--position', position],
    ),
    [...moveArgs, '--column', 'todo', '--position', '1', '--position', '1'],
    [...moveArgs, '--column', 'missing'],
    [...moveArgs],
    ['move', 'action', 'bad-id', '--view', view, '--column', 'todo'],
    ['move', 'action', action.id, '--view', 'missing', '--column', 'todo'],
  ]) {
    const before = semanticSnapshot(root, store);
    const result = run(...args, '--json');
    expect(result.status).not.toBe(0);
    expect(
      z
        .object({
          ok: z.literal(false),
          error: z.object({ code: z.string(), message: z.string() }),
        })
        .parse(JSON.parse(result.stdout)).error.message,
    ).not.toBe('');
    expect(semanticSnapshot(root, store)).toEqual(before);
  }
  const db = new DatabaseSync(store);
  db.exec("UPDATE owf_metadata SET value = '7' WHERE key = 'schema_version'");
  db.close();
  const before = semanticSnapshot(root, store);
  expect(run(...moveArgs, '--column', 'todo', '--json').stdout).toContain(
    'UNSUPPORTED_STORE_VERSION',
  );
  expect(semanticSnapshot(root, store)).toEqual(before);
}, 30_000);

test('built CLI persists final positions across processes, cross-column insertion and return', () => {
  const root = temporaryDirectory();
  roots.push(root);
  initialize(root);
  mkdirSync(join(root, '_views'));
  copyFileSync(
    new URL('../../docs/examples/work-board.md', import.meta.url),
    join(root, '_views', 'board.md'),
  );
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    return result.stdout;
  };
  const idEnvelope = z.object({
    result: z.object({ view: z.object({ id: z.string() }) }),
  });
  const view = idEnvelope.parse(
    JSON.parse(
      run(
        'create',
        'view',
        '--title',
        'Order',
        '--definition',
        '/_views/board.md',
        '--json',
      ),
    ),
  ).result.view.id;
  const actions = ['A', 'B', 'C', 'D'].map(
    (title) =>
      z
        .object({ result: z.object({ action: boardAction }) })
        .parse(JSON.parse(run('create', 'action', '--title', title, '--json')))
        .result.action,
  );
  const move = (title: string, column: string, position?: string) =>
    moveResult.parse(
      JSON.parse(
        run(
          'move',
          'action',
          actions.find((action) => action.title === title)!.id,
          '--view',
          view,
          '--column',
          column,
          ...(position ? ['--position', position] : []),
          '--json',
        ),
      ),
    ).result;
  expect(move('D', 'new-actions', '3')).toMatchObject({
    source_position: 4,
    destination_position: 3,
  });
  expect(move('B', 'new-actions', '3')).toMatchObject({
    source_position: 2,
    destination_position: 3,
  });
  const shown = () =>
    z
      .object({
        result: z.object({
          columns: z.array(
            z.object({
              id: z.string(),
              members: z.array(
                z.object({ title: z.string(), position: z.number() }),
              ),
            }),
          ),
        }),
      })
      .parse(JSON.parse(run('show', 'view', view, '--json'))).result.columns;
  expect(shown()[0]!.members).toEqual(
    ['A', 'D', 'B', 'C'].map((title, index) => ({
      title,
      position: index + 1,
    })),
  );
  expect(move('B', 'todo', '1')).toMatchObject({
    source_position: 3,
    destination_position: 1,
  });
  expect(move('B', 'new-actions')).toMatchObject({
    source_position: 1,
    destination_position: 4,
  });
  expect(shown()[0]!.members.map((member) => member.title)).toEqual([
    'A',
    'D',
    'C',
    'B',
  ]);
  expect(run('show', 'view', view)).toContain('4. ' + actions[1]!.id);
}, 30_000);
