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
  setAction,
  createView,
  showView,
  getView,
  listViews,
} from '../../src/bootstrap/workspaces.js';
import { cleanup, temporaryDirectory } from '../support/workspace.js';
import { semanticSnapshot } from '../support/store-snapshot.js';

const roots: string[] = [];
function workspace() {
  const root = temporaryDirectory();
  roots.push(root);
  const { store } = initialize(root, 'View evaluation');
  mkdirSync(join(root, '_views'));
  const file = join(root, '_views', 'board.md');
  copyFileSync(
    new URL('../../docs/examples/work-board.md', import.meta.url),
    file,
  );
  const view = createView(root, {
    title: 'My work',
    definition: '/_views/board.md',
  }).result.view;
  return { root, store, file, view };
}
function sql(store: string, statement: string) {
  const db = new DatabaseSync(store);
  try {
    db.exec(statement);
  } finally {
    db.close();
  }
}
afterEach(() => roots.splice(0).forEach(cleanup));

test('live Workspace membership and prerequisite facts ignore current context and View membership; reads preserve semantic data', () => {
  const { root, store, file, view } = workspace();
  const second = createView(root, {
    title: 'Another board',
    definition: '/_views/board.md',
  }).result.view;
  const project = create(root, {
    type: 'project',
    title: 'Project',
    slug: 'project',
  }).result.path;
  const prerequisite = createAction(root, {
    title: 'Outside prerequisite',
    state: 'cancelled',
  }).result.action;
  const dependent = createAction(project, { title: 'Dependent' }).result.action;
  const unblocked = createAction(root, { title: 'Unblocked' }).result.action;
  setAction(root, dependent.id, { addDependency: [prerequisite.id] });
  const read = () => {
    const before = semanticSnapshot(root, store);
    const shown = showView(root, view.id).result;
    expect(showView(project, view.id).result).toEqual(shown);
    expect(showView(root, second.id).result.columns).toEqual(shown.columns);
    expect(showView(root, second.id).result.view).toEqual(second);
    expect(semanticSnapshot(root, store)).toEqual(before);
    return shown.columns;
  };
  let columns = read();
  expect(
    columns
      .find((column) => column.id === 'new-actions')!
      .members.map((member) => member.id),
  ).toEqual([unblocked.id]);
  expect(columns.find((column) => column.id === 'blocked')!.members).toEqual([
    { id: dependent.id, title: 'Dependent', state: 'open', blocked: true },
  ]);
  expect(
    columns
      .flatMap((column) => column.members)
      .some((member) => member.id === prerequisite.id),
  ).toBe(false);
  setAction(root, prerequisite.id, { state: 'completed' });
  columns = read();
  expect(columns.find((column) => column.id === 'blocked')!.members).toEqual(
    [],
  );
  expect(
    columns
      .find((column) => column.id === 'new-actions')!
      .members.map((member) => member.id),
  ).toEqual([unblocked.id, dependent.id].sort());
  setAction(root, dependent.id, {
    state: 'waiting',
    manualBlock: 'External reason',
  });
  expect(
    read().find((column) => column.id === 'blocked')!.members[0],
  ).toMatchObject({ id: dependent.id, state: 'waiting', blocked: true });
  setAction(root, dependent.id, { clearManualBlock: true });
  expect(
    read().find((column) => column.id === 'active')!.members[0],
  ).toMatchObject({ id: dependent.id, state: 'waiting', blocked: false });
  setAction(root, dependent.id, {
    removeDependency: [prerequisite.id],
    state: 'open',
  });
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace('open: new-actions', 'open: todo'),
  );
  columns = read();
  expect(
    columns.find((column) => column.id === 'new-actions')!.members,
  ).toEqual([]);
  expect(columns.find((column) => column.id === 'todo')!.members).toHaveLength(
    2,
  );
  expect(getView(root, view.id).result).not.toHaveProperty('columns');
});

test('empty Workspace, no eligible members and zero columns are successful pure reads', () => {
  const { root, store, file, view } = workspace();
  const before = semanticSnapshot(root, store);
  expect(
    showView(root, view.id).result.columns.every(
      (column) => column.members.length === 0,
    ),
  ).toBe(true);
  expect(semanticSnapshot(root, store)).toEqual(before);
  createAction(root, { title: 'Omitted', state: 'cancelled' });
  expect(
    showView(root, view.id).result.columns.flatMap((column) => column.members),
  ).toEqual([]);
  writeFileSync(
    file,
    '---\ntype: OWF View Definition\ntitle: Empty\nowf:\n  renderer: kanban\n  columns: []\n---\n# Empty\n',
  );
  const empty = semanticSnapshot(root, store);
  expect(showView(root, view.id).result.columns).toEqual([]);
  expect(semanticSnapshot(root, store)).toEqual(empty);
});

test('malformed excluded candidates and missing prerequisites fail the whole read with instance and Action diagnostics', () => {
  const { root, store, view } = workspace();
  createAction(root, { title: 'Valid visible member' });
  const excluded = createAction(root, {
    title: 'Excluded candidate',
    state: 'cancelled',
  }).result.action;
  for (const mutation of [
    `UPDATE actions SET owner_url = 'broken' WHERE id = '${excluded.id}'`,
    `UPDATE actions SET owner_url = '/', depends_on = '["owf:action:00000000-0000-4000-8000-000000000001"]' WHERE id = '${excluded.id}'`,
    // Schema 6 has no archived representation; even external constraint bypass is rejected.
    `PRAGMA ignore_check_constraints = ON; UPDATE actions SET depends_on = '[]', state = 'archived' WHERE id = '${excluded.id}'`,
  ]) {
    sql(store, mutation);
    const before = semanticSnapshot(root, store);
    expect(() => showView(root, view.id)).toThrow();
    if (!mutation.includes("state = 'archived'")) {
      expect(() => showView(root, view.id)).toThrow(view.id);
      expect(() => showView(root, view.id)).toThrow(excluded.id);
    }
    expect(semanticSnapshot(root, store)).toEqual(before);
  }
});

test('broken definitions, inconsistent references, invalid instances and store failures never become empty success or mutate data', () => {
  const { root, store, file, view } = workspace();
  const valid = readFileSync(file, 'utf8');
  const failsPurely = (id = view.id) => {
    const before = semanticSnapshot(root, store);
    expect(() => showView(root, id)).toThrow();
    expect(semanticSnapshot(root, store)).toEqual(before);
  };
  failsPurely('00000000-0000-4000-8000-000000000001');
  writeFileSync(file, 'Broken definition');
  failsPurely();
  expect(listViews(root).result.views).toEqual([view]);
  unlinkSync(file);
  failsPurely();
  writeFileSync(file, valid);
  sql(store, `UPDATE views SET definition_id = 'missing-id'`);
  failsPurely();
  sql(
    store,
    `UPDATE views SET definition_id = NULL, definition_url = '/outside.md'`,
  );
  failsPurely();
  sql(
    store,
    `UPDATE views SET definition_url = '/_views/board.md'; UPDATE owf_metadata SET value = '5' WHERE key = 'schema_version'`,
  );
  failsPurely();
  sql(
    store,
    `UPDATE owf_metadata SET value = '999' WHERE key = 'schema_version'`,
  );
  failsPurely();
  unlinkSync(store);
  failsPurely();
});
