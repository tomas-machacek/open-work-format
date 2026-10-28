import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, test } from 'vitest';
import {
  initialize,
  createAction,
  getAction,
  setAction,
  createView,
  showView,
  displayView,
  listViews,
  moveAction,
} from '../../src/bootstrap/workspaces.js';
import { cleanup, temporaryDirectory } from '../support/workspace.js';
import { semanticSnapshot } from '../support/store-snapshot.js';

const roots: string[] = [];
function workspace() {
  const root = temporaryDirectory();
  roots.push(root);
  const { store } = initialize(root, 'Move tests');
  mkdirSync(join(root, '_views'));
  const file = join(root, '_views', 'board.md');
  copyFileSync(
    new URL('../../docs/examples/work-board.md', import.meta.url),
    file,
  );
  const valid = readFileSync(file, 'utf8');
  const views = ['First', 'Second'].map(
    (title) =>
      createView(root, { title, definition: '/_views/board.md' }).result.view,
  );
  const action = createAction(root, { title: 'Work' }).result.action;
  const move = (column: string, view = views[0]!.id, options = {}) =>
    moveAction(root, action.id, { view, column, ...options }).result;
  const shown = (view = views[0]!.id) =>
    showView(root, view).result.columns.find((column) =>
      column.members.some((member) => member.id === action.id),
    )?.id;
  return { root, store, file, valid, views, action, move, shown };
}
function sql(store: string, statement: string) {
  const db = new DatabaseSync(store);
  try {
    db.exec(statement);
  } finally {
    db.close();
  }
}
function rows(store: string, table: string) {
  const db = new DatabaseSync(store, { readOnly: true });
  try {
    return db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
  } finally {
    db.close();
  }
}
afterEach(() => roots.splice(0).forEach(cleanup));

test('same-state choices persist independently across reopened connections without Action edits; inferred same-column requests never pin', () => {
  const { root, store, views, action, move, shown } = workspace();
  const before = semanticSnapshot(root, store);
  expect(move('new-actions')).toMatchObject({
    changed: false,
    source: 'new-actions',
  });
  expect(semanticSnapshot(root, store)).toEqual(before);
  expect(move('todo')).toMatchObject({
    source: 'new-actions',
    destination: 'todo',
    changed: true,
    action,
  });
  expect(shown()).toBe('todo');
  expect(shown(views[1]!.id)).toBe('new-actions');
  expect(getAction(root, action.id).result.action).toEqual(action);
  expect(rows(store, 'action_events')).toHaveLength(1);
  expect(rows(store, 'view_placements')).toHaveLength(1);
  expect(
    rows(store, 'view_events')
      .filter((row) => row.kind === 'view.placement_changed')
      .at(-1),
  ).toMatchObject({
    kind: 'view.placement_changed',
    view_id: views[0]!.id,
    action_id: action.id,
    old_column_id: null,
    new_column_id: 'todo',
  });
  // Every application call closes and reopens SQLite; choices survive that boundary.
  move('todo', views[1]!.id);
  move('new-actions');
  expect(
    rows(store, 'view_events')
      .filter((row) => row.kind === 'view.placement_changed')
      .at(-1),
  ).toMatchObject({
    old_column_id: 'todo',
    new_column_id: 'new-actions',
  });
  expect(shown()).toBe('new-actions');
  expect(shown(views[1]!.id)).toBe('todo');
  const pinned = semanticSnapshot(root, store);
  expect(move('new-actions').changed).toBe(false);
  expect(semanticSnapshot(root, store)).toEqual(pinned);
  expect(
    displayView(root, views[1]!.id).columns.find(
      (column) => column.id === 'todo',
    )?.members,
  ).toEqual([action]);
});

