import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  initialize,
  createActionInView,
  displayView,
  createAction,
  createView,
  showView,
  moveAction,
  getAction,
} from '../../../src/bootstrap/workspaces.js';

interface OrderWorld {
  root: string;
  orderViews: string[];
  orderActions: ReturnType<typeof getAction>['result']['action'][];
}
Given(
  'two ordering Views with Actions A, B, C and D in arrival order',
  function (this: OrderWorld) {
    initialize(this.root);
    mkdirSync(join(this.root, '_views'));
    copyFileSync(
      new URL('../../../docs/examples/work-board.md', import.meta.url),
      join(this.root, '_views', 'board.md'),
    );
    this.orderViews = ['First', 'Second'].map(
      (title) =>
        createView(this.root, { title, definition: '/_views/board.md' }).result
          .view.id,
    );
    this.orderActions = ['A', 'B', 'C', 'D'].map(
      (title) => createAction(this.root, { title }).result.action,
    );
  },
);
When(
  'I put D at position 3 and then B at position 3 in the first ordering View',
  function (this: OrderWorld) {
    for (const title of ['D', 'B'])
      moveAction(
        this.root,
        this.orderActions.find((action) => action.title === title)!.id,
        { view: this.orderViews[0]!, column: 'new-actions', position: 3 },
      );
  },
);
When(
  'I insert B first in Todo and return it without a position',
  function (this: OrderWorld) {
    const id = this.orderActions.find((action) => action.title === 'B')!.id;
    moveAction(this.root, id, {
      view: this.orderViews[0]!,
      column: 'todo',
      position: 1,
    });
    assert.equal(
      showView(this.root, this.orderViews[0]!).result.columns.find(
        (column) => column.id === 'todo',
      )!.members[0]!.title,
      'B',
    );
    moveAction(this.root, id, {
      view: this.orderViews[0]!,
      column: 'new-actions',
    });
  },
);
Then(
  /^the first ordering View shows (A, D, B, C|A, D, C, B)$/,
  function (this: OrderWorld, titles: string) {
    assert.deepEqual(
      showView(this.root, this.orderViews[0]!).result.columns[0]!.members.map(
        (member) => member.title,
      ),
      titles.split(', '),
    );
  },
);
Then(
  'the second ordering View and all Actions retain their original organization and data',
  function (this: OrderWorld) {
    assert.deepEqual(
      showView(this.root, this.orderViews[1]!).result.columns[0]!.members.map(
        (member) => member.title,
      ),
      ['A', 'B', 'C', 'D'],
    );
    for (const action of this.orderActions)
      assert.deepEqual(getAction(this.root, action.id).result.action, action);
  },
);

When(
  'I create a new Action directly in Todo of the first ordering View',
  function (this: OrderWorld) {
    const view = this.orderViews[0]!;
    createActionInView(
      this.root,
      { title: 'New chosen Action' },
      {
        view,
        column: 'todo',
        expected_definition: displayView(this.root, view).creation_definition!,
      },
    );
  },
);
Then(
  'the new Action is in Todo only in the chosen View and Open in the Workspace',
  function (this: OrderWorld) {
    const first = showView(this.root, this.orderViews[0]!).result.columns;
    const second = showView(this.root, this.orderViews[1]!).result.columns;
    const member = first.find((c) => c.id === 'todo')!.members[0]!;
    assert.equal(member.title, 'New chosen Action');
    assert.equal(getAction(this.root, member.id).result.action.state, 'open');
    assert.equal(second.find((c) => c.id === 'todo')!.members.length, 0);
    assert(
      second
        .find((c) => c.id === 'new-actions')!
        .members.some((a) => a.id === member.id),
    );
  },
);
