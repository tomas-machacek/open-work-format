import { afterEach, expect, test } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import {
  initialize,
  create,
  createAction,
  getAction,
  actionPorts,
} from '../../src/bootstrap/workspaces.js';
import { createAction as createWithPorts } from '../../src/application/actions/index.js';
import { cleanup, snapshot, temporaryDirectory } from '../support/workspace.js';

const roots: string[] = [];
function workspace() {
  const root = temporaryDirectory();
  roots.push(root);
  const { store } = initialize(root, 'Actions');
  return { root, store };
}
function sql(store: string, statement: string) {
  const db = new DatabaseSync(store);
  try {
    db.exec(statement);
  } finally {
    db.close();
  }
}
function rows(store: string, table: string) {
  const db = new DatabaseSync(store, { readOnly: true });
  try {
    return db.prepare(`SELECT * FROM ${table}`).all();
  } finally {
    db.close();
  }
}
afterEach(() => roots.splice(0).forEach(cleanup));

test('literal descriptions, omitted versus empty, identity and one shared clock value persist with events', () => {
  const { root, store } = workspace();
  const markdown = Object.fromEntries(
    Object.entries(snapshot(root)).filter(([key]) => !key.startsWith('_store')),
  );
  const actions = [undefined, '', "\n# Literal ' ?\nŽivot **yes**\n"].map(
    (description) =>
      createWithPorts(
        root,
        { title: '  Same title  ', description },
        { ...actionPorts, now: () => '2026-09-20T10:20:30.000Z' },
      ).result.action,
  );
  expect(new Set(actions.map((action) => action.id)).size).toBe(3);
  actions.forEach((action, index) => {
    expect(action.title).toBe('Same title');
    expect(action.updated_at).toBe(action.created_at);
    expect(getAction(root, action.id).result.action).toEqual(action);
    expect(rows(store, 'action_events')[index]).toMatchObject({
      kind: 'action.created',
      action_id: action.id,
      created_at: action.created_at,
    });
  });
  expect(actions[0]).not.toHaveProperty('description');
  expect(actions[1]?.description).toBe('');
  expect(actions[2]?.description).toBe("\n# Literal ' ?\nŽivot **yes**\n");
  expect(rows(store, 'action_events')).toHaveLength(3);
  expect(
    Object.fromEntries(
      Object.entries(snapshot(root)).filter(
        ([key]) => !key.startsWith('_store'),
      ),
    ),
  ).toEqual(markdown);
});

test.each(['action', 'event', 'commit'])(
  'failure at %s rolls back both records and preserves prior data',
  (failure) => {
    const { root, store } = workspace();
    createAction(root, { title: 'Existing' });
    if (failure === 'commit')
      sql(
        store,
        `
    CREATE TABLE fault (id TEXT REFERENCES actions(id) DEFERRABLE INITIALLY DEFERRED);
    CREATE TRIGGER fail_commit AFTER INSERT ON action_events BEGIN INSERT INTO fault VALUES ('missing'); END;
  `,
      );
    else
      sql(
        store,
        `CREATE TRIGGER fail_write BEFORE INSERT ON ${failure === 'action' ? 'actions' : 'action_events'} BEGIN SELECT RAISE(ABORT, 'private SQL detail'); END;`,
      );
    const before = snapshot(root);
    expect(() => createAction(root, { title: 'Must roll back' })).toThrow(
      expect.objectContaining({ code: 'ACTION_CREATE_FAILED' }),
    );
    expect(snapshot(root)).toEqual(before);
    expect(rows(store, 'actions')).toHaveLength(1);
    expect(rows(store, 'action_events')).toHaveLength(1);
  },
);