test('state/block changes discard invalid choices across instances, retain eligible choices and never restore departed Todo', () => {
  const { root, store, views, action, move, shown } = workspace();
  move('todo');
  move('todo', views[1]!.id);
  setAction(root, action.id, { state: 'in_progress' });
  expect(rows(store, 'view_placements')).toEqual([]);
  setAction(root, action.id, { state: 'open' });
  expect(shown()).toBe('new-actions');
  expect(shown(views[1]!.id)).toBe('new-actions');
  move('todo');
  move('active', views[1]!.id);
  expect(rows(store, 'view_placements')).toHaveLength(1); // selected state invalidated first instance
  setAction(root, action.id, { state: 'waiting', manualBlock: 'Access' });
  expect(shown()).toBe('blocked');
  expect(shown(views[1]!.id)).toBe('active');
  setAction(root, action.id, { clearManualBlock: true, state: 'open' });
  expect(rows(store, 'view_placements')).toEqual([]);
  move('todo');
  setAction(root, action.id, { manualBlock: 'Access' });
  setAction(root, action.id, { clearManualBlock: true });
  expect(shown()).toBe('new-actions');
});

test('prerequisite state changes reconcile direct dependents and a failed Blocked exit preserves every value', () => {
  const { root, store, views, action, move, shown } = workspace();
  const target = createAction(root, {
    title: 'Prerequisite',
    state: 'completed',
  }).result.action;
  setAction(root, action.id, { addDependency: [target.id] });
  move('todo');
  move('todo', views[1]!.id);
  setAction(root, target.id, { state: 'open' });
  expect(rows(store, 'view_placements')).toEqual([]);
  expect(shown()).toBe('blocked');
  // Explicit Blocked move from an include_blocked column establishes a manual reason.
  setAction(root, target.id, { state: 'completed' });
  move('active');
  setAction(root, target.id, { state: 'open' });
  const dependencyOnly = semanticSnapshot(root, store);
  expect(() => move('blocked')).toThrow(/requires a nonblank/);
  expect(semanticSnapshot(root, store)).toEqual(dependencyOnly);
  move('blocked', views[0]!.id, { reason: 'Access' });
  const before = semanticSnapshot(root, store);
  expect(() => move('active')).toThrow(/unresolved/);
  expect(semanticSnapshot(root, store)).toEqual(before);
  setAction(root, target.id, { state: 'completed' });
  expect(move('todo').action).not.toHaveProperty('manual_block');
  expect(shown()).toBe('todo');
  expect(shown(views[1]!.id)).toBe('new-actions');
});

test('external incompatibility is a pure read and may return after restoration; a relevant write removes pre-change residue', () => {
  const { root, store, views, file, valid, action, move, shown } = workspace();
  move('todo');
  const incompatible = valid.replace(
    'title: Todo\n      status: open',
    'title: Todo\n      status: in_progress',
  );
  writeFileSync(file, incompatible);
  const before = semanticSnapshot(root, store);
  expect(shown()).toBe('new-actions');
  expect(semanticSnapshot(root, store)).toEqual(before);
  writeFileSync(file, valid);
  expect(shown()).toBe('todo');
  // An invalid placement must not revive when the very write makes it eligible again.
  writeFileSync(file, incompatible);
  setAction(root, action.id, { state: 'in_progress' });
  expect(rows(store, 'view_placements')).toEqual([]);
  writeFileSync(file, valid);
  setAction(root, action.id, { state: 'open' });
  expect(shown()).toBe('new-actions');
  move('todo');
  writeFileSync(file, incompatible);
  setAction(root, action.id, { title: 'Observed invalidity' });
  writeFileSync(file, valid);
  expect(shown()).toBe('new-actions');
  expect(listViews(root).result.views).toEqual(
    [...views].sort((a, b) => a.id.localeCompare(b.id)),
  );
});

test('titles and defaults preserve eligible identity; removed references and affected broken definitions reject the whole write', () => {
  const { root, store, file, valid, views, action, move, shown } = workspace();
  move('todo');
  writeFileSync(
    file,
    valid
      .replace('title: Todo', 'title: Renamed')
      .replace('open: new-actions', 'open: todo'),
  );
  expect(shown()).toBe('todo');
  for (const invalid of [
    valid.replace('id: todo', 'id: removed'),
    'Broken definition',
  ]) {
    writeFileSync(file, invalid);
    const before = semanticSnapshot(root, store);
    expect(() => showView(root, views[0]!.id)).toThrow();
    expect(() =>
      setAction(root, action.id, {
        state: 'waiting',
        waitingFor: 'New reason',
      }),
    ).toThrow(/View instance .*definition \/_views\/board\.md/u);
    expect(() => move('active')).toThrow();
    expect(semanticSnapshot(root, store)).toEqual(before);
    expect(listViews(root).result.views).toHaveLength(2);
    // Arrival order now requires validating all potentially affected instances.
    expect(() => createAction(root, { title: 'Arrival' })).toThrow();
    expect(semanticSnapshot(root, store)).toEqual(before);
  }
});

