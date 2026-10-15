import type { Action } from '../../../src/application/actions/index.js';
import {
  After,
  Given,
  Then,
  When,
  World,
  setWorldConstructor,
} from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import {
  existsSync,
  renameSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  initialize,
  createAction,
  getAction,
  listActions,
  setAction,
  workspacePorts,
  create,
} from '../../../src/bootstrap/workspaces.js';
import type {
  CreateResult,
  ContextInput,
} from '../../../src/application/contexts/index.js';
import {
  WorkspaceError,
  type WorkspaceResult,
} from '../../../src/application/workspaces/index.js';
import {
  cleanup,
  snapshot,
  temporaryDirectory,
} from '../../support/workspace.js';

class WorkspaceWorld extends World {
  listed: Action[] = [];
  action: Action | undefined;
  actionOwner = '';
  prerequisite: Action | undefined;
  blockedBefore: Action | undefined;
  base = temporaryDirectory();
  root = this.base;
  cwd = this.root;
  result: WorkspaceResult | undefined;
  created: CreateResult | undefined;
  error: WorkspaceError | undefined;
  before: Record<string, string> = {};
  create(input: ContextInput) {
    try {
      this.created = create(this.cwd, input);
    } catch (error) {
      if (!(error instanceof WorkspaceError)) throw error;
      this.error = error;
    }
  }
  initialize(title?: string) {
    try {
      this.result = initialize(this.cwd, title);
    } catch (error) {
      if (!(error instanceof WorkspaceError)) throw error;
      this.error = error;
    }
  }
}
setWorldConstructor(WorkspaceWorld);
When(
  'I set its execution state to {string} with reason {string}',
  function (this: WorkspaceWorld, state: string, waitingFor: string) {
    assert.ok(this.action);
    this.action = setAction(this.root, this.action.id, {
      state,
      waitingFor,
    }).result.action;
  },
);
When(
  'I set its execution state to {string}',
  function (this: WorkspaceWorld, state: string) {
    assert.ok(this.action);
    this.action = setAction(this.root, this.action.id, { state }).result.action;
  },
);
Then(
  'its persisted execution state is {string} with reason {string}',
  function (this: WorkspaceWorld, state: string, reason: string) {
    assert.ok(this.action);
    const stored = getAction(this.root, this.action.id).result.action;
    assert.equal(stored.state, state);
    assert.equal(stored.waiting_for, reason);
  },
);
Then(
  'its persisted execution state is {string} without a waiting reason',
  function (this: WorkspaceWorld, state: string) {
    assert.ok(this.action);
    const stored = getAction(this.root, this.action.id).result.action;
    assert.equal(stored.state, state);
    assert.equal('waiting_for' in stored, false);
  },
);
Given(
  'mixed Action states under Kitchen, a nested Outcome and the Workspace',
  function (this: WorkspaceWorld) {
    initialize(this.root, 'States');
    const project = create(this.root, {
      type: 'project',
      title: 'Kitchen',
    }).result;
    const outcome = create(project.path, {
      type: 'outcome',
      title: 'Ready',
    }).result;
    for (const [path, title, state] of [
      [project.path, 'Open step', 'open'],
      [project.path, 'Done step', 'completed'],
      [outcome.path, 'Wait step', 'waiting'],
      [this.root, 'Other wait', 'waiting'],
      [this.root, 'Cancelled step', 'cancelled'],
    ] as const) {
      const action = createAction(path, { title }).result.action;
      setAction(this.root, action.id, { state });
    }
    assert.equal(listActions(this.root).result.actions.length, 5);
    assert.deepEqual(
      listActions(this.root, { state: ['in_progress'] }).result.actions,
      [],
    );
    this.before = snapshot(this.root);
  },
);
When(
  'I select states {string} under Kitchen in {word} mode',
  function (this: WorkspaceWorld, states: string, mode: string) {
    this.listed = listActions(this.root, {
      owner: '/_projects/kitchen/',
      recursive: mode === 'recursive',
      state: states.split(','),
    }).result.actions;
  },
);
Given(
  'Actions owned by Workspace, Kitchen, two nested Outcomes and Kitchenette',
  function (this: WorkspaceWorld) {
    initialize(this.root, 'Listing');
    const kitchen = create(this.root, {
      type: 'project',
      title: 'Kitchen',
    }).result;
    const parent = create(kitchen.path, {
      type: 'outcome',
      title: 'Parent',
    }).result;
    const child = create(parent.path, {
      type: 'outcome',
      title: 'Child',
    }).result;
    const sibling = create(this.root, {
      type: 'project',
      title: 'Kitchenette',
    }).result;
    for (const [path, title] of [
      [this.root, 'Workspace'],
      [kitchen.path, 'Kitchen'],
      [parent.path, 'Parent'],
      [child.path, 'Child'],
      [sibling.path, 'Kitchenette'],
    ] as const)
      createAction(path, { title });
    this.cwd = child.path;
    this.before = snapshot(this.root);
  },
);
When(
  'I list Actions with owner {string} and mode {word}',
  function (this: WorkspaceWorld, owner: string, mode: string) {
    this.listed = listActions(
      this.cwd,
      owner === 'all' ? {} : { owner, recursive: mode === 'recursive' },
    ).result.actions;
  },
);
Then(
  'the listed titles are exactly {string}',
  function (this: WorkspaceWorld, titles: string) {
    assert.deepEqual(
      this.listed.map((action) => action.title).sort(),
      titles.split(',').sort(),
    );
    assert.deepEqual(snapshot(this.root), this.before);
  },
);
Given(
  'I am working inside Project {string}',
  function (this: WorkspaceWorld, title: string) {
    initialize(this.root, 'Work');
    this.cwd = create(this.root, { type: 'project', title }).result.path;
    this.before = snapshot(this.cwd);
  },
);
Given(
  'Project {string} exists in the same Workspace',
  function (this: WorkspaceWorld, title: string) {
    create(this.root, { type: 'project', title });
  },
);
When(
  'I create a Project titled {string}',
  function (this: WorkspaceWorld, title: string) {
    this.create({ type: 'project', title });
  },
);
Then(
  'an active Project {string} exists directly in the Workspace project collection',
  function (this: WorkspaceWorld, title: string) {
    assert.equal(this.created?.result.owner, '/');
    assert.equal(this.created.result.title, title);
    assert.equal(
      this.created.result.path,
      join(this.root, '_projects', 'garden'),
    );
    assert.match(
      readFileSync(join(this.created.result.path, 'README.md'), 'utf8'),
      /state: active/u,
    );
  },
);
Then('the existing Project is unchanged', function (this: WorkspaceWorld) {
  assert.deepEqual(snapshot(this.cwd), this.before);
});
When(
  'I create an Outcome titled {string} owned by Project Garden',
  function (this: WorkspaceWorld, title: string) {
    this.create({ type: 'outcome', title, owner: '/_projects/garden/' });
  },
);
Then(
  'the new active Outcome belongs to Project Garden',
  function (this: WorkspaceWorld) {
    assert.equal(this.created?.result.owner, '/_projects/garden/');
    assert.match(
      readFileSync(join(this.created.result.path, 'README.md'), 'utf8'),
      /state: active/u,
    );
  },
);
Then(
  'its expected result is {string}',
  function (this: WorkspaceWorld, result: string) {
    assert.ok(this.created);
    assert.ok(
      readFileSync(
        join(this.created.result.path, 'README.md'),
        'utf8',
      ).includes(`## Expected Result\n\n${result}\n`),
    );
  },
);
When(
  'I create an Outcome without selecting an owner',
  function (this: WorkspaceWorld) {
    this.create({ type: 'outcome', title: 'Result' });
  },
);
Then(
  'creation fails because an owner is required',
  function (this: WorkspaceWorld) {
    assert.equal(this.error?.code, 'OWNER_REQUIRED');
    assert.equal(this.created, undefined);
  },
);
Given(
  'an initialized Workspace with user-edited agent guidance',
  function (this: WorkspaceWorld) {
    initialize(this.root, 'Work');
    writeFileSync(join(this.root, 'AGENTS.md'), 'My custom instructions\n');
    this.before = snapshot(this.root);
  },
);
After(function (this: WorkspaceWorld) {
  cleanup(this.base);
});
Given(
  'an existing directory outside any Workspace',
  function (this: WorkspaceWorld) {},
);
Given(
  'an existing directory named {string} outside any Workspace',
  function (this: WorkspaceWorld, name: string) {
    this.root = join(this.base, name);
    mkdirSync(this.root);
    this.cwd = this.root;
  },
);
Given(
  'an initialized Workspace with title {string}',
  function (this: WorkspaceWorld, title: string) {
    initialize(this.root, title);
    this.before = snapshot(this.root);
  },
);
Given('I am in its {word}', function (this: WorkspaceWorld, location: string) {
  if (location === 'subdirectory') {
    this.cwd = join(this.root, 'child');
    mkdirSync(this.cwd);
    this.before = snapshot(this.root);
  }
});
Given(
  'a directory outside any Workspace containing an ordinary README',
  function (this: WorkspaceWorld) {
    writeFileSync(join(this.root, 'README.md'), '# Ordinary\n');
    this.before = snapshot(this.root);
  },
);
Given(
  'an initialized Workspace whose declared store is missing',
  function (this: WorkspaceWorld) {
    const result = initialize(this.root, 'Original');
    unlinkSync(result.store);
    this.before = snapshot(this.root);
  },
);
When(
  'I initialize it with the title {string}',
  function (this: WorkspaceWorld, title: string) {
    this.initialize(title);
  },
);
When(
  'I initialize with the title {string}',
  function (this: WorkspaceWorld, title: string) {
    this.initialize(title);
  },
);
When(
  'I initialize it without an explicit title',
  function (this: WorkspaceWorld) {
    this.initialize();
  },
);
When(
  'I initialize it with a whitespace-only title',
  function (this: WorkspaceWorld) {
    this.initialize('  ');
  },
);
When('I initialize that directory', function (this: WorkspaceWorld) {
  this.initialize();
});
When('I initialize from a subdirectory', function (this: WorkspaceWorld) {
  this.cwd = join(this.root, 'child');
  mkdirSync(this.cwd);
  this.before = snapshot(this.root);
  this.initialize();
});
Then(
  'it contains Workspace metadata with title {string}',
  function (this: WorkspaceWorld, title: string) {
    assert.equal(
      workspacePorts.documents.parse(
        readFileSync(join(this.root, 'README.md'), 'utf8'),
        this.root,
      )?.title,
      title,
    );
  },
);
Then(
  'a navigation index and one initialization log entry exist',
  function (this: WorkspaceWorld) {
    assert.match(
      readFileSync(join(this.root, 'index.md'), 'utf8'),
      /\[Workspace\]\(README.md\)/u,
    );
    assert.equal(
      readFileSync(join(this.root, 'log.md'), 'utf8').match(
        /^- Initialized Workspace/gmu,
      )?.length,
      1,
    );
  },
);
Then(
  'the declared local store has recognized schema version 5',
  function (this: WorkspaceWorld) {
    assert.ok(this.result);
    workspacePorts.store.validate(this.result.store);
  },
);
Then(
  'the result identifies the directory as the Workspace root',
  function (this: WorkspaceWorld) {
    assert.equal(this.result?.root, this.root);
  },
);
Then(
  'the Workspace title is {string}',
  function (this: WorkspaceWorld, title: string) {
    assert.equal(this.result?.title, title);
  },
);
Then(
  'initialization fails with {word}',
  function (this: WorkspaceWorld, code: string) {
    assert.equal(this.error?.code, code);
    assert.equal(this.result, undefined);
  },
);
Then('no Workspace artifacts are created', function (this: WorkspaceWorld) {
  assert.deepEqual(snapshot(this.root), {});
});
Then(
  'the result is already_initialized with title {string}',
  function (this: WorkspaceWorld, title: string) {
    assert.equal(this.result?.status, 'already_initialized');
    assert.equal(this.result.title, title);
  },
);
Then(
  'it identifies the existing Workspace root',
  function (this: WorkspaceWorld) {
    assert.equal(this.result?.root, this.root);
  },
);
Then(
  'existing Workspace artifacts are unchanged',
  function (this: WorkspaceWorld) {
    assert.deepEqual(snapshot(this.root), this.before);
  },
);
Then('no nested Workspace is created', function (this: WorkspaceWorld) {
  if (this.cwd !== this.root)
    assert.equal(existsSync(join(this.cwd, 'README.md')), false);
});
Then('all existing content is unchanged', function (this: WorkspaceWorld) {
  assert.deepEqual(snapshot(this.root), this.before);
});
Then('no new Workspace artifacts are created', function (this: WorkspaceWorld) {
  assert.deepEqual(snapshot(this.root), this.before);
});
Then(
  'no replacement store or nested Workspace is created',
  function (this: WorkspaceWorld) {
    assert.deepEqual(snapshot(this.root), this.before);
  },
);

