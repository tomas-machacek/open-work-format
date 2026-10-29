import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, test, vi } from 'vitest';
import { serve } from '../../src/bootstrap/server.js';
import {
  initialize,
  createAction,
  createView,
  showView,
  listViews,
  getAction,
  setAction,
  viewPorts,
  moveAction,
} from '../../src/bootstrap/workspaces.js';
import { displayView } from '../../src/application/views/index.js';
import { viewResponse, viewsResponse } from '../../src/contracts/index.js';
import { cleanup, temporaryDirectory } from '../support/workspace.js';
import { semanticSnapshot } from '../support/store-snapshot.js';

const roots: string[] = [];
const servers: Awaited<ReturnType<typeof serve>>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  roots.splice(0).forEach(cleanup);
});
async function setup() {
  const root = temporaryDirectory();
  roots.push(root);
  const { store } = initialize(root, 'Web Views');
  mkdirSync(join(root, '_views'));
  const file = join(root, '_views', 'board.md');
  copyFileSync(
    new URL('../../docs/examples/work-board.md', import.meta.url),
    file,
  );
  const view = createView(root, {
    title: 'Instance title',
    definition: '/_views/board.md',
  }).result.view;
  const server = await serve(root, 0);
  servers.push(server);
  const read = () => server.inject(`/api/views/${view.id}`);
  return { root, store, file, view, server, read };
}

test('HTTP detail and Default state writes reconcile placements across instances and direct dependents; stale and broken writes roll back', async () => {
  const { root, store, file, view, server } = await setup();
  const second = createView(root, {
    title: 'Second',
    definition: '/_views/board.md',
  }).result.view;
  const action = createAction(root, { title: 'Source' }).result.action;
  const target = createAction(root, {
    title: 'Prerequisite',
    state: 'completed',
  }).result.action;
  const address = server.server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  const headers = {
    host: `127.0.0.1:${address.port}`,
    origin: `http://127.0.0.1:${address.port}`,
    'content-type': 'application/json',
  };
  const edit = (changes: Record<string, unknown>) => {
    const current = getAction(root, action.id).result.action;
    return server.inject({
      method: 'PATCH',
      url: `/api/actions/${action.id}`,
      headers,
      payload: {
        expected: {
          title: current.title,
          owner: current.owner,
          state: current.state,
          updated_at: current.updated_at,
        },
        ...changes,
      },
    });
  };
  const state = (
    id: string,
    state: string,
    expected = getAction(root, id).result.action,
  ) =>
    server.inject({
      method: 'PATCH',
      url: `/api/actions/${id}/state`,
      headers,
      payload: {
        state,
        expected: { state: expected.state, updated_at: expected.updated_at },
      },
    });
  const column = (viewId: string) =>
    showView(root, viewId).result.columns.find((column) =>
      column.members.some((member) => member.id === action.id),
    )?.id;
  for (const instance of [view, second])
    moveAction(root, action.id, { view: instance.id, column: 'todo' });
  expect((await edit({ manualBlock: 'Access' })).statusCode).toBe(200);
  expect((await edit({ clearManualBlock: true })).statusCode).toBe(200);
  expect([column(view.id), column(second.id)]).toEqual([
    'new-actions',
    'new-actions',
  ]);
  for (const instance of [view, second])
    moveAction(root, action.id, { view: instance.id, column: 'todo' });
  expect((await edit({ addDependency: [target.id] })).statusCode).toBe(200);
  expect((await state(target.id, 'open')).statusCode).toBe(200);
  expect((await state(target.id, 'completed')).statusCode).toBe(200);
  expect([column(view.id), column(second.id)]).toEqual([
    'new-actions',
    'new-actions',
  ]);
  for (const instance of [view, second])
    moveAction(root, action.id, { view: instance.id, column: 'todo' });
  expect((await state(action.id, 'in_progress')).statusCode).toBe(200);
  expect((await state(action.id, 'open')).statusCode).toBe(200);
  expect([column(view.id), column(second.id)]).toEqual([
    'new-actions',
    'new-actions',
  ]);
  // Dependency addition itself invalidates placements; removal must not revive them.
  setAction(root, target.id, { state: 'open' });
  setAction(root, action.id, { removeDependency: [target.id] });
  moveAction(root, action.id, { view: view.id, column: 'todo' });
  expect((await edit({ addDependency: [target.id] })).statusCode).toBe(200);
  expect((await edit({ removeDependency: [target.id] })).statusCode).toBe(200);
  expect(column(view.id)).toBe('new-actions');
  const stale = getAction(root, action.id).result.action;
  setAction(root, action.id, { title: 'New title' });
  const before = semanticSnapshot(root, store);
  expect((await state(action.id, 'waiting', stale)).statusCode).toBe(409);
  expect(semanticSnapshot(root, store)).toEqual(before);
  moveAction(root, action.id, { view: view.id, column: 'todo' });
  writeFileSync(file, 'Broken definition');
  const broken = semanticSnapshot(root, store);
  for (const response of [
    await state(action.id, 'waiting'),
    await edit({ manualBlock: 'Access' }),
  ]) {
    expect(response.statusCode).toBe(503);
    expect(response.body).toContain(listViews(root).result.views[0]!.id);
    expect(semanticSnapshot(root, store)).toEqual(broken);
  }
});