test('Waiting reasons persist verbatim across moves, preserve/replace between Waiting columns and clear on departure', () => {
  const { root, store, file, valid, action, move } = workspace();
  writeFileSync(
    file,
    valid.replace(
      '    - id: done',
      '    - id: waiting-for\n      title: Waiting for\n      status: waiting\n    - id: waiting-again\n      title: Waiting again\n      status: waiting\n    - id: done',
    ),
  );
  expect(move('waiting-for').action).not.toHaveProperty('waiting_for');
  const reason = '  Odpoveď\ndodávateľa  ';
  expect(
    move('waiting-again', undefined, { waitingFor: reason }).action.waiting_for,
  ).toBe(reason);
  expect(getAction(root, action.id).result.action.waiting_for).toBe(reason);
  expect(rows(store, 'action_events').at(-1)).toMatchObject({
    kind: 'action.updated',
    old_state: 'waiting',
    new_state: 'waiting',
    old_waiting_for: null,
    new_waiting_for: reason,
    changed_fields: '["waiting_for"]',
  });
  expect(move('waiting-for').action.waiting_for).toBe(reason);
  for (const options of [
    { waitingFor: 'Replacement' },
    { waitingFor: ' \t' },
    { reason: 'Block' },
  ]) {
    const before = semanticSnapshot(root, store);
    expect(() => move('waiting-for', undefined, options)).toThrow();
    expect(semanticSnapshot(root, store)).toEqual(before);
  }
  expect(
    move('waiting-again', undefined, { waitingFor: 'Replacement' }).action
      .waiting_for,
  ).toBe('Replacement');
  expect(move('todo').action).not.toHaveProperty('waiting_for');
});

test.each([
  'after-action',
  'action-event',
  'placement',
  'view-event',
  'commit',
])(
  '%s failure rolls back Action, Waiting reason, placement, timestamps and both event streams',
  (failure) => {
    const { root, store, file, valid, move } = workspace();
    writeFileSync(
      file,
      valid.replace(
        '    - id: done',
        '    - id: waiting-for\n      title: Waiting for\n      status: waiting\n    - id: done',
      ),
    );
    move('todo');
    const trigger =
      failure === 'after-action'
        ? 'AFTER UPDATE ON actions'
        : failure === 'action-event'
          ? 'BEFORE INSERT ON action_events'
          : failure === 'placement'
            ? 'BEFORE INSERT ON view_placements'
            : 'BEFORE INSERT ON view_events';
    sql(
      store,
      failure === 'commit'
        ? `CREATE TABLE fault (id TEXT REFERENCES actions(id) DEFERRABLE INITIALLY DEFERRED); CREATE TRIGGER fail_commit AFTER INSERT ON view_events BEGIN INSERT INTO fault VALUES ('missing'); END;`
        : `CREATE TRIGGER fail_write ${trigger} BEGIN SELECT RAISE(ABORT, 'injected failure'); END;`,
    );
    const before = semanticSnapshot(root, store);
    expect(() =>
      move('waiting-for', undefined, { waitingFor: 'New reason' }),
    ).toThrow();
    expect(semanticSnapshot(root, store)).toEqual(before);
  },
);

