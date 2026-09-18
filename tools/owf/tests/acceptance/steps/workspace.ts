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
} from '../../../src/bootstrap/workspaces.js';
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
  error: WorkspaceError | undefined;
  before: Record<string, string> = {};
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
