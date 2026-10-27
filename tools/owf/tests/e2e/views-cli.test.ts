import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { afterEach, expect, test } from 'vitest';
import { cleanup, snapshot, temporaryDirectory } from '../support/workspace.js';
import { semanticSnapshot } from '../support/store-snapshot.js';
import { initialize } from '../../src/bootstrap/workspaces.js';

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
    ['show', 'view'],
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
  // Allow CLI process startup under concurrent suite load on Windows;
  // this journey verifies behavior, not a performance limit.
}, 30_000);

test('show View has matching ordered human/JSON content from root and Project context, live changes and explicit failures', () => {
  const root = temporaryDirectory();
  roots.push(root);
  const { store } = initialize(root, 'Show views');
  const guide = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  expect(guide).toContain('owf show view {view-id} --json');
  expect(guide).toContain('Eligible stored placements are retained.');
  expect(guide).toContain('Unplaced Open Actions go to New to organize.');
  mkdirSync(join(root, '_views'));
  const definition = join(root, '_views', 'work-board.md');
  copyFileSync(
    new URL('../../docs/examples/work-board.md', import.meta.url),
    definition,
  );
  const created = run(root, [
    'create',
    'view',
    '--definition',
    '/_views/work-board.md',
    '--title',
    'My work',
    '--json',
  ]);
  expect(created.status).toBe(0);
  const view = envelope.parse(JSON.parse(created.stdout)).result.view;
  expect(
    run(root, ['create', 'project', '--title', 'Project', '--slug', 'project'])
      .status,
  ).toBe(0);
  const child = join(root, '_projects', 'project');
  const actionEnvelope = z.object({
    result: z.object({ action: z.object({ id: z.string() }) }),
  });
  const ids = ['Read brief', 'Review result'].map((title) => {
    const created = run(root, ['create', 'action', '--title', title, '--json']);
    expect(created.status).toBe(0);
    return actionEnvelope.parse(JSON.parse(created.stdout)).result.action.id;
  });
  expect(
    run(root, ['set', 'action', ids[1]!, '--manual-block', 'Needs approval'])
      .status,
  ).toBe(0);
  const showEnvelope = z.object({
    ok: z.literal(true),
    warnings: z.array(z.unknown()),
    result: z.object({
      status: z.literal('evaluated'),
      type: z.literal('view'),
      view: viewSchema,
      columns: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          members: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              state: z.enum([
                'open',
                'in_progress',
                'waiting',
                'completed',
                'cancelled',
              ]),
              blocked: z.boolean(),
            }),
          ),
        }),
      ),
    }),
  });
  const before = semanticSnapshot(root, store);
  const shown = run(root, ['show', 'view', view.id, '--json']);
  expect(shown.status, shown.stdout + shown.stderr).toBe(0);
  const parsed = showEnvelope.parse(JSON.parse(shown.stdout));
  expect(parsed.result.view).toEqual(view);
  expect(
    parsed.result.columns.map((column) =>
      column.members.map((member) => member.id),
    ),
  ).toEqual([[ids[0]], [], [], [ids[1]], []]);
  const descendant = run(child, ['show', 'view', view.id, '--json']);
  expect(descendant.status).toBe(0);
  expect(JSON.parse(descendant.stdout)).toEqual(JSON.parse(shown.stdout));
  const human = run(child, ['show', 'view', view.id]);
  expect(human.status).toBe(0);
  expect(human.stdout).toContain('My work');
  expect(human.stdout).toContain(view.id);
  function expectHumanColumns(
    output: string,
    columns: z.infer<typeof showEnvelope>['result']['columns'],
  ) {
    // Compare complete column sections so misplaced, duplicated or reordered
    // cards cannot pass merely by appearing somewhere in the output.
    const sections = output
      .split('Columns:\n')[1]
      ?.trimEnd()
      .split(/\n(?= {2}\S)/u);
    expect(sections).toEqual(
      columns.map((column) =>
        [
          `  ${column.title} (${column.id})`,
          ...(column.members.length === 0
            ? ['    (empty)']
            : column.members.map(
                (member) =>
                  `    ${member.id} | ${member.title} | ${member.state} | blocked: ${String(member.blocked)}`,
              )),
        ].join('\n'),
      ),
    );
  }
  expectHumanColumns(human.stdout, parsed.result.columns);
  expect(semanticSnapshot(root, store)).toEqual(before);
  expect(
    run(root, ['set', 'action', ids[1]!, '--clear-manual-block']).status,
  ).toBe(0);
  const cleared = run(child, ['show', 'view', view.id, '--json']);
  expect(cleared.status).toBe(0);
  const clearedColumns = showEnvelope.parse(JSON.parse(cleared.stdout)).result
    .columns;
  expect(clearedColumns[0]!.members.map((member) => member.id)).toEqual(
    [...ids].sort(),
  );
  const clearedHuman = run(child, ['show', 'view', view.id]);
  expect(clearedHuman.status).toBe(0);
  expectHumanColumns(clearedHuman.stdout, clearedColumns);
  writeFileSync(definition, 'Broken definition');
  const broken = semanticSnapshot(root, store);
  const failed = run(child, ['show', 'view', view.id, '--json']);
  expect(failed.status).toBe(1);
  expect(
    z
      .object({
        ok: z.literal(false),
        error: z.object({
          code: z.literal('INVALID_VIEW_DEFINITION'),
          message: z.string(),
        }),
      })
      .parse(JSON.parse(failed.stdout)).error.message,
  ).toContain(view.id);
  expect(JSON.parse(failed.stdout)).not.toHaveProperty('result');
  const humanFailure = run(child, ['show', 'view', view.id]);
  expect(humanFailure.status).toBe(1);
  expect(humanFailure.stdout).toBe('');
  expect(humanFailure.stderr).toContain('INVALID_VIEW_DEFINITION');
  expect(run(child, ['list', 'views']).status).toBe(0);
  // Repeat initialization preserves an existing user-edited guide.
  writeFileSync(join(root, 'AGENTS.md'), 'My custom guide\n');
  expect(run(child, ['init']).status).toBe(0);
  expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toBe(
    'My custom guide\n',
  );
  writeFileSync(join(root, 'AGENTS.md'), guide);
  expect(semanticSnapshot(root, store)).toEqual(broken);
  // Allow CLI process startup under concurrent suite load on Windows;
  // this journey verifies behavior, not a performance limit.
}, 30_000);