test('HTTP uses the CLI evaluator order and complete facts; reads preserve all semantic data', async () => {
  const { root, store, view, server, read } = await setup();
  const a = createAction(root, {
    title: 'Z first',
    description: 'Full detail',
    state: 'waiting',
    waitingFor: 'Reply',
  }).result.action;
  const b = createAction(root, { title: 'A second' }).result.action;
  setAction(root, a.id, { addDependency: [b.id], manualBlock: 'Reason' });
  createAction(root, { title: 'Omitted', state: 'cancelled' });
  createView(root, { title: view.title, definition: '/_views/board.md' });
  const before = semanticSnapshot(root, store);
  const projection = displayView(root, view.id, viewPorts);
  const response = await read();
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  const web = viewResponse.parse(response.json());
  expect(web.columns).toEqual(projection.columns);
  expect(web.view).toEqual(view);
  expect(
    web.columns.map((column) => ({
      id: column.id,
      title: column.title,
      members: column.members.map((member, index) => ({
        position: index + 1,
        id: member.id,
        title: member.title,
        state: member.state,
        blocked: member.blocking.blocked,
      })),
    })),
  ).toEqual(showView(root, view.id).result.columns);
  expect(
    web.columns
      .flatMap((column) => column.members)
      .find((member) => member.id === a.id),
  ).toEqual(getAction(root, a.id).result.action);
  expect(
    viewsResponse.parse((await server.inject('/api/views')).json()).views,
  ).toEqual(listViews(root).result.views);
  expect(semanticSnapshot(root, store)).toEqual(before);
});

test('View evaluation keeps one SQLite snapshot across concurrent committed arrivals and placement changes', async () => {
  const { root, store, view } = await setup();
  createAction(root, { title: 'First' });
  const second = createAction(root, { title: 'Second' }).result.action;
  const before = showView(root, view.id);
  // WAL allows a writer to commit while the reader retains its earlier snapshot.
  const db = new DatabaseSync(store);
  try {
    db.exec('PRAGMA journal_mode = WAL');
  } finally {
    db.close();
  }
  let committed = false;
  let afterWrite: ReturnType<typeof semanticSnapshot> | undefined;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- The spy calls it with the intercepted SQLite connection via .call().
  const prepare = DatabaseSync.prototype.prepare;
  const intercept = vi
    .spyOn(DatabaseSync.prototype, 'prepare')
    .mockImplementation(function (this: DatabaseSync, sql) {
      const statement = prepare.call(this, sql);
      if (!committed && sql.includes('FROM actions ORDER BY')) {
        const all = statement.all.bind(statement);
        vi.spyOn(statement, 'all').mockImplementation((...parameters) => {
          const rows = all(...parameters);
          committed = true;
          createAction(root, { title: 'Concurrent arrival' });
          moveAction(root, second.id, { view: view.id, column: 'todo' });
          afterWrite = semanticSnapshot(root, store);
          return rows;
        });
      }
      return statement;
    });
  try {
    expect(showView(root, view.id)).toEqual(before);
    expect(committed).toBe(true);
  } finally {
    intercept.mockRestore();
  }
  expect(semanticSnapshot(root, store)).toEqual(afterWrite);
  const current = showView(root, view.id).result.columns;
  expect(current[0]!.members.map((member) => member.title)).toEqual([
    'First',
    'Concurrent arrival',
  ]);
  expect(
    current
      .find((column) => column.id === 'todo')!
      .members.map((member) => member.title),
  ).toEqual(['Second']);
});

