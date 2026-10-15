import { afterEach, expect, test } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  initialize,
  createAction,
  getAction,
  listActions,
  setAction,
  actionPorts,
} from '../../src/bootstrap/workspaces.js';
import { setAction as setWithPorts } from '../../src/application/actions/index.js';
import { cleanup, snapshot, temporaryDirectory } from '../support/workspace.js';

const roots: string[] = [];
function workspace() {
  const root = temporaryDirectory();
  roots.push(root);
  const { store } = initialize(root);
  const target = createAction(root, { title: 'Prerequisite' }).result.action;
  const source = createAction(root, { title: 'Dependent' }).result.action;
  return { root, store, target, source };
}
afterEach(() => roots.splice(0).forEach(cleanup));

test('set semantics validate even no-op targets and reject the entire edit on conflicts or missing targets', () => {
  const { root, source, target, store } = workspace();
  const uri = `owf:action:${target.id}`;
  const action = setAction(root, source.id, {
    addDependency: [target.id.toUpperCase(), uri],
  }).result.action;
  expect(action.depends_on).toEqual([uri]);
  const before = snapshot(root);
  expect(
    setAction(root, source.id, { addDependency: [uri] }).result.status,
  ).toBe('unchanged');
  expect(
    setAction(root, source.id, { clearManualBlock: true }).result.status,
  ).toBe('unchanged');
  expect(snapshot(root)).toEqual(before);
  for (const input of [
    { addDependency: [target.id], removeDependency: [uri] },
    { removeDependency: ['00000000-0000-4000-8000-000000000000'] },
    { addDependency: ['/project/'] },
  ]) {
    expect(() =>
      setAction(root, source.id, { title: 'Must not save', ...input }),
    ).toThrow();
    expect(snapshot(root)).toEqual(before);
  }
  const db = new DatabaseSync(store);
  try {
    const event = db
      .prepare('SELECT * FROM action_events ORDER BY event_id DESC LIMIT 1')
      .get();
    expect(event).toMatchObject({
      kind: 'action.updated',
      changed_fields: '["depends_on"]',
      old_depends_on: '[]',
      new_depends_on: JSON.stringify([uri]),
    });
  } finally {
    db.close();
  }
});

test.each(['action', 'event', 'commit'])(
  'a %s failure rolls back manual, dependency, content and state edits together',
  (failure) => {
    const { root, store, source, target } = workspace();
    const db = new DatabaseSync(store);
    try {
      if (failure === 'commit')
        db.exec(`
      CREATE TABLE fault (id TEXT REFERENCES actions(id) DEFERRABLE INITIALLY DEFERRED);
      CREATE TRIGGER fail_commit AFTER INSERT ON action_events BEGIN INSERT INTO fault VALUES ('missing'); END;
    `);
      else
        db.exec(
          `CREATE TRIGGER fail_write BEFORE ${failure === 'action' ? 'UPDATE ON actions' : 'INSERT ON action_events'} BEGIN SELECT RAISE(ABORT, 'failure'); END;`,
        );
    } finally {
      db.close();
    }
    const before = snapshot(root);
    expect(() =>
      setAction(root, source.id, {
        title: 'Changed',
        state: 'waiting',
        waitingFor: 'Reply',
        manualBlock: 'Access',
        addDependency: [target.id],
      }),
    ).toThrow(expect.objectContaining({ code: 'ACTION_UPDATE_FAILED' }));
    expect(snapshot(root)).toEqual(before);
  },
);

test.each(['missing', 'malformed', 'duplicate', 'noncanonical'])(
  'a %s reference outside all filters fails reads without changing data',
  (corruption) => {
    const { root, store, source, target } = workspace();
    const uri = `owf:action:${target.id}`;
    const refs =
      corruption === 'missing'
        ? ['owf:action:00000000-0000-4000-8000-000000000000']
        : corruption === 'malformed'
          ? ['/not-an-action/']
          : corruption === 'duplicate'
            ? [uri, uri]
            : [target.id];
    const db = new DatabaseSync(store);
    try {
      db.prepare('UPDATE actions SET depends_on = ? WHERE id = ?').run(
        JSON.stringify(refs),
        source.id,
      );
    } finally {
      db.close();
    }
    const before = snapshot(root);
    for (const read of [
      () => getAction(root, target.id),
      () =>
        listActions(root, {
          owner: '/_projects/absent/',
          state: ['completed'],
          search: 'absent',
        }),
    ])
      expect(read).toThrow(
        expect.objectContaining({ code: 'ACTION_READ_FAILED' }),
      );
    expect(snapshot(root)).toEqual(before);
  },
);

test('source and target facts come from one read snapshot and write validation excludes competing target changes', () => {
  const { root, source, target } = workspace();
  setAction(root, source.id, { addDependency: [target.id] });
  setAction(root, target.id, { state: 'completed' });
  const before = snapshot(root);
  // Read-only projections never write or emit events.
  expect(
    listActions(root).result.actions.find((action) => action.id === source.id)
      ?.blocking.blocked,
  ).toBe(false);
  expect(
    getAction(root, source.id).result.action.blocking.dependencies[0]?.state,
  ).toBe('completed');
  expect(snapshot(root)).toEqual(before);
  const result = setWithPorts(
    root,
    source.id,
    { state: 'completed' },
    {
      ...actionPorts,
      actions: {
        ...actionPorts.actions,
        update(path, id, change) {
          return actionPorts.actions.update(path, id, (current, lookup) => {
            const competing = new DatabaseSync(path);
            try {
              competing.exec('PRAGMA busy_timeout = 0');
              expect(() =>
                competing
                  .prepare('UPDATE actions SET state = ? WHERE id = ?')
                  .run('open', target.id),
              ).toThrow(/locked/);
            } finally {
              competing.close();
            }
            return change(current, lookup);
          });
        },
      },
    },
  );
  expect(result.result.action.state).toBe('completed');
});
