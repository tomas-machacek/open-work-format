import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { z } from 'zod';
import {
  initialize,
  createAction,
  createView,
  setAction,
  getAction,
} from '../../src/bootstrap/workspaces.js';
import { cleanup, temporaryDirectory } from '../support/workspace.js';
import { semanticSnapshot } from '../support/store-snapshot.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(cleanup));
const cli = resolve('dist/bootstrap/cli.js');
const receipt = z.object({
  ok: z.literal(true),
  result: z
    .object({
      status: z.literal('deleted'),
      type: z.enum(['action', 'view']),
      root: z.string(),
      id: z.string(),
      title: z.string(),
      uri: z.string().optional(),
    })
    .strict(),
  warnings: z.array(z.unknown()),
});
function setup() {
  const root = temporaryDirectory();
  roots.push(root);
  const { store } = initialize(root);
  const child = join(root, 'child');
  mkdirSync(child);
  const run = (cwd: string, ...args: string[]) =>
    spawnSync(process.execPath, [cli, ...args], {
      cwd,
      encoding: 'utf8',
      input: '',
      timeout: 10000,
    });
  return { root, store, child, run };
}

test('built deletion commands execute noninteractively from root/descendants with UUID/URI selectors, human and JSON receipts and preserved guides', () => {
  const { root, child, run } = setup();
  const guide = readFileSync(join(root, '_knowledge/owf/deletion.md'), 'utf8');
  expect(guide).toContain('owf delete action {id}');
  expect(guide).toContain('owf delete view {view-id} --json');
  for (const [cwd, uri, json] of [
    [root, false, false],
    [child, true, true],
  ] as const) {
    const a = createAction(root, { title: 'Trvalé odstránenie' }).result.action;
    const result = run(
      cwd,
      'delete',
      'action',
      uri ? `owf:action:${a.id}` : a.id,
      ...(json ? ['--json'] : []),
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    if (json)
      expect(receipt.parse(JSON.parse(result.stdout))).toEqual({
        ok: true,
        result: {
          status: 'deleted',
          type: 'action',
          root,
          id: a.id,
          title: a.title,
          uri: `owf:action:${a.id}`,
        },
        warnings: [],
      });
    else
      for (const value of [
        'deleted action',
        a.id,
        a.title,
        `owf:action:${a.id}`,
      ])
        expect(result.stdout).toContain(value);
    expect(() => getAction(root, a.id)).toThrow(
      expect.objectContaining({ code: 'ACTION_NOT_FOUND' }),
    );
  }
  mkdirSync(join(root, '_views'));
  copyFileSync(
    new URL('../../docs/examples/work-board.md', import.meta.url),
    join(root, '_views', 'board.md'),
  );
  for (const json of [false, true]) {
    const v = createView(root, {
      title: 'Instance',
      definition: '/_views/board.md',
    }).result.view;
    const result = run(
      child,
      'delete',
      'view',
      v.id,
      ...(json ? ['--json'] : []),
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    if (json)
      expect(receipt.parse(JSON.parse(result.stdout)).result).toEqual({
        status: 'deleted',
        type: 'view',
        root,
        id: v.id,
        title: v.title,
      });
    else
      for (const value of ['deleted view', v.id, v.title])
        expect(result.stdout).toContain(value);
  }
  writeFileSync(join(root, 'AGENTS.md'), '# Custom instructions\n');
  expect(run(root, 'init').status).toBe(0);
  expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toBe(
    '# Custom instructions\n',
  );
  for (const type of ['action', 'view']) {
    const help = run(root, 'delete', type, '--help');
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('Permanent');
    expect(help.stdout.replace(/\s+/gu, ' ')).toContain(
      type === 'action' ? 'remove or redirect' : 'preserve Actions',
    );
  }
});

test('built CLI reports invalid arguments, missing/repeated IDs and incoming references with agreed codes and no mutation', () => {
  const { root, child, store, run } = setup();
  const target = createAction(root, {
    title: 'Prerequisite',
    state: 'completed',
  }).result.action;
  const source = createAction(root, { title: 'Referring source' }).result
    .action;
  setAction(root, source.id, { addDependency: [target.id] });
  for (const json of [false, true]) {
    const before = semanticSnapshot(root, store);
    const result = run(
      child,
      'delete',
      'action',
      target.id,
      ...(json ? ['--json'] : []),
    );
    expect(result.status).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output).toContain('ACTION_IN_USE');
    expect(output).toContain(`owf:action:${source.id} | ${source.title}`);
    if (json)
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: false,
        error: { code: 'ACTION_IN_USE' },
      });
    expect(semanticSnapshot(root, store)).toEqual(before);
  }
  const absent = '00000000-0000-4000-8000-000000000000';
  for (const [args, status, code] of [
    [['delete', 'action'], 2, 'INVALID_ARGUMENT'],
    [['delete', 'action', 'title'], 2, 'INVALID_ARGUMENT'],
    [['delete', 'action', `owf:action:${target.id}?x`], 2, 'INVALID_ARGUMENT'],
    [['delete', 'action', target.id, 'extra'], 2, 'INVALID_ARGUMENT'],
    [['delete', 'action', target.id, '--force'], 2, 'INVALID_ARGUMENT'],
    [['delete', 'view', '/_views/board.md'], 2, 'INVALID_ARGUMENT'],
    [['delete', 'view', 'Default Kanban'], 2, 'INVALID_ARGUMENT'],
    [['delete', 'view', `owf:action:${target.id}`], 2, 'INVALID_ARGUMENT'],
    [['delete', 'action', absent], 1, 'ACTION_NOT_FOUND'],
    [['delete', 'view', absent], 1, 'VIEW_NOT_FOUND'],
  ] as const) {
    const before = semanticSnapshot(root, store);
    const result = run(child, ...args, '--json');
    expect(result.status, result.stdout + result.stderr).toBe(status);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: { code },
    });
    expect(semanticSnapshot(root, store)).toEqual(before);
  }
  expect(
    run(child, 'set', 'action', source.id, '--remove-dependency', target.id)
      .status,
  ).toBe(0);
  expect(run(child, 'delete', 'action', target.id).status).toBe(0);
  const before = semanticSnapshot(root, store);
  const repeated = run(child, 'delete', 'action', target.id, '--json');
  expect(repeated.status).toBe(1);
  expect(JSON.parse(repeated.stdout)).toMatchObject({
    ok: false,
    error: { code: 'ACTION_NOT_FOUND' },
  });
  expect(semanticSnapshot(root, store)).toEqual(before);
});
