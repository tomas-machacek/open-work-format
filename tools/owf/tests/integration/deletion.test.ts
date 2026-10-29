import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, test } from 'vitest';
import {
  initialize,
  create,
  createAction,
  createView,
  deleteAction,
  deleteView,
  getAction,
  getView,
  listActions,
  listViews,
  moveAction,
  setAction,
  showView,
  actionPorts,
  viewPorts,
} from '../../src/bootstrap/workspaces.js';
import { deleteAction as deleteWithPorts } from '../../src/application/actions/index.js';
import { deleteView as deleteViewWithPorts } from '../../src/application/views/index.js';
import { serve } from '../../src/bootstrap/server.js';
import { cleanup, temporaryDirectory } from '../support/workspace.js';
import { semanticSnapshot } from '../support/store-snapshot.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(cleanup));
function setup() {
  const root = temporaryDirectory();
  roots.push(root);
  const { store } = initialize(root, 'Delete');
  mkdirSync(join(root, '_views'));
  const file = join(root, '_views', 'board.md');
  copyFileSync(
    new URL('../../docs/examples/work-board.md', import.meta.url),
    file,
  );
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace('owf:\n', 'owf:\n  id: work-board\n'),
  );
  const view = (title: string) =>
    createView(root, { title, definition: '/_views/board.md' }).result.view;
  const action = (title: string, state = 'open') =>
    createAction(root, { title, state }).result.action;
  const sql = (statement: string) => {
    const db = new DatabaseSync(store);
    try {
      db.exec(statement);
    } finally {
      db.close();
    }
  };
  const rows = (table: string) => {
    const db = new DatabaseSync(store, { readOnly: true });
    try {
      return db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
    } finally {
      db.close();
    }
  };
  return { root, store, file, view, action, sql, rows };
}

test.each(['open', 'in_progress', 'waiting', 'completed', 'cancelled'])(
  'permanently deletes %s Actions with one historical receipt; repeat is write-free not-found',
  (state) => {
    const { root, store, action, rows } = setup();
    const target = action('Remove me', state);
    const oldEvents = rows('action_events');
    const time = '2099-01-01T00:00:00.000Z';
    expect(
      deleteWithPorts(root, `owf:action:${target.id}`, {
        ...actionPorts,
        now: () => time,
      }),
    ).toEqual({
      result: {
        status: 'deleted',
        type: 'action',
        root,
        id: target.id,
        title: target.title,
        uri: `owf:action:${target.id}`,
      },
      warnings: [],
    });
    expect(() => getAction(root, target.id)).toThrow(
      expect.objectContaining({ code: 'ACTION_NOT_FOUND' }),
    );
    expect(listActions(root).result.actions).toEqual([]);
    expect(rows('actions')).toEqual([]);
    expect(rows('action_events').slice(0, -1)).toEqual(oldEvents);
    expect(rows('action_events').at(-1)).toMatchObject({
      kind: 'action.deleted',
      action_id: target.id,
      title: target.title,
      created_at: time,
    });
    const before = semanticSnapshot(root, store);
    expect(() => deleteAction(root, target.id)).toThrow(
      expect.objectContaining({ code: 'ACTION_NOT_FOUND' }),
    );
    expect(semanticSnapshot(root, store)).toEqual(before);
  },
);

test('incoming references from terminal/cross-owner sources reject a completed target in stable ID order, preserving everything', () => {
  const { root, store, action, view } = setup();
  const owner = create(root, { type: 'project', title: 'Elsewhere' }).result
    .url;
  const target = action('Completed prerequisite', 'completed');
  const sources = [
    action('Terminal source', 'completed'),
    createAction(root, { title: 'Other owner', owner }).result.action,
  ];
  view('Board');
  for (const source of sources)
    setAction(root, source.id, { addDependency: [target.id] });
  const before = semanticSnapshot(root, store);
  let message = '';
  try {
    deleteAction(root, target.id);
  } catch (error) {
    expect(error).toMatchObject({ code: 'ACTION_IN_USE' });
    message = (error as Error).message;
  }
  const sorted = [...sources].sort((a, b) => (a.id < b.id ? -1 : 1));
  expect(message).toContain(
    sorted.map((a) => `owf:action:${a.id} | ${a.title}`).join('\n'),
  );
  expect(message).toContain('explicitly remove or redirect');
  expect(semanticSnapshot(root, store)).toEqual(before);
  for (const source of sources)
    setAction(root, source.id, { removeDependency: [target.id] });
  deleteAction(root, target.id);
  for (const source of sources)
    expect(getAction(root, source.id).result.action.depends_on).toEqual([]);
});

test('outgoing and self dependencies disappear with their source; another member of a cycle guards deletion', () => {
  const { root, store, action } = setup();
  const a = action('A');
  const b = action('B');
  setAction(root, a.id, { addDependency: [a.id, b.id] });
  setAction(root, b.id, { addDependency: [a.id] });
  const before = semanticSnapshot(root, store);
  expect(() => deleteAction(root, a.id)).toThrow(
    expect.objectContaining({ code: 'ACTION_IN_USE' }),
  );
  expect(semanticSnapshot(root, store)).toEqual(before);
  setAction(root, b.id, { removeDependency: [a.id] });
  const surviving = getAction(root, b.id).result.action;
  deleteAction(root, a.id);
  expect(getAction(root, b.id).result.action).toEqual(surviving);
});