test('HTTP distinguishes broken/missing definitions, unknown instances and malformed omitted Actions from empty success without writes', async () => {
  const { root, store, file, server, read } = await setup();
  const valid = readFileSync(file, 'utf8');
  const failure = async () => {
    const before = semanticSnapshot(root, store);
    expect((await read()).statusCode).toBe(503);
    expect(semanticSnapshot(root, store)).toEqual(before);
  };
  writeFileSync(file, 'Broken');
  await failure();
  expect((await server.inject('/api/views')).statusCode).toBe(200);
  expect((await server.inject('/api/actions')).statusCode).toBe(200);
  unlinkSync(file);
  await failure();
  writeFileSync(file, valid);
  expect((await server.inject('/api/views/missing')).statusCode).toBe(404);
  const omitted = createAction(root, { title: 'Excluded', state: 'cancelled' })
    .result.action;
  const db = new DatabaseSync(store);
  db.prepare('UPDATE actions SET owner_url = ? WHERE id = ?').run(
    'broken',
    omitted.id,
  );
  db.close();
  await failure();
});

test('existing HTTP edits reroute blocks, can exclude an Action and never apply column defaults', async () => {
  const { root, file, view, server, read } = await setup();
  const action = createAction(root, {
    title: 'Waiting',
    state: 'waiting',
    waitingFor: 'Reply',
  }).result.action;
  const address = server.server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  const edit = async (changes: Record<string, unknown>) => {
    const current = getAction(root, action.id).result.action;
    const response = await server.inject({
      method: 'PATCH',
      url: `/api/actions/${action.id}`,
      headers: {
        host: `127.0.0.1:${address.port}`,
        origin: `http://127.0.0.1:${address.port}`,
        'content-type': 'application/json',
      },
      payload: {
        expected: {
          title: current.title,
          owner: current.owner,
          state: current.state,
          waiting_for: current.waiting_for,
          updated_at: current.updated_at,
        },
        ...changes,
      },
    });
    expect(response.statusCode).toBe(200);
    return viewResponse.parse((await read()).json());
  };
  let web = await edit({ manualBlock: 'Blocked by supplier' });
  expect(
    web.columns.find((column) => column.id === 'blocked')?.members[0]?.id,
  ).toBe(action.id);
  web = await edit({ clearManualBlock: true });
  expect(
    web.columns.find((column) => column.id === 'active')?.members[0]?.state,
  ).toBe('waiting');
  writeFileSync(
    file,
    '---\ntype: OWF View Definition\ntitle: Only blocked\nowf:\n  renderer: kanban\n  columns:\n    - id: active\n      title: Active\n      status: in_progress\n    - id: new-actions\n      title: New\n      status: open\n    - id: todo\n      title: Todo\n      status: open\n    - id: done\n      title: Done\n      status: completed\n    - id: blocked\n      title: Blocked\n      type: blocked\n---\n# Only blocked\n',
  );
  await edit({ manualBlock: 'Again' });
  web = await edit({ clearManualBlock: true });
  expect(web.columns.flatMap((column) => column.members)).toEqual([]);
  expect(getAction(root, action.id).result.action.state).toBe('waiting');
  writeFileSync(
    file,
    '---\ntype: OWF View Definition\ntitle: Empty\nowf:\n  renderer: kanban\n  columns: []\n---\n# Empty\n',
  );
  expect(viewResponse.parse((await read()).json()).columns).toEqual([]);
  expect(view.id).toBe(web.view.id);
});

