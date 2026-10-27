import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  initialize,
  createAction,
  getAction,
  createView,
  showView,
  setAction,
  moveAction,
} from '../../../src/bootstrap/workspaces.js';
import { semanticSnapshot } from '../../support/store-snapshot.js';

interface MoveWorld {
  root: string;
  moveStore: string;
  moveViews: string[];
  moveAction: ReturnType<typeof getAction>['result']['action'];
  moveTarget: string;
  moveBefore: ReturnType<typeof semanticSnapshot>;
  moveError: unknown;
}
Given(
  'two move Views sharing New, Todo and Blocked columns and an Open Action',
  function (this: MoveWorld) {
    this.moveStore = initialize(this.root).store;
    mkdirSync(join(this.root, '_views'));
    copyFileSync(
      new URL('../../../docs/examples/work-board.md', import.meta.url),
      join(this.root, '_views', 'board.md'),
    );
    this.moveViews = ['First', 'Second'].map(
      (title) =>
        createView(this.root, { title, definition: '/_views/board.md' }).result
          .view.id,
    );
    this.moveAction = createAction(this.root, {
      title: 'Organize work',
    }).result.action;
  },
);
When(
  'I move the Action to Todo in the first instance',
  function (this: MoveWorld) {
    moveAction(this.root, this.moveAction.id, {
      view: this.moveViews[0]!,
      column: 'todo',
    });
  },
);
Then(
  'it appears in Todo only in the first instance and New in the second',
  function (this: MoveWorld) {
    const columns = this.moveViews.map(
      (view) =>
        showView(this.root, view).result.columns.find((column) =>
          column.members.some((member) => member.id === this.moveAction.id),
        )?.id,
    );
    assert.deepEqual(columns, ['todo', 'new-actions']);
  },
);
Then(
  'its state, content and update timestamp remain unchanged',
  function (this: MoveWorld) {
    assert.deepEqual(
      getAction(this.root, this.moveAction.id).result.action,
      this.moveAction,
    );
  },
);
Given(
  'the Action has an unresolved prerequisite and is explicitly placed in Blocked',
  function (this: MoveWorld) {
    this.moveTarget = createAction(this.root, {
      title: 'Prerequisite',
    }).result.action.id;
    // Include-blocked ordinary placement lets explicit entry establish the manual reason.
    moveAction(this.root, this.moveAction.id, {
      view: this.moveViews[0]!,
      column: 'active',
    });
    setAction(this.root, this.moveAction.id, {
      addDependency: [this.moveTarget],
    });
    moveAction(this.root, this.moveAction.id, {
      view: this.moveViews[0]!,
      column: 'blocked',
      reason: 'Access needed',
    });
  },
);
When(
  'I attempt to move the Action from Blocked to Todo',
  function (this: MoveWorld) {
    this.moveBefore = semanticSnapshot(this.root, this.moveStore);
    try {
      moveAction(this.root, this.moveAction.id, {
        view: this.moveViews[0]!,
        column: 'todo',
      });
    } catch (error) {
      this.moveError = error;
    }
  },
);
Then(
  'the move is rejected without changing Action, placements or events',
  function (this: MoveWorld) {
    assert.ok(this.moveError instanceof Error);
    assert.match(this.moveError.message, /unresolved/);
    assert.deepEqual(
      semanticSnapshot(this.root, this.moveStore),
      this.moveBefore,
    );
  },
);
When(
  'I complete the prerequisite and move the Action to Todo',
  function (this: MoveWorld) {
    setAction(this.root, this.moveTarget, { state: 'completed' });
    moveAction(this.root, this.moveAction.id, {
      view: this.moveViews[0]!,
      column: 'todo',
    });
  },
);
Then(
  'the Action is Open in Todo without a manual block',
  function (this: MoveWorld) {
    const action = getAction(this.root, this.moveAction.id).result.action;
    assert.equal(action.state, 'open');
    assert.equal(action.manual_block, undefined);
    assert.ok(
      showView(this.root, this.moveViews[0]!)
        .result.columns.find((column) => column.id === 'todo')
        ?.members.some((member) => member.id === action.id),
    );
  },
);