test.each(['1', '99'])(
  'schema %s rejected without writes by init and all create/get operations',
  (version) => {
    const { root, store } = workspace();
    const action = createAction(root, { title: 'Existing' }).result.action;
    sql(
      store,
      `UPDATE owf_metadata SET value = '${version}' WHERE key = 'schema_version'`,
    );
    const before = snapshot(root);
    for (const operation of [
      () => initialize(root),
      () => create(root, { type: 'project', title: 'Project' }),
      () => create(root, { type: 'outcome', title: 'Outcome', owner: '/' }),
      () => createAction(root, { title: 'Action' }),
      () => getAction(root, action.id),
    ]) {
      expect(operation).toThrow(
        expect.objectContaining({ code: 'UNSUPPORTED_STORE_VERSION' }),
      );
      expect(snapshot(root)).toEqual(before);
    }
  },
);

test('nearest owner inference traverses ordinary docs; explicit Workspace wins; closed ancestors never fall back', () => {
  const { root } = workspace();
  const project = create(root, { type: 'project', title: 'Kitchen' }).result;
  const outcome = create(project.path, {
    type: 'outcome',
    title: 'Ready',
  }).result;
  const notes = join(outcome.path, 'notes');
  mkdirSync(notes);
  writeFileSync(join(notes, 'README.md'), '# Ordinary documentation');
  expect(
    createAction(notes, { title: 'Inferred' }).result.action.owner.url,
  ).toBe(outcome.url);
  expect(
    createAction(notes, { title: 'Explicit', owner: '/' }).result.action.owner
      .url,
  ).toBe('/');
  const readme = join(project.path, 'README.md');
  writeFileSync(
    readme,
    readFileSync(readme, 'utf8').replace('state: active', 'state: completed'),
  );
  const before = snapshot(root);
  for (const input of [
    { title: 'Inferred' },
    { title: 'Explicit', owner: outcome.url },
    { title: 'Invalid', owner: '/_projects/missing/' },
  ]) {
    expect(() => createAction(notes, input)).toThrow(
      expect.objectContaining({ code: 'INVALID_OWNER' }),
    );
    expect(snapshot(root)).toEqual(before);
  }
});

test('malformed or disallowed nearest candidate is not skipped', () => {
  const { root } = workspace();
  const project = create(root, { type: 'project', title: 'Kitchen' }).result;
  const invalid = join(project.path, '_hidden');
  mkdirSync(invalid);
  writeFileSync(
    join(invalid, 'README.md'),
    readFileSync(join(project.path, 'README.md')),
  );
  const before = snapshot(root);
  expect(() => createAction(invalid, { title: 'No fallback' })).toThrow(
    expect.objectContaining({ code: 'INVALID_OWNER' }),
  );
  expect(snapshot(root)).toEqual(before);
});

test('get is read-only after owner moves, becomes malformed or terminal; missing and broken stores differ', () => {
  const { root, store } = workspace();
  const owner = create(root, { type: 'project', title: 'Owner' }).result;
  const action = createAction(owner.path, { title: 'Read me' }).result.action;
  const readme = join(owner.path, 'README.md');
  for (const text of [
    '---\ntype: [broken',
    readFileSync(readme, 'utf8').replace('state: active', 'state: completed'),
  ]) {
    writeFileSync(readme, text);
    const before = snapshot(root);
    expect(getAction(root, action.id).result.action).toEqual(action);
    expect(snapshot(root)).toEqual(before);
  }
  renameSync(owner.path, join(root, 'moved'));
  const before = snapshot(root);
  expect(
    getAction(root, `owf:action:${action.id.toUpperCase()}`).result.action,
  ).toEqual(action);
  expect(() => getAction(root, '00000000-0000-4000-8000-000000000000')).toThrow(
    expect.objectContaining({ code: 'ACTION_NOT_FOUND' }),
  );
  expect(snapshot(root)).toEqual(before);
  sql(store, "UPDATE actions SET owner_url = '/../' ");
  expect(() => getAction(root, action.id)).toThrow(
    expect.objectContaining({ code: 'ACTION_READ_FAILED' }),
  );
  unlinkSync(store);
  expect(() => getAction(root, action.id)).toThrow(
    expect.objectContaining({ code: 'STORE_UNAVAILABLE' }),
  );
});