test.each(['missing', 'invalid', 'mismatched'])(
  'Action cleanup ignores %s definitions and unavailable owners, retaining surviving order and facts across instances',
  (broken) => {
    const { root, store, file, action, view, rows } = setup();
    const owner = create(root, { type: 'project', title: 'Owner' }).result;
    const prerequisite = action('Prerequisite', 'completed');
    const first = view('First');
    const second = view('Second');
    const a = action('A');
    const target = createAction(root, {
      title: 'Target',
      owner: owner.url,
      description: 'Optional data',
    }).result.action;
    setAction(root, target.id, {
      addDependency: [prerequisite.id],
      manualBlock: 'Block',
      state: 'waiting',
      waitingFor: 'Reply',
    });
    const b = action('B');
    const c = action('C');
    for (const v of [first, second]) {
      moveAction(root, a.id, { view: v.id, column: 'todo' });
      moveAction(root, target.id, { view: v.id, column: 'todo' });
      moveAction(root, b.id, { view: v.id, column: 'todo' });
      moveAction(root, c.id, { view: v.id, column: 'todo', position: 1 });
    }
    moveAction(root, b.id, { view: second.id, column: 'todo', position: 1 });
    const survivors = listActions(root).result.actions.filter(
      (a) => a.id !== target.id,
    );
    const oldActionEvents = rows('action_events');
    const oldViewEvents = rows('view_events');
    const oldOrder = rows('view_order');
    const oldPlacements = rows('view_placements');
    const valid = readFileSync(file, 'utf8');
    unlinkSync(join(owner.path, 'README.md'));
    if (broken === 'missing') unlinkSync(file);
    else
      writeFileSync(
        file,
        broken === 'invalid'
          ? 'invalid'
          : valid.replace('id: work-board', 'id: different-board'),
      );
    expect(() => getView(root, first.id)).toThrow();
    const markdown = semanticSnapshot(root, store).files;
    deleteAction(root, target.id);
    expect(semanticSnapshot(root, store).files).toEqual(markdown);
    expect(listActions(root).result.actions).toEqual(survivors);
    expect(listViews(root).result.views).toEqual(
      [first, second].sort((a, b) => (a.id < b.id ? -1 : 1)),
    );
    expect(rows('view_placements')).toEqual(
      oldPlacements.filter((r) => r.action_id !== target.id),
    );
    const remaining = rows('view_order');
    expect(remaining.some((r) => r.action_id === target.id)).toBe(false);
    for (const v of [first, second]) {
      const before = oldOrder.filter(
        (r) =>
          r.view_id === v.id &&
          r.column_id === 'todo' &&
          r.action_id !== target.id,
      );
      const after = remaining
        .filter((r) => r.view_id === v.id && r.column_id === 'todo')
        .sort((a, b) => Number(a.rank) - Number(b.rank));
      expect(after.map((r) => r.action_id)).toEqual(
        before
          .sort((a, b) => Number(a.rank) - Number(b.rank))
          .map((r) => r.action_id),
      );
      expect(after.map((r) => r.rank)).toEqual([1, 2, 3]);
    }
    expect(rows('action_events').slice(0, -1)).toEqual(oldActionEvents);
    expect(rows('view_events').slice(0, oldViewEvents.length)).toEqual(
      oldViewEvents,
    );
    expect(
      rows('view_events')
        .slice(oldViewEvents.length)
        .map((r) => r.kind)
        .sort(),
    ).toEqual([
      'view.order_changed',
      'view.order_changed',
      'view.placement_changed',
      'view.placement_changed',
    ]);
    writeFileSync(file, valid);
    for (const v of [first, second]) {
      const members = showView(root, v.id).result.columns.find(
        (col) => col.id === 'todo',
      )!.members;
      expect(members.map((m) => m.position)).toEqual([1, 2, 3]);
      expect(members.some((m) => m.id === target.id)).toBe(false);
    }
    const db = new DatabaseSync(store);
    try {
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      db.close();
    }
  },
);

