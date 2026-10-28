import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, test } from 'vitest';
import {
  initialize,
  createView,
  showView,
  displayView,
  moveAction,
  setAction,
  getAction,
  actionPorts,
  listViews,
} from '../../src/bootstrap/workspaces.js';
import { createAction } from '../../src/application/actions/index.js';
import { serve } from '../../src/bootstrap/server.js';
import { cleanup, temporaryDirectory } from '../support/workspace.js';
import { semanticSnapshot } from '../support/store-snapshot.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(cleanup));
function setup() {
  const root = temporaryDirectory();
  roots.push(root);
  const { store } = initialize(root, 'Order');
  mkdirSync(join(root, '_views'));
  const file = join(root, '_views', 'board.md');
  copyFileSync(
    new URL('../../docs/examples/work-board.md', import.meta.url),
    file,
  );
  const valid = readFileSync(file, 'utf8');
  const create = (title: string, suffix: number, state = 'open') =>
    createAction(
      root,
      { title, state },
      {
        ...actionPorts,
        newId: () =>
          `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`,
      },
    ).result.action;
  const view = () =>
    createView(root, { title: 'Board', definition: '/_views/board.md' }).result
      .view.id;
  const titles = (id: string, column = 'new-actions') =>
    showView(root, id)
      .result.columns.find((item) => item.id === column)!
      .members.map((member) => member.title);
  const rows = (table: string) => {
    const db = new DatabaseSync(store, { readOnly: true });
    try {
      return db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
    } finally {
      db.close();
    }
  };
  const sql = (statement: string) => {
    const db = new DatabaseSync(store);
    try {
      db.exec(statement);
    } finally {
      db.close();
    }
  };
  return { root, store, file, valid, create, view, titles, rows, sql };
}

test('initial ID order, durable inferred reorder, write-free no-ops and instance independence', () => {
  const { root, store, create, view, titles, rows, file, valid } = setup();
  const d = create('D', 4);
  create('C', 3);
  const b = create('B', 2);
  create('A', 1);
  const first = view();
  const second = view();
  expect(titles(first)).toEqual(['A', 'B', 'C', 'D']);
  const events = rows('action_events');
  expect(
    moveAction(root, d.id, { view: first, column: 'new-actions', position: 3 })
      .result,
  ).toMatchObject({
    source_position: 4,
    destination_position: 3,
    changed: true,
    action: d,
  });
  moveAction(root, b.id, { view: first, column: 'new-actions', position: 3 });
  expect(titles(first)).toEqual(['A', 'D', 'B', 'C']);
  expect(titles(second)).toEqual(['A', 'B', 'C', 'D']);
  expect(rows('view_placements')).toEqual([]);
  expect(rows('action_events')).toEqual(events);
  expect(rows('view_events').at(-1)).toMatchObject({
    kind: 'view.order_changed',
  });
  for (const options of [{}, { position: 3 }]) {
    const before = semanticSnapshot(root, store);
    expect(
      moveAction(root, b.id, { view: first, column: 'new-actions', ...options })
        .result.changed,
    ).toBe(false);
    expect(semanticSnapshot(root, store)).toEqual(before);
  }
  expect(
    displayView(root, first).columns[0]!.members.map((member) => member.title),
  ).toEqual(titles(first));
  writeFileSync(file, valid.replace('open: new-actions', 'open: todo'));
  expect(titles(first, 'todo')).toHaveLength(4); // Ordering did not pin inferred placement.
});

