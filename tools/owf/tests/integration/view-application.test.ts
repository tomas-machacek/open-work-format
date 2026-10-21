import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, test } from 'vitest';
import {
  initialize,
  createView,
  getView,
  listViews,
} from '../../src/bootstrap/workspaces.js';
import { cleanup, snapshot, temporaryDirectory } from '../support/workspace.js';

const roots: string[] = [];
function workspace() {
  const root = temporaryDirectory();
  roots.push(root);
  const { store } = initialize(root, 'Views');
  mkdirSync(join(root, '_views'));
  const file = join(root, '_views', 'board.md');
  writeFileSync(
    file,
    `---
type: OWF View Definition
title: Board
owf:
  renderer: kanban
  columns:
    - id: todo
      title: Todo
      status: open
---
# Board
`,
  );
  return { root, store, file };
}
afterEach(() => roots.splice(0).forEach(cleanup));

test('rejected creates leave no instance, event or Markdown change', () => {
  const { root, file } = workspace();
  expect(listViews(root).result.views).toEqual([]);
  const before = snapshot(root);
  for (const input of [
    { title: ' ', definition: '/_views/board.md' },
    { title: 'Work', definition: '' },
    { title: 'Work', definition: '/_views/missing.md' },
  ]) {
    expect(() => createView(root, input)).toThrow();
    expect(snapshot(root)).toEqual(before);
  }
  writeFileSync(file, 'Not a View definition');
  const invalidBefore = snapshot(root);
  expect(() =>
    createView(root, { title: 'Work', definition: '/_views/board.md' }),
  ).toThrow();
  expect(snapshot(root)).toEqual(invalidBefore);
  expect(listViews(root).result.views).toEqual([]);
});

test('failed current-definition reads preserve instances and inventory remains available', () => {
  const { root, file } = workspace();
  const view = createView(root, {
    title: 'Work',
    definition: '/_views/board.md',
  }).result.view;
  for (const missing of [false, true]) {
    if (missing) unlinkSync(file);
    else writeFileSync(file, 'Invalid current definition');
    const before = snapshot(root);
    expect(() => getView(root, view.id)).toThrow();
    expect(listViews(root).result.views).toEqual([view]);
    expect(snapshot(root)).toEqual(before);
  }
});

test('unknown instance and unavailable or unsupported store fail without initializing or modifying data', () => {
  const { root, store } = workspace();
  const before = snapshot(root);
  expect(() => getView(root, '00000000-0000-4000-8000-000000000001')).toThrow();
  expect(snapshot(root)).toEqual(before);
  const db = new DatabaseSync(store);
  db.exec("UPDATE owf_metadata SET value = '999' WHERE key = 'schema_version'");
  db.close();
  const unsupported = snapshot(root);
  expect(() => listViews(root)).toThrow();
  expect(snapshot(root)).toEqual(unsupported);
  unlinkSync(store);
  const missing = snapshot(root);
  expect(() => listViews(root)).toThrow();
  expect(snapshot(root)).toEqual(missing);
});