Given('a standalone Action workspace', function (this: WorkspaceWorld) {
  initialize(this.root, 'Actions');
});
When(
  'I capture executable work titled {string}',
  function (this: WorkspaceWorld, title: string) {
    this.action = createAction(this.cwd, { title }).result.action;
  },
);
Then(
  'the open Action belongs to the Workspace and is retrievable',
  function (this: WorkspaceWorld) {
    assert.ok(this.action);
    assert.equal(this.action.state, 'open');
    assert.deepEqual(this.action.owner, { url: '/' });
    assert.deepEqual(
      getAction(this.root, this.action.id).result.action,
      this.action,
    );
  },
);
Given(
  'another Project contains a parked Outcome',
  function (this: WorkspaceWorld) {
    const project = create(this.root, {
      type: 'project',
      title: 'Garden',
    }).result;
    const outcome = create(project.path, {
      type: 'outcome',
      title: 'Ready',
    }).result;
    const path = join(outcome.path, 'README.md');
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace(
        'state: active',
        'state: parked\n  parking_reason: Later',
      ),
    );
    this.actionOwner = outcome.url;
    this.before = snapshot(outcome.path);
  },
);
When(
  'I capture work explicitly owned by that Outcome',
  function (this: WorkspaceWorld) {
    this.action = createAction(this.cwd, {
      title: 'Call supplier',
      owner: this.actionOwner,
    }).result.action;
  },
);
Then(
  'the Action belongs to that Outcome without reactivating it',
  function (this: WorkspaceWorld) {
    assert.equal(this.action?.owner.url, this.actionOwner);
    assert.deepEqual(
      snapshot(join(this.root, '_projects/garden/ready')),
      this.before,
    );
  },
);
Given('an Action owned by an Outcome', function (this: WorkspaceWorld) {
  initialize(this.root, 'Actions');
  const project = create(this.root, {
    type: 'project',
    title: 'Kitchen',
  }).result;
  const outcome = create(project.path, {
    type: 'outcome',
    title: 'Ready',
  }).result;
  this.actionOwner = outcome.path;
  this.action = createAction(outcome.path, {
    title: 'Call supplier',
  }).result.action;
});
When(
  'that owner disappears from its original location',
  function (this: WorkspaceWorld) {
    renameSync(this.actionOwner, join(this.root, 'moved-outcome'));
    this.before = snapshot(this.root);
  },
);
Then(
  'retrieval returns the unchanged Action and leaves the Workspace untouched',
  function (this: WorkspaceWorld) {
    assert.ok(this.action);
    assert.deepEqual(
      getAction(this.root, this.action.id).result.action,
      this.action,
    );
    assert.deepEqual(snapshot(this.root), this.before);
  },
);