test('entry inserts, omission appends, departure/return discards position and content edits retain order', () => {
  const { root, create, view, titles } = setup();
  const a = create('A', 4);
  const b = create('B', 3);
  const c = create('C', 2);
  const id = view();
  moveAction(root, a.id, { view: id, column: 'todo' });
  moveAction(root, b.id, { view: id, column: 'todo' });
  moveAction(root, c.id, { view: id, column: 'todo', position: 2 });
  expect(titles(id, 'todo')).toEqual(['A', 'C', 'B']);
  moveAction(root, c.id, { view: id, column: 'new-actions' });
  moveAction(root, c.id, { view: id, column: 'todo' });
  expect(titles(id, 'todo')).toEqual(['A', 'B', 'C']);
  setAction(root, a.id, { title: 'Renamed', description: 'Content' });
  expect(titles(id, 'todo')).toEqual(['Renamed', 'B', 'C']);
  setAction(root, b.id, { state: 'in_progress' });
  setAction(root, b.id, { state: 'open' });
  expect(titles(id)).toEqual(['B']);
  expect(titles(id, 'todo')).toEqual(['Renamed', 'C']);
});

test('successive lower-ID creations append; later instances start in ID order; HTTP creation shares arrival reconciliation', async () => {
  const { root, store, create, view, titles, file } = setup();
  create('First', 9);
  const id = view();
  create('Second', 8);
  create('Third', 7);
  expect(titles(id)).toEqual(['First', 'Second', 'Third']);
  expect(titles(view())).toEqual(['Third', 'Second', 'First']);
  const server = await serve(root, 0);
  try {
    const address = server.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing port');
    const headers = {
      host: `127.0.0.1:${address.port}`,
      origin: `http://127.0.0.1:${address.port}`,
      'content-type': 'application/json',
    };
    const response = await server.inject({
      method: 'POST',
      url: '/api/actions',
      headers,
      payload: { title: 'HTTP arrival', state: 'open', owner: '/' },
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(titles(id)).toEqual(['First', 'Second', 'Third', 'HTTP arrival']);
    writeFileSync(file, 'Broken required definition');
    const before = semanticSnapshot(root, store);
    const rejected = await server.inject({
      method: 'POST',
      url: '/api/actions',
      headers,
      payload: { title: 'Rejected', state: 'open', owner: '/' },
    });
    expect(rejected.statusCode).toBe(503);
    expect(rejected.body).toContain(listViews(root).result.views[0]!.id);
    expect(semanticSnapshot(root, store)).toEqual(before);
  } finally {
    await server.close();
  }
});

test('state changes reconcile direct dependents, sort simultaneous arrivals, and validate position against final membership', () => {
  const { root, create, view, titles } = setup();
  const p = create('Prerequisite', 9);
  const d = create('D', 2, 'completed');
  const c = create('C', 1, 'completed');
  const id = view();
  for (const dependent of [d, c])
    setAction(root, dependent.id, { addDependency: [p.id] });
  expect(titles(id, 'done')).toEqual([]);
  // Both completed dependents become eligible when P completes. N=3 is valid only after effects.
  const result = moveAction(root, p.id, {
    view: id,
    column: 'done',
    position: 3,
  }).result;
  expect(result.destination_position).toBe(3);
  expect(titles(id, 'done')).toEqual(['C', 'D', 'Prerequisite']);
  setAction(root, p.id, { state: 'open' });
  expect(titles(id, 'done')).toEqual([]);
  setAction(root, p.id, { state: 'completed' });
  expect(titles(id, 'done')).toEqual(['C', 'D', 'Prerequisite']);
});

test('multi-state and dependency-only Blocked reorders preserve all Action data and reject reason options', () => {
  const { root, store, create, view, titles } = setup();
  const p = create('Prerequisite', 9);
  const a = create('A', 1, 'waiting');
  const b = create('B', 2, 'waiting');
  const id = view();
  setAction(root, b.id, { waitingFor: 'Reply' });
  const before = getAction(root, b.id).result.action;
  moveAction(root, b.id, { view: id, column: 'active', position: 1 });
  expect(getAction(root, b.id).result.action).toEqual(before);
  expect(titles(id, 'active')).toEqual(['B', 'A']);
  for (const action of [a, b])
    setAction(root, action.id, { addDependency: [p.id] });
  expect(titles(id, 'blocked')).toEqual(['A', 'B']);
  const blocked = getAction(root, b.id).result.action;
  moveAction(root, b.id, { view: id, column: 'blocked', position: 1 });
  expect(getAction(root, b.id).result.action).toEqual(blocked);
  for (const options of [{ reason: 'Access' }, { waitingFor: 'Reply' }]) {
    const snapshot = semanticSnapshot(root, store);
    expect(() =>
      moveAction(root, b.id, {
        view: id,
        column: 'blocked',
        position: 2,
        ...options,
      }),
    ).toThrow();
    expect(semanticSnapshot(root, store)).toEqual(snapshot);
  }
});

test('external departure reads stay pure, restoration before write can revive order, and a relevant write discards it', () => {
  const { root, store, file, valid, create, view, titles } = setup();
  const a = create('A', 1);
  const b = create('B', 2);
  const id = view();
  moveAction(root, b.id, { view: id, column: 'new-actions', position: 1 });
  const external = valid.replace('open: new-actions', 'open: todo');
  writeFileSync(file, external);
  const before = semanticSnapshot(root, store);
  expect(titles(id, 'todo')).toEqual(['A', 'B']);
  expect(titles(id, 'todo')).toEqual(['A', 'B']);
  expect(
    moveAction(root, b.id, { view: id, column: 'todo', position: 2 }).result
      .changed,
  ).toBe(false);
  expect(semanticSnapshot(root, store)).toEqual(before);
  writeFileSync(file, valid);
  expect(titles(id)).toEqual(['B', 'A']);
  writeFileSync(file, external);
  setAction(root, a.id, { description: 'Record current routing' });
  writeFileSync(file, valid);
  expect(titles(id)).toEqual(['A', 'B']);
});

test('order-only removed references and broken definitions reject relevant writes, including arrivals without prior entries', () => {
  const { root, store, file, valid, create, view, rows } = setup();
  const a = create('A', 1);
  const outside = create('Outside', 2, 'cancelled');
  const id = view();
  expect(rows('view_placements')).toEqual([]);
  for (const broken of [
    valid.replace('id: new-actions', 'id: removed'),
    'Broken',
  ]) {
    writeFileSync(file, broken);
    const before = semanticSnapshot(root, store);
    expect(() => showView(root, id)).toThrow();
    expect(() => create('Arrival', 3)).toThrow(id);
    expect(() => setAction(root, a.id, { state: 'waiting' })).toThrow(id);
    expect(semanticSnapshot(root, store)).toEqual(before);
    expect(listViews(root).result.views).toHaveLength(1);
    setAction(root, outside.id, {
      title: broken === 'Broken' ? 'Still outside' : 'Renamed outside',
    });
  }
});

test.each(['after-order', 'order-event', 'commit'])(
  '%s failure rolls back state, order, placements and events; no-op does not touch order',
  (failure) => {
    const { root, store, create, view, sql } = setup();
    const a = create('A', 1);
    const b = create('B', 2);
    const id = view();
    sql(
      failure === 'commit'
        ? "CREATE TABLE fault (id TEXT REFERENCES actions(id) DEFERRABLE INITIALLY DEFERRED); CREATE TRIGGER fail_order AFTER INSERT ON view_order BEGIN INSERT INTO fault VALUES ('missing'); END;"
        : failure === 'after-order'
          ? "CREATE TRIGGER fail_order AFTER INSERT ON view_order BEGIN SELECT RAISE(ABORT, 'after order'); END;"
          : "CREATE TRIGGER fail_order BEFORE INSERT ON view_events WHEN NEW.kind = 'view.order_changed' BEGIN SELECT RAISE(ABORT, 'order event'); END;",
    );
    const before = semanticSnapshot(root, store);
    expect(
      moveAction(root, a.id, { view: id, column: 'new-actions', position: 1 })
        .result.changed,
    ).toBe(false);
    expect(() =>
      moveAction(root, b.id, { view: id, column: 'new-actions', position: 1 }),
    ).toThrow();
    expect(() =>
      moveAction(root, a.id, { view: id, column: 'active', position: 1 }),
    ).toThrow();
    expect(() => create('Rejected arrival', 3)).toThrow();
    expect(semanticSnapshot(root, store)).toEqual(before);
  },
);

test('invalid final destination position rolls back Action effects and preserves Waiting metadata and all order', () => {
  const { root, store, create, view } = setup();
  const a = create('Waiting', 1, 'waiting');
  const id = view();
  setAction(root, a.id, { waitingFor: 'Keep' });
  const before = semanticSnapshot(root, store);
  expect(() =>
    moveAction(root, a.id, { view: id, column: 'todo', position: 2 }),
  ).toThrow(/Position/);
  expect(semanticSnapshot(root, store)).toEqual(before);
});

test('an empty instance still validates arrival writes; pure reorder leaves a broken other instance untouched', () => {
  const { root, store, create, view, sql, file, valid, rows, titles } = setup();
  const first = view();
  writeFileSync(file, 'Broken empty instance');
  const empty = semanticSnapshot(root, store);
  expect(() => create('Rejected arrival', 1)).toThrow(first);
  expect(semanticSnapshot(root, store)).toEqual(empty);
  writeFileSync(file, valid);
  create('A', 1);
  const b = create('B', 2);
  const second = view();
  sql(
    `UPDATE views SET definition_url = '/_views/missing.md' WHERE id = '${second}'`,
  );
  const other = rows('view_order').filter((row) => row.view_id === second);
  const otherEvents = rows('view_events').filter(
    (row) => row.view_id === second,
  );
  moveAction(root, b.id, { view: first, column: 'new-actions', position: 1 });
  expect(titles(first)).toEqual(['B', 'A']);
  expect(rows('view_order').filter((row) => row.view_id === second)).toEqual(
    other,
  );
  expect(rows('view_events').filter((row) => row.view_id === second)).toEqual(
    otherEvents,
  );
});

test('initial order and instance/event creation are atomic, and order enforces unique members and ranks', () => {
  const { root, store, create, view, sql, rows } = setup();
  const a = create('A', 1);
  const b = create('B', 2);
  const id = view();
  const before = semanticSnapshot(root, store);
  for (const statement of [
    `INSERT INTO view_order VALUES ('${id}', '${a.id}', 'todo', 1)`,
    `UPDATE view_order SET rank = 1 WHERE action_id = '${b.id}'`,
  ])
    expect(() => sql(statement)).toThrow();
  expect(semanticSnapshot(root, store)).toEqual(before);
  sql(
    "CREATE TRIGGER fail_initial_order AFTER INSERT ON view_order BEGIN SELECT RAISE(ABORT, 'initial order'); END;",
  );
  const initial = semanticSnapshot(root, store);
  expect(() => view()).toThrow();
  expect(rows('views')).toHaveLength(1);
  expect(semanticSnapshot(root, store)).toEqual(initial);
});

test('orphaned stored order fails explicitly without read repair or partial writes', () => {
  const { root, store, create, view, sql } = setup();
  const a = create('A', 1);
  const id = view();
  sql(
    `PRAGMA foreign_keys = OFF; INSERT INTO view_order VALUES ('${id}', 'missing', 'todo', 1)`,
  );
  const before = semanticSnapshot(root, store);
  expect(() => showView(root, id)).toThrow(
    expect.objectContaining({ code: 'INVALID_VIEW_ORDER' }),
  );
  expect(() => setAction(root, a.id, { title: 'Rejected' })).toThrow(
    expect.objectContaining({ code: 'INVALID_VIEW_ORDER' }),
  );
  expect(semanticSnapshot(root, store)).toEqual(before);
  expect(listViews(root).result.views).toHaveLength(1);
});
