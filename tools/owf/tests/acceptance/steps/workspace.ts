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
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  initialize,
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
  'the declared local store has recognized schema version 1',
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