test('reason-only move failure restores the previous Waiting reason and placements', () => {
  const { root, store, file, valid, action, move } = workspace();
  writeFileSync(
    file,
    valid.replace(
      '    - id: done',
      '    - id: waiting-for\n      title: Waiting for\n      status: waiting\n    - id: done',
    ),
  );
  move('active');
  setAction(root, action.id, {
    state: 'waiting',
    waitingFor: 'Original reason',
  });
  sql(
    store,
    "CREATE TRIGGER fail_reason_event BEFORE INSERT ON view_events BEGIN SELECT RAISE(ABORT, 'event failure'); END;",
  );
  const before = semanticSnapshot(root, store);
  expect(() =>
    move('waiting-for', undefined, { waitingFor: 'Replacement' }),
  ).toThrow();
  expect(semanticSnapshot(root, store)).toEqual(before);
  expect(getAction(root, action.id).result.action.waiting_for).toBe(
    'Original reason',
  );
});

test('completion prerequisites reject an ordinary-to-ordinary move before Waiting metadata or placement can change', () => {
  const { root, store, action, move } = workspace();
  const target = createAction(root, { title: 'Unresolved prerequisite' }).result
    .action;
  move('active');
  setAction(root, action.id, {
    state: 'waiting',
    waitingFor: 'Keep this reason',
    addDependency: [target.id],
  });
  const before = semanticSnapshot(root, store);
  expect(() => move('done')).toThrow(
    expect.objectContaining({ code: 'ACTION_BLOCKED' }),
  );
  expect(semanticSnapshot(root, store)).toEqual(before);
});

test('a self-dependency prevents completion through both Action editing and a View move without changing stored data', () => {
  const { root, store, action, move } = workspace();
  move('active');
  setAction(root, action.id, {
    state: 'waiting',
    waitingFor: 'Keep this reason',
    addDependency: [action.id],
  });
  const before = semanticSnapshot(root, store);
  expect(() => setAction(root, action.id, { state: 'completed' })).toThrow(
    expect.objectContaining({ code: 'ACTION_BLOCKED' }),
  );
  expect(semanticSnapshot(root, store)).toEqual(before);
  expect(() => move('done')).toThrow(
    expect.objectContaining({ code: 'ACTION_BLOCKED' }),
  );
  expect(semanticSnapshot(root, store)).toEqual(before);
});

test('a broken definition needed by a dependent rejects prerequisite state changes; unrelated content edits still work', () => {
  const { root, store, file, action, move, views } = workspace();
  const target = createAction(root, {
    title: 'Prerequisite',
    state: 'completed',
  }).result.action;
  const outside = createAction(root, { title: 'Outside', state: 'cancelled' })
    .result.action;
  setAction(root, action.id, { addDependency: [target.id] });
  move('todo');
  writeFileSync(file, 'Broken definition');
  const before = semanticSnapshot(root, store);
  expect(() => setAction(root, target.id, { state: 'open' })).toThrow(
    [...views].sort((a, b) => a.id.localeCompare(b.id))[0]!.id,
  );
  expect(semanticSnapshot(root, store)).toEqual(before);
  expect(
    setAction(root, outside.id, { title: 'Renamed outside Action' }).result
      .action.state,
  ).toBe('cancelled');
});

test('inferred same-column no-op leaves even externally invalid other-instance placement untouched', () => {
  const { root, store, file, valid, action, move, views } = workspace();
  move('todo', views[1]!.id);
  writeFileSync(
    file,
    valid.replace(
      'title: Todo\n      status: open',
      'title: Todo\n      status: in_progress',
    ),
  );
  const before = semanticSnapshot(root, store);
  expect(move('new-actions').changed).toBe(false);
  expect(semanticSnapshot(root, store)).toEqual(before);
  writeFileSync(file, valid);
  expect(
    showView(root, views[1]!.id).result.columns.find(
      (column) => column.id === 'todo',
    )?.members[0]?.id,
  ).toBe(action.id);
});

test('schema 6 is rejected without mutation even for moves and reads', () => {
  const { root, store, views, move } = workspace();
  sql(
    store,
    "UPDATE owf_metadata SET value = '6' WHERE key = 'schema_version'",
  );
  const before = semanticSnapshot(root, store);
  expect(() => move('todo')).toThrow(/schema 6/);
  expect(() => showView(root, views[0]!.id)).toThrow(/schema 6/);
  expect(semanticSnapshot(root, store)).toEqual(before);
});