Given(
  'searchable Actions across Kitchen, a nested Outcome and the Workspace',
  function (this: WorkspaceWorld) {
    initialize(this.root, 'Search');
    const kitchen = create(this.root, {
      type: 'project',
      title: 'Kitchen',
    }).result;
    const outcome = create(kitchen.path, {
      type: 'outcome',
      title: 'Design',
    }).result;
    createAction(kitchen.path, {
      title: 'NÁVRH kuchyne',
      description: 'návrh',
      state: 'open',
    });
    createAction(outcome.path, {
      title: 'Invoice',
      description: 'Overiť návrh zmluvy',
      state: 'waiting',
    });
    createAction(outcome.path, {
      title: 'Návrh completed',
      state: 'completed',
    });
    createAction(kitchen.path, { title: 'Unrelated', state: 'waiting' });
    createAction(this.root, { title: 'Návrh outside', state: 'open' });
    this.cwd = outcome.path;
    this.before = snapshot(this.root);
  },
);
When(
  'I search for {string} under Kitchen selecting states {string}',
  function (this: WorkspaceWorld, search: string, states: string) {
    this.listed = listActions(this.cwd, {
      search,
      owner: '/_projects/kitchen/',
      recursive: true,
      state: states.split(','),
    }).result.actions;
  },
);

