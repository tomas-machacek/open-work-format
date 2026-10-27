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
    destination: 'todo',
    changed: true,
    action,
  });
  expect(success('show', 'view', view)).toContain(
    `Todo (todo)\n    ${action.id}`,
  );
  expect(success('show', 'view', second)).toContain(
    `New to organize (new-actions)\n    ${action.id}`,
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
  const guide = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  for (const example of [
    '--column todo',
    '--column blocked --reason "Missing access"',
    '--column waiting-for --waiting-for "Odpoveď dodávateľa"',
  ])
    expect(guide).toContain(example);
  const help = success('move', 'action', '--help');
  expect(help).toContain('--waiting-for');
  expect(help).toContain('same-column');
  for (const args of [
    [...moveArgs, '--column', 'waiting-for', '--waiting-for', 'New'],
    [...moveArgs, '--column', 'todo', '--reason', 'Ignored'],
    [...moveArgs, '--column', 'active', '--waiting-for', 'Ignored'],
    [...moveArgs, '--column', 'waiting-for', '--waiting-for', '\t'],
    [...moveArgs, '--column', 'todo', '--column', 'todo'],
    [...moveArgs, '--column', 'todo', '--before', action.id],
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
  db.exec("UPDATE owf_metadata SET value = '6' WHERE key = 'schema_version'");
  db.close();
  const before = semanticSnapshot(root, store);
  expect(run(...moveArgs, '--column', 'todo', '--json').stdout).toContain(
    'UNSUPPORTED_STORE_VERSION',
  );
  expect(semanticSnapshot(root, store)).toEqual(before);
}, 30_000);
