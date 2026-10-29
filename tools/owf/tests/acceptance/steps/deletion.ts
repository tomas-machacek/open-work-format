import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  initialize,
  createAction,
  setAction,
  deleteAction,
  getAction,
  listActions,
  createView,
  deleteView,
  listViews,
  showView,
} from '../../../src/bootstrap/workspaces.js';
import { semanticSnapshot } from '../../support/store-snapshot.js';

interface DeletionWorld {
  root: string;
  deletionStore: string;
  deletionActions: ReturnType<typeof getAction>['result']['action'][];
  deletionViews: string[];
  deletionBefore: ReturnType<typeof semanticSnapshot>;
  deletionDefinition: string;
}
Given(
  'a completed deletion prerequisite and a dependent Action',
  function (this: DeletionWorld) {
    this.deletionStore = initialize(this.root).store;
    this.deletionActions = [
      createAction(this.root, { title: 'Prerequisite', state: 'completed' })
        .result.action,
      createAction(this.root, { title: 'Dependent' }).result.action,
    ];
    setAction(this.root, this.deletionActions[1]!.id, {
      addDependency: [this.deletionActions[0]!.id],
    });
    this.deletionBefore = semanticSnapshot(this.root, this.deletionStore);
  },
);
When(
  'I try to delete the referenced prerequisite',
  function (this: DeletionWorld) {
    assert.throws(() => deleteAction(this.root, this.deletionActions[0]!.id), {
      code: 'ACTION_IN_USE',
    });
  },
);
Then(
  'deletion is rejected and all operational data and history remain unchanged',
  function (this: DeletionWorld) {
    assert.deepEqual(
      semanticSnapshot(this.root, this.deletionStore),
      this.deletionBefore,
    );
  },
);
When(
  'I explicitly remove the dependency and delete the prerequisite',
  function (this: DeletionWorld) {
    setAction(this.root, this.deletionActions[1]!.id, {
      removeDependency: [this.deletionActions[0]!.id],
    });
    deleteAction(this.root, this.deletionActions[0]!.id);
  },
);
Then(
  'only the dependent Action remains without that dependency',
  function (this: DeletionWorld) {
    const remaining = listActions(this.root).result.actions;
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0]!.id, this.deletionActions[1]!.id);
    assert.deepEqual(remaining[0]!.depends_on, []);
    assert.throws(() => getAction(this.root, this.deletionActions[0]!.id), {
      code: 'ACTION_NOT_FOUND',
    });
  },
);
Given(
  'two deletion Views with Actions A, B and C',
  function (this: DeletionWorld) {
    this.deletionStore = initialize(this.root).store;
    mkdirSync(join(this.root, '_views'));
    const file = join(this.root, '_views', 'board.md');
    copyFileSync(
      new URL('../../../docs/examples/work-board.md', import.meta.url),
      file,
    );
    this.deletionDefinition = readFileSync(file, 'utf8');
    this.deletionViews = ['First', 'Second'].map(
      (title) =>
        createView(this.root, { title, definition: '/_views/board.md' }).result
          .view.id,
    );
    this.deletionActions = ['A', 'B', 'C'].map(
      (title) => createAction(this.root, { title }).result.action,
    );
  },
);
When('I permanently delete Action B', function (this: DeletionWorld) {
  deleteAction(this.root, this.deletionActions[1]!.id);
});
Then(
  'both deletion Views retain A and C in consecutive order',
  function (this: DeletionWorld) {
    for (const id of this.deletionViews)
      assert.deepEqual(
        showView(this.root, id).result.columns[0]!.members.map((m) => [
          m.title,
          m.position,
        ]),
        [
          ['A', 1],
          ['C', 2],
        ],
      );
    for (const a of [this.deletionActions[0]!, this.deletionActions[2]!])
      assert.deepEqual(getAction(this.root, a.id).result.action, a);
  },
);
When(
  'I delete the first populated deletion View',
  function (this: DeletionWorld) {
    deleteView(this.root, this.deletionViews[0]!);
  },
);
Then(
  'the second deletion View and all three Actions remain',
  function (this: DeletionWorld) {
    assert.deepEqual(
      listViews(this.root).result.views.map((v) => v.id),
      [this.deletionViews[1]],
    );
    assert.deepEqual(
      showView(
        this.root,
        this.deletionViews[1]!,
      ).result.columns[0]!.members.map((m) => m.title),
      ['A', 'B', 'C'],
    );
    for (const a of this.deletionActions)
      assert.deepEqual(getAction(this.root, a.id).result.action, a);
    assert.equal(
      readFileSync(join(this.root, '_views', 'board.md'), 'utf8'),
      this.deletionDefinition,
    );
  },
);