Given(
  'a waiting dependent Action with a manual block and an unfinished prerequisite',
  function (this: WorkspaceWorld) {
    const project = create(this.root, {
      type: 'project',
      title: 'Other project',
    }).result;
    this.prerequisite = createAction(this.root, {
      title: 'Approve',
      owner: project.url,
    }).result.action;
    this.action = createAction(this.root, {
      title: 'Deploy',
      state: 'waiting',
      waitingFor: 'External reply',
    }).result.action;
    this.action = setAction(this.root, this.action.id, {
      manualBlock: 'No access',
      addDependency: [this.prerequisite.id],
    }).result.action;
  },
);
When(
  'I replace its manual block with {string}',
  function (this: WorkspaceWorld, manualBlock: string) {
    assert.ok(this.action);
    this.action = setAction(this.root, this.action.id, {
      manualBlock,
    }).result.action;
  },
);
Then(
  'its waiting context and prerequisite remain intact',
  function (this: WorkspaceWorld) {
    assert.ok(this.action);
    assert.ok(this.prerequisite);
    const action = getAction(this.root, this.action.id).result.action;
    assert.equal(action.state, 'waiting');
    assert.equal(action.waiting_for, 'External reply');
    assert.equal(action.manual_block, 'Access restored tomorrow');
    assert.deepEqual(action.depends_on, [`owf:action:${this.prerequisite.id}`]);
  },
);
When('I clear its manual block', function (this: WorkspaceWorld) {
  assert.ok(this.action);
  this.action = setAction(this.root, this.action.id, {
    clearManualBlock: true,
  }).result.action;
});
Then(
  'it remains dependency blocked without a manual reason',
  function (this: WorkspaceWorld) {
    assert.ok(this.action);
    const action = getAction(this.root, this.action.id).result.action;
    assert.equal(action.manual_block, undefined);
    assert.equal(action.state, 'waiting');
    assert.equal(action.waiting_for, 'External reply');
    assert.equal(action.blocking.blocked, true);
    assert.equal(action.blocking.unresolved_dependencies.length, 1);
  },
);
When('I try to complete the dependent Action', function (this: WorkspaceWorld) {
  assert.ok(this.action);
  this.blockedBefore = getAction(this.root, this.action.id).result.action;
  assert.throws(
    () =>
      setAction(this.root, this.action!.id, {
        state: 'completed',
        clearManualBlock: true,
      }),
    (error: unknown) =>
      error instanceof WorkspaceError && error.code === 'ACTION_BLOCKED',
  );
});
Then('the blocked edit is rejected unchanged', function (this: WorkspaceWorld) {
  assert.ok(this.action);
  assert.deepEqual(
    getAction(this.root, this.action.id).result.action,
    this.blockedBefore,
  );
});
When('I cancel the prerequisite', function (this: WorkspaceWorld) {
  assert.ok(this.prerequisite);
  setAction(this.root, this.prerequisite.id, { state: 'cancelled' });
});
Then(
  'the dependent Action is still dependency blocked',
  function (this: WorkspaceWorld) {
    assert.ok(this.action);
    assert.equal(
      getAction(this.root, this.action.id).result.action.blocking
        .unresolved_dependencies.length,
      1,
    );
  },
);
When('I complete the prerequisite', function (this: WorkspaceWorld) {
  assert.ok(this.prerequisite);
  setAction(this.root, this.prerequisite.id, { state: 'completed' });
});
Then(
  'the dependent Action is blocked only manually',
  function (this: WorkspaceWorld) {
    assert.ok(this.action);
    const action = getAction(this.root, this.action.id).result.action;
    assert.equal(action.blocking.manual, true);
    assert.equal(action.blocking.blocked, true);
    assert.equal(action.blocking.unresolved_dependencies.length, 0);
  },
);
When(
  'I clear the manual block and complete the dependent Action together',
  function (this: WorkspaceWorld) {
    assert.ok(this.action);
    this.action = setAction(this.root, this.action.id, {
      clearManualBlock: true,
      state: 'completed',
    }).result.action;
  },
);
Then(
  'the dependent Action is completed and unblocked',
  function (this: WorkspaceWorld) {
    assert.ok(this.action);
    const action = getAction(this.root, this.action.id).result.action;
    assert.equal(action.state, 'completed');
    assert.equal(action.blocking.blocked, false);
  },
);
When('I reopen the prerequisite', function (this: WorkspaceWorld) {
  assert.ok(this.prerequisite);
  setAction(this.root, this.prerequisite.id, { state: 'open' });
});
Then(
  'the completed dependent Action reports dependency blocking',
  function (this: WorkspaceWorld) {
    assert.ok(this.action);
    const action = getAction(this.root, this.action.id).result.action;
    assert.equal(action.state, 'completed');
    assert.equal(action.blocking.blocked, true);
  },
);
Then(
  'unrelated edits and an unchanged completed request still succeed',
  function (this: WorkspaceWorld) {
    assert.ok(this.action);
    setAction(this.root, this.action.id, { title: 'Revised title' });
    assert.equal(
      setAction(this.root, this.action.id, { state: 'completed' }).result
        .status,
      'unchanged',
    );
  },
);
When(
  'I clear the manual block, remove the prerequisite and complete together',
  function (this: WorkspaceWorld) {
    assert.ok(this.action);
    assert.ok(this.prerequisite);
    this.action = setAction(this.root, this.action.id, {
      clearManualBlock: true,
      removeDependency: [this.prerequisite.id],
      state: 'completed',
    }).result.action;
  },
);
When(
  'I cancel the dependent Action with an explicit manual clear',
  function (this: WorkspaceWorld) {
    assert.ok(this.action);
    assert.throws(() =>
      setAction(this.root, this.action!.id, { state: 'cancelled' }),
    );
    this.action = setAction(this.root, this.action.id, {
      state: 'cancelled',
      clearManualBlock: true,
    }).result.action;
  },
);
Then(
  'it is cancelled and still dependency blocked',
  function (this: WorkspaceWorld) {
    assert.ok(this.action);
    const action = getAction(this.root, this.action.id).result.action;
    assert.equal(action.state, 'cancelled');
    assert.equal(action.blocking.blocked, true);
  },
);
When(
  'I give the completed prerequisite an unfinished prerequisite',
  function (this: WorkspaceWorld) {
    assert.ok(this.prerequisite);
    const unfinished = createAction(this.root, { title: 'Later correction' })
      .result.action;
    setAction(this.root, this.prerequisite.id, {
      addDependency: [unfinished.id],
    });
  },
);
