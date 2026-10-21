import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  initialize,
  createAction,
  listActions,
  createView,
  getView,
  listViews,
} from '../../../src/bootstrap/workspaces.js';
import { snapshot } from '../../support/workspace.js';

interface ViewWorld {
  root: string;
  views?: ReturnType<typeof createView>['result']['view'][];
  viewsBeforeRead?: Record<string, string>;
}

Given(
  'a Workspace with a shared View definition and an Action',
  function (this: ViewWorld) {
    initialize(this.root, 'Views');
    createAction(this.root, { title: 'Shared work' });
    mkdirSync(join(this.root, '_views'));
    writeFileSync(
      join(this.root, '_views', 'shared.md'),
      `---
type: OWF View Definition
title: Shared board
owf:
  renderer: kanban
  columns:
    - id: todo
      title: Todo
      status: open
---
# Shared board
`,
    );
  },
);

When(
  'I create two View instances with the same title and definition',
  function (this: ViewWorld) {
    const before = readFileSync(join(this.root, '_views', 'shared.md'), 'utf8');
    const actionsBefore = listActions(this.root);
    this.views = [0, 1].map(
      () =>
        createView(this.root, {
          title: 'My work',
          definition: '/_views/shared.md',
        }).result.view,
    );
    assert.equal(
      readFileSync(join(this.root, '_views', 'shared.md'), 'utf8'),
      before,
    );
    assert.deepEqual(listActions(this.root), actionsBefore);
  },
);

Then(
  'the View instances have different identities',
  function (this: ViewWorld) {
    assert.ok(this.views);
    assert.equal(new Set(this.views.map((view) => view.id)).size, 2);
  },
);

When(
  'I change a column title in their shared definition',
  function (this: ViewWorld) {
    const file = join(this.root, '_views', 'shared.md');
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace('title: Todo', 'title: Ready'),
    );
    this.viewsBeforeRead = snapshot(this.root);
  },
);

Then(
  'both View instances show the current column title and retain their metadata',
  function (this: ViewWorld) {
    assert.ok(this.views);
    for (const original of this.views) {
      const found = getView(this.root, original.id).result;
      assert.deepEqual(found.view, original);
      assert.ok(found.definition);
      assert.equal(found.definition.columns[0]?.title, 'Ready');
      assert.equal(found.definition.title, 'Shared board');
      assert.equal(found.view.title, 'My work');
    }
    assert.deepEqual(
      listViews(this.root).result.views,
      [...this.views].sort((a, b) => a.id.localeCompare(b.id)),
    );
  },
);

Then(
  'reading the Views leaves the entire Workspace unchanged',
  function (this: ViewWorld) {
    assert.deepEqual(snapshot(this.root), this.viewsBeforeRead);
  },
);