test.each(['missing', 'invalid', 'mismatched'])(
  'populated View deletion ignores a %s definition and preserves shared data and other instance organization',
  (broken) => {
    const { root, store, file, action, view, rows } = setup();
    const target = action('Prerequisite', 'completed');
    const dependent = action('Dependent');
    setAction(root, dependent.id, { addDependency: [target.id] });
    const first = view('Remove');
    const second = view('Keep');
    moveAction(root, dependent.id, { view: first.id, column: 'todo' });
    moveAction(root, dependent.id, { view: second.id, column: 'todo' });
    const old = Object.fromEntries(
      [
        'actions',
        'action_events',
        'view_placements',
        'view_order',
        'view_events',
      ].map((t) => [t, rows(t)]),
    );
    const valid = readFileSync(file, 'utf8');
    if (broken === 'missing') unlinkSync(file);
    else
      writeFileSync(
        file,
        broken === 'invalid'
          ? 'invalid'
          : valid.replace('id: work-board', 'id: different-board'),
      );
    expect(() => getView(root, first.id)).toThrow();
    const markdown = semanticSnapshot(root, store).files;
    const time = '2099-01-01T00:00:00.000Z';
    expect(
      deleteViewWithPorts(root, first.id, { ...viewPorts, now: () => time })
        .result,
    ).toEqual({
      status: 'deleted',
      type: 'view',
      root,
      id: first.id,
      title: first.title,
    });
    expect(semanticSnapshot(root, store).files).toEqual(markdown);
    expect(rows('actions')).toEqual(old.actions);
    expect(rows('action_events')).toEqual(old.action_events);
    for (const table of ['view_placements', 'view_order'])
      expect(rows(table)).toEqual(
        old[table]!.filter((r) => r.view_id !== first.id),
      );
    expect(rows('view_events').slice(0, -1)).toEqual(old.view_events);
    expect(rows('view_events').at(-1)).toMatchObject({
      kind: 'view.deleted',
      view_id: first.id,
      title: first.title,
      created_at: time,
    });
    expect(listViews(root).result.views).toEqual([second]);
    expect(() => getView(root, first.id)).toThrow(
      expect.objectContaining({ code: 'VIEW_NOT_FOUND' }),
    );
    const before = semanticSnapshot(root, store);
    expect(() => deleteView(root, first.id)).toThrow(
      expect.objectContaining({ code: 'VIEW_NOT_FOUND' }),
    );
    expect(semanticSnapshot(root, store)).toEqual(before);
    writeFileSync(file, valid);
    expect(
      showView(root, second.id).result.columns.find((c) => c.id === 'todo')!
        .members[0]!.id,
    ).toBe(dependent.id);
  },
);

test.each([
  ['action', 'action_events', 'INSERT'],
  ['action', 'view_events', 'INSERT'],
  ['action', 'actions', 'DELETE'],
  ['view', 'view_events', 'INSERT'],
  ['view', 'views', 'DELETE'],
] as const)(
  '%s deletion rolls back all data and history on %s %s failure',
  (type, table, operation) => {
    const { root, store, action, view, sql } = setup();
    const target = action('Target');
    const v = view('Board');
    moveAction(root, target.id, { view: v.id, column: 'todo' });
    sql(
      `CREATE TRIGGER fail_delete BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT, 'injected failure'); END`,
    );
    const before = semanticSnapshot(root, store);
    expect(() =>
      type === 'action'
        ? deleteAction(root, target.id)
        : deleteView(root, v.id),
    ).toThrow(
      expect.objectContaining({
        code: type === 'action' ? 'ACTION_DELETE_FAILED' : 'VIEW_DELETE_FAILED',
      }),
    );
    expect(semanticSnapshot(root, store)).toEqual(before);
  },
);

test.each(['8', '999', 'missing'])(
  'deletion rejects store %s without replacement or mutation',
  (version) => {
    const { root, store, action, view, sql } = setup();
    const target = action('Target');
    const v = view('Board');
    if (version === 'missing') unlinkSync(store);
    else
      sql(
        `UPDATE owf_metadata SET value = '${version}' WHERE key = 'schema_version'`,
      );
    const before = semanticSnapshot(root, store);
    for (const remove of [
      () => deleteAction(root, target.id),
      () => deleteView(root, v.id),
    ]) {
      expect(remove).toThrow(
        expect.objectContaining({
          code:
            version === 'missing'
              ? 'STORE_UNAVAILABLE'
              : 'UNSUPPORTED_STORE_VERSION',
        }),
      );
      expect(semanticSnapshot(root, store)).toEqual(before);
    }
  },
);

test('existing HTTP reads see deleted Actions and instances; missing-object behavior and Default Kanban remain intact', async () => {
  const { root, action, view } = setup();
  const target = action('Target');
  const v = view('Board');
  const server = await serve(root, 0);
  try {
    deleteAction(root, target.id);
    const board = await server.inject('/api/actions');
    expect(board.statusCode).toBe(200);
    expect(board.body).not.toContain(target.id);
    const address = server.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing port');
    expect(
      (
        await server.inject({
          method: 'PATCH',
          url: `/api/actions/${target.id}/state`,
          headers: {
            origin: `http://127.0.0.1:${address.port}`,
            host: `127.0.0.1:${address.port}`,
          },
          payload: {
            state: 'in_progress',
            expected: { state: target.state, updated_at: target.updated_at },
          },
        })
      ).statusCode,
    ).toBe(404);
    const evaluated = await server.inject(`/api/views/${v.id}`);
    expect(evaluated.statusCode).toBe(200);
    expect(evaluated.body).not.toContain(target.id);
    deleteView(root, v.id);
    expect((await server.inject('/api/views')).body).not.toContain(v.id);
    expect((await server.inject(`/api/views/${v.id}`)).statusCode).toBe(404);
    expect((await server.inject('/api/actions')).statusCode).toBe(200);
  } finally {
    await server.close();
  }
});
