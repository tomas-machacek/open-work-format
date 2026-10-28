import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  initialize,
  createAction,
  setAction,
  createView,
  showView,
} from '../../../src/bootstrap/workspaces.js';
import { semanticSnapshot } from '../../support/store-snapshot.js';

interface EvaluationWorld {
  root: string;
  evaluationStore: string;
  evaluationView: string;
  viewActions: string[];
  evaluated: ReturnType<typeof showView>['result']['columns'];
  beforeEvaluation: ReturnType<typeof semanticSnapshot>;
}
Given(
  'a View with overlapping New and Todo columns, New as Open default, and Blocked',
  function (this: EvaluationWorld) {
    this.evaluationStore = initialize(this.root, 'Evaluation').store;
    mkdirSync(join(this.root, '_views'));
    writeFileSync(
      join(this.root, '_views', 'board.md'),
      `---
type: OWF View Definition
title: Board
owf:
  renderer: kanban
  defaults:
    open: new
  columns:
    - id: new
      title: New
      status: open
    - id: todo
      title: Todo
      status: open
    - id: blocked
      title: Blocked
      type: blocked
---
# Board
`,
    );
    this.evaluationView = createView(this.root, {
      title: 'My board',
      definition: '/_views/board.md',
    }).result.view.id;
  },
);
Given(
  'an unblocked Open Action and a manually blocked Open Action',
  function (this: EvaluationWorld) {
    this.viewActions = ['Unblocked work', 'Blocked work'].map(
      (title) => createAction(this.root, { title }).result.action.id,
    );
    setAction(this.root, this.viewActions[1]!, {
      manualBlock: 'Approval needed',
    });
  },
);
When('I inspect the current View content', function (this: EvaluationWorld) {
  this.beforeEvaluation = semanticSnapshot(this.root, this.evaluationStore);
  this.evaluated = showView(this.root, this.evaluationView).result.columns;
});
Then(
  'the unblocked Action appears only in New and the blocked Action only in Blocked',
  function (this: EvaluationWorld) {
    assert.deepEqual(
      this.evaluated.map((column) => column.members.map((member) => member.id)),
      [[this.viewActions[0]], [], [this.viewActions[1]]],
    );
  },
);
Then(
  'Todo is empty and inspecting the View changed no data or events',
  function (this: EvaluationWorld) {
    assert.deepEqual(
      this.evaluated.find((column) => column.id === 'todo')?.members,
      [],
    );
    assert.deepEqual(
      semanticSnapshot(this.root, this.evaluationStore),
      this.beforeEvaluation,
    );
  },
);
When(
  "I clear the View Action's manual block",
  function (this: EvaluationWorld) {
    setAction(this.root, this.viewActions[1]!, { clearManualBlock: true });
  },
);
Then('both Actions appear only in New', function (this: EvaluationWorld) {
  assert.deepEqual(
    this.evaluated.map((column) => column.members.map((member) => member.id)),
    [[...this.viewActions], [], []],
  );
});
