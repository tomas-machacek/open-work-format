import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { afterEach, expect, test } from 'vitest';
import { cleanup, snapshot, temporaryDirectory } from '../support/workspace.js';

const cli = resolve('dist/bootstrap/cli.js');
const roots: string[] = [];
const viewSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  definition: z.object({ url: z.string(), id: z.string().optional() }),
  created_at: z.string(),
});
const envelope = z.object({
  result: z.object({
    status: z.string(),
    type: z.literal('view'),
    root: z.string(),
    view: viewSchema,
  }),
  warnings: z.array(z.unknown()),
});
function run(root: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}
afterEach(() => roots.splice(0).forEach(cleanup));

test('documented View commands work across CLI processes from a descendant with structured and human output', () => {
  const root = temporaryDirectory();
  roots.push(root);
  expect(run(root, ['init']).status).toBe(0);
  const guide = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  const createExample =
    'owf create view --definition /_views/work-board.md --title "My work"';
  expect(guide).toContain(createExample);
  expect(guide).toContain('owf list views');
  expect(guide).toMatch(/owf get view /u);
  mkdirSync(join(root, '_views'));
  copyFileSync(
    new URL('../../docs/examples/work-board.md', import.meta.url),
    join(root, '_views', 'work-board.md'),
  );
  const child = join(root, 'nested', 'child');
  mkdirSync(child, { recursive: true });
  for (const command of [
    ['create', 'view'],
    ['get', 'view'],
    ['list', 'views'],
  ]) {
    const help = run(child, [...command, '--help']);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('--json');
  }
  const created = run(child, [
    'create',
    'view',
    '--definition',
    '/_views/work-board.md',
    '--title',
    'My work',
    '--json',
  ]);
  expect(created.status, created.stdout + created.stderr).toBe(0);
  const saved = envelope.parse(JSON.parse(created.stdout));
  expect(saved.warnings).toEqual([]);
  expect(saved.result).toMatchObject({
    status: 'created',
    root,
    view: { title: 'My work', definition: { url: '/_views/work-board.md' } },
  });
  const before = snapshot(root);
  const retrieved = run(child, ['get', 'view', saved.result.view.id, '--json']);
  expect(retrieved.status, retrieved.stdout + retrieved.stderr).toBe(0);
  expect(envelope.parse(JSON.parse(retrieved.stdout)).result).toMatchObject({
    status: 'found',
    view: saved.result.view,
  });
  const configuration = z
    .object({
      result: z.object({
        definition: z
          .object({
            title: z.string(),
            id: z.string().optional(),
            purpose: z.string().optional(),
            renderer: z.literal('kanban'),
            columns: z.array(
              z
                .object({
                  id: z.string(),
                  title: z.string(),
                  type: z.enum(['status', 'blocked']),
                })
                .passthrough(),
            ),
            defaults: z.record(z.string(), z.string()),
          })
          .strict(),
      }),
    })
    .parse(JSON.parse(retrieved.stdout)).result.definition;
  expect(
    configuration.columns.some((column) => column.type === 'blocked'),
  ).toBe(true);
  const listed = run(child, ['list', 'views', '--json']);
  expect(listed.status).toBe(0);
  expect(
    z
      .object({
        result: z.object({
          status: z.literal('listed'),
          views: z.array(viewSchema),
        }),
      })
      .parse(JSON.parse(listed.stdout)).result.views,
  ).toEqual([saved.result.view]);
  for (const command of [
    ['get', 'view', saved.result.view.id],
    ['list', 'views'],
  ]) {
    const human = run(child, command);
    expect(human.status).toBe(0);
    expect(human.stdout).toContain(saved.result.view.id);
    expect(human.stdout).toContain('My work');
    expect(human.stdout).toContain('/_views/work-board.md');
  }
  expect(snapshot(root)).toEqual(before);
  const failed = run(child, [
    'get',
    'view',
    '00000000-0000-4000-8000-000000000001',
    '--json',
  ]);
  expect(failed.status).toBe(1);
  expect(
    z
      .object({ error: z.object({ code: z.literal('VIEW_NOT_FOUND') }) })
      .parse(JSON.parse(failed.stdout)).error.code,
  ).toBe('VIEW_NOT_FOUND');
  expect(snapshot(root)).toEqual(before);
  const humanCreate = run(child, [
    'create',
    'view',
    '--definition',
    '/_views/work-board.md',
    '--title',
    'Second view',
  ]);
  expect(humanCreate.status).toBe(0);
  expect(humanCreate.stdout).toContain('Second view');
  expect(humanCreate.stdout).toContain('/_views/work-board.md');
});