test('HTTP positional moves use current transaction facts, enforce reason and rollback all organization on failure', async () => {
  const { root, store, file, view, server, read } = await setup();
  const ids = ['A', 'B', 'C'].map(
    (title) => createAction(root, { title }).result.action.id,
  );
  const address = server.server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  const headers = {
    host: `127.0.0.1:${address.port}`,
    origin: `http://127.0.0.1:${address.port}`,
    'content-type': 'application/json',
  };
  const move = (action: string, column: string, extra = {}) =>
    server.inject({
      method: 'POST',
      url: `/api/views/${view.id}/moves`,
      headers,
      payload: { action, column, ...extra },
    });
  const order = () =>
    showView(root, view.id).result.columns[0]!.members.map((a) => a.id);
  await read();
  moveAction(root, ids[2]!, {
    view: view.id,
    column: 'new-actions',
    position: 1,
  });
  expect((await move(ids[1]!, 'new-actions', { position: 2 })).statusCode).toBe(
    200,
  );
  expect(order()).toEqual([ids[2], ids[1], ids[0]]);
  const before = semanticSnapshot(root, store);
  const outOfRange = await move(ids[1]!, 'new-actions', { position: 4 });
  expect(outOfRange.statusCode).toBe(400);
  expect(outOfRange.json()).toMatchObject({
    error: { code: 'INVALID_ARGUMENT' },
  });
  expect(semanticSnapshot(root, store)).toEqual(before);
  const missingReason = await move(ids[1]!, 'blocked');
  expect(missingReason.statusCode).toBe(400);
  expect(missingReason.json()).toMatchObject({
    error: { code: 'INVALID_ARGUMENT' },
  });
  expect(semanticSnapshot(root, store)).toEqual(before);
  expect(
    (await move(ids[1]!, 'blocked', { reason: 'Access', position: 1 }))
      .statusCode,
  ).toBe(200);
  setAction(root, ids[1]!, { addDependency: [ids[0]!] });
  const blocked = semanticSnapshot(root, store);
  const unresolvedExit = await move(ids[1]!, 'todo');
  expect(unresolvedExit.statusCode).toBe(400);
  expect(unresolvedExit.json()).toMatchObject({
    error: { code: 'INVALID_ARGUMENT' },
  });
  expect(semanticSnapshot(root, store)).toEqual(blocked);
  const db = new DatabaseSync(store);
  try {
    db.exec(
      "CREATE TRIGGER reject_view_event BEFORE INSERT ON view_events BEGIN SELECT RAISE(ABORT, 'injected'); END",
    );
  } finally {
    db.close();
  }
  const withTrigger = semanticSnapshot(root, store);
  const persistenceFailure = await move(ids[0]!, 'todo', { position: 1 });
  expect(persistenceFailure.statusCode).toBe(503);
  expect(persistenceFailure.json()).toMatchObject({
    error: { code: 'ACTION_UPDATE_FAILED' },
  });
  expect(semanticSnapshot(root, store)).toEqual(withTrigger);
  const removeTrigger = new DatabaseSync(store);
  try {
    removeTrigger.exec('DROP TRIGGER reject_view_event');
  } finally {
    removeTrigger.close();
  }
  writeFileSync(file, 'Broken definition');
  const brokenDefinition = semanticSnapshot(root, store);
  const response = await move(ids[0]!, 'todo');
  expect(response.statusCode).toBe(503);
  expect(response.json()).toMatchObject({
    error: { code: 'INVALID_VIEW_DEFINITION' },
  });
  expect(response.body).toContain(view.id);
  expect(semanticSnapshot(root, store)).toEqual(brokenDefinition);
});
