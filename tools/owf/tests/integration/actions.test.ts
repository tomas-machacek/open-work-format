import { afterEach, expect, test } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  renameSync,
} from 'node:fs';
import {
  initialize,
  create,
  createAction,
  getAction,
  listActions,
  setAction,
  actionPorts,
} from '../../src/bootstrap/workspaces.js';
import {
  createAction as createWithPorts,
  setAction as setWithPorts,
} from '../../src/application/actions/index.js';
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

test('state and reason edits correlate events; no-ops preserve every byte even after owner disappears', () => {
  const { root, store } = workspace();
  const owner = create(root, { type: 'project', title: 'Owner' }).result;
  const initial = createWithPorts(
    owner.path,
    { title: 'Work', description: 'Keep' },
    { ...actionPorts, now: () => '2026-09-20T10:00:00.000Z' },
  ).result.action;
  renameSync(owner.path, join(root, 'moved-owner'));
  const at = '2026-09-21T10:00:00.000Z';
  const change = (state: string, waitingFor?: string) =>
    setWithPorts(
      root,
      initial.id,
      { state, waitingFor },
      { ...actionPorts, now: () => at },
    );
  change('waiting', 'First');
  const changed = change('waiting', '  Second\nŽivot  ');
  expect(changed.result.status).toBe('updated');
  expect(changed.result.action).toEqual({
    ...initial,
    state: 'waiting',
    waiting_for: '  Second\nŽivot  ',
    updated_at: at,
  });
  const before = snapshot(root);
  expect(change('waiting').result.status).toBe('unchanged');
  expect(change('waiting', '  Second\nŽivot  ').result.action).toEqual(
    changed.result.action,
  );
  expect(getAction(root, initial.id).result.action).toEqual(
    changed.result.action,
  );
  expect(listActions(root, { state: ['waiting'] }).result.actions).toEqual([
    changed.result.action,
  ]);
  expect(snapshot(root)).toEqual(before);
  change('completed');
  expect(rows(store, 'action_events').slice(1)).toEqual([
    expect.objectContaining({
      action_id: initial.id,
      kind: 'action.state_changed',
      created_at: at,
      old_state: 'open',
      new_state: 'waiting',
      old_waiting_for: null,
      new_waiting_for: 'First',
    }),
    expect.objectContaining({
      action_id: initial.id,
      created_at: at,
      old_state: 'waiting',
      new_state: 'waiting',
      old_waiting_for: 'First',
      new_waiting_for: '  Second\nŽivot  ',
    }),
    expect.objectContaining({
      action_id: initial.id,
      created_at: at,
      old_state: 'waiting',
      new_state: 'completed',
      old_waiting_for: '  Second\nŽivot  ',
      new_waiting_for: null,
    }),
  ]);
});

test.each(['update', 'event', 'commit', 'conflict'])(
  'state change %s failure rolls back Action and Event Log',
  (failure) => {
    const { root, store } = workspace();
    const action = createAction(root, { title: 'Original' }).result.action;
    if (failure === 'commit')
      sql(
        store,
        `CREATE TABLE fault (id TEXT REFERENCES actions(id) DEFERRABLE INITIALLY DEFERRED);
      CREATE TRIGGER fail_commit AFTER INSERT ON action_events BEGIN INSERT INTO fault VALUES ('missing'); END;`,
      );
    else if (failure === 'conflict')
      sql(
        store,
        `CREATE TRIGGER stale BEFORE UPDATE ON actions BEGIN SELECT RAISE(IGNORE); END;`,
      );
    else
      sql(
        store,
        `CREATE TRIGGER fail_write BEFORE ${failure === 'update' ? 'UPDATE ON actions' : 'INSERT ON action_events'} BEGIN SELECT RAISE(ABORT, 'fault'); END;`,
      );
    const before = snapshot(root);
    expect(() =>
      setAction(root, action.id, { state: 'waiting', waitingFor: 'Reply' }),
    ).toThrow(
      expect.objectContaining({
        code:
          failure === 'conflict' ? 'ACTION_CONFLICT' : 'ACTION_UPDATE_FAILED',
      }),
    );
    expect(snapshot(root)).toEqual(before);
    expect(rows(store, 'actions')).toHaveLength(1);
    expect(rows(store, 'action_events')).toHaveLength(1);
  },
);

test('a concurrent writer is refused without overwriting its pending state', () => {
  const { root, store } = workspace();
  const action = createAction(root, { title: 'Original' }).result.action;
  const db = new DatabaseSync(store);
  try {
    db.exec("BEGIN IMMEDIATE; UPDATE actions SET state = 'cancelled'");
    expect(() => setAction(root, action.id, { state: 'completed' })).toThrow(
      expect.objectContaining({ code: 'ACTION_UPDATE_FAILED' }),
    );
    expect(db.prepare('SELECT state FROM actions').get()?.state).toBe(
      'cancelled',
    );
    db.exec('ROLLBACK');
  } finally {
    db.close();
  }
  expect(getAction(root, action.id).result.action).toEqual(action);
  expect(rows(store, 'action_events')).toHaveLength(1);
});

test('set distinguishes missing Action, unreadable row and missing store without mutation', () => {
  const { root, store } = workspace();
  const action = createAction(root, { title: 'Original' }).result.action;
  const before = snapshot(root);
  expect(() =>
    setAction(root, '00000000-0000-4000-8000-000000000000', {
      state: 'waiting',
    }),
  ).toThrow(expect.objectContaining({ code: 'ACTION_NOT_FOUND' }));
  expect(snapshot(root)).toEqual(before);
  sql(store, "UPDATE actions SET title = ' padded '");
  const corrupt = snapshot(root);
  expect(() => setAction(root, action.id, { state: 'waiting' })).toThrow(
    expect.objectContaining({ code: 'ACTION_READ_FAILED' }),
  );
  expect(snapshot(root)).toEqual(corrupt);
  unlinkSync(store);
  const missing = snapshot(root);
  expect(() => setAction(root, action.id, { state: 'waiting' })).toThrow(
    expect.objectContaining({ code: 'STORE_UNAVAILABLE' }),
  );
  expect(snapshot(root)).toEqual(missing);
});

test.each([
  "state = 'archived'",
  "waiting_for = 'invalid outside waiting'",
  "state = 'waiting', waiting_for = char(9)",
])(
  'invalid new row fields are rejected even outside the state filter: %s',
  (assignment) => {
    const { root, store } = workspace();
    const action = createAction(root, { title: 'Bad' }).result.action;
    sql(
      store,
      `PRAGMA ignore_check_constraints = ON; UPDATE actions SET ${assignment}`,
    );
    const before = snapshot(root);
    // Bypass discovery's quick_check to exercise row validation itself.
    for (const read of [
      () => actionPorts.actions.get(store, action.id),
      () => actionPorts.actions.list(store, { states: ['completed'] }),
      () =>
        actionPorts.actions.changeState(store, action.id, (current) => current),
    ])
      expect(read).toThrow(
        expect.objectContaining({ code: 'ACTION_READ_FAILED' }),
      );
    expect(snapshot(root)).toEqual(before);
  },
);

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
  const events = rows(store, 'action_events');
  actions.forEach((action) => {
    expect(action.title).toBe('Same title');
    expect(action.updated_at).toBe(action.created_at);
    expect(getAction(root, action.id).result.action).toEqual(action);
    expect(events.filter((event) => event.action_id === action.id)).toEqual([
      expect.objectContaining({
        kind: 'action.created',
        action_id: action.id,
        created_at: action.created_at,
      }),
    ]);
  });
  expect(actions[0]).not.toHaveProperty('description');
  expect(actions[1]?.description).toBe('');
  expect(actions[2]?.description).toBe("\n# Literal ' ?\nŽivot **yes**\n");
  expect(events).toHaveLength(3);
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

test.each(['1', '2', '99'])(
  'schema %s rejected without writes by init and all create/get operations',
  (version) => {
    const { root, store } = workspace();
    const action = createAction(root, { title: 'Existing' }).result.action;
    if (version === '2')
      sql(
        store,
        `
        ALTER TABLE actions RENAME TO newer_actions;
        ALTER TABLE action_events RENAME TO newer_events;
        CREATE TABLE actions (
          id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL CHECK(length(trim(title)) > 0),
          state TEXT NOT NULL CHECK(state = 'open'), owner_url TEXT NOT NULL,
          description TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE action_events (
          event_id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK(kind = 'action.created'),
          action_id TEXT NOT NULL REFERENCES actions(id), created_at TEXT NOT NULL
        ) STRICT;
        INSERT INTO actions SELECT id,title,state,owner_url,description,created_at,updated_at FROM newer_actions;
        INSERT INTO action_events SELECT event_id,kind,action_id,created_at FROM newer_events;
        DROP TABLE newer_events;
        DROP TABLE newer_actions;
      `,
      );
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
      () => listActions(root),
      () => setAction(root, action.id, { state: 'waiting' }),
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
  writeFileSync(
    join(notes, 'README.md'),
    '---\ntags: [notes]\n---\n# Ordinary documentation',
  );
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

test('a nearest candidate in an infrastructure directory is not skipped', () => {
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

test('get is read-only from a malformed or terminal owner; missing and broken stores differ', () => {
  const { root, store } = workspace();
  const owner = create(root, { type: 'project', title: 'Owner' }).result;
  const action = createAction(owner.path, { title: 'Read me' }).result.action;
  const readme = join(owner.path, 'README.md');
  for (const text of [
    '---\ntype: OWF Project\ntitle: [broken\n---',
    readFileSync(readme, 'utf8').replace('state: active', 'state: completed'),
  ]) {
    writeFileSync(readme, text);
    const before = snapshot(root);
    expect(getAction(root, action.id).result.action).toEqual(action);
    expect(getAction(owner.path, action.id).result.action).toEqual(action);
    expect(
      listActions(owner.path, { owner: owner.url, recursive: true }).result
        .actions,
    ).toEqual([action]);
    expect(snapshot(root)).toEqual(before);
  }
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
  expect(() => listActions(root)).toThrow(
    expect.objectContaining({ code: 'STORE_UNAVAILABLE' }),
  );
});

test('explicit owners bypass damaged context; inferred Action and Outcome owners fail without fallback', () => {
  const { root } = workspace();
  const project = create(root, { type: 'project', title: 'Project' }).result;
  const outcome = create(project.path, {
    type: 'outcome',
    title: 'Outcome',
  }).result;
  writeFileSync(
    join(outcome.path, 'README.md'),
    '---\ntype: OWF Outcome\ntitle: [broken\n---',
  );
  const before = snapshot(root);
  expect(initialize(outcome.path).root).toBe(root);
  for (const operation of [
    () => createAction(outcome.path, { title: 'No fallback' }),
    () => create(outcome.path, { type: 'outcome', title: 'No fallback' }),
  ]) {
    expect(operation).toThrow(
      expect.objectContaining({ code: 'INVALID_OWNER' }),
    );
    expect(snapshot(root)).toEqual(before);
  }
  expect(
    createAction(outcome.path, { title: 'Workspace', owner: '/' }).result.action
      .owner.url,
  ).toBe('/');
  expect(
    createAction(outcome.path, { title: 'Project', owner: project.url }).result
      .action.owner.url,
  ).toBe(project.url);
  expect(
    create(outcome.path, {
      type: 'outcome',
      title: 'Sibling',
      owner: project.url,
    }).result.owner,
  ).toBe(project.url);
  expect(readFileSync(join(outcome.path, 'README.md'), 'utf8')).toBe(
    '---\ntype: OWF Outcome\ntitle: [broken\n---',
  );
});

test('parked Outcome ancestry permits active children without reactivation; terminal and archived ancestry rejects them', () => {
  const { root } = workspace();
  const project = create(root, { type: 'project', title: 'Project' }).result;
  const parent = create(project.path, {
    type: 'outcome',
    title: 'Parent',
  }).result;
  const child = create(parent.path, { type: 'outcome', title: 'Child' }).result;
  const readme = join(parent.path, 'README.md');
  const original = readFileSync(readme, 'utf8');
  writeFileSync(
    readme,
    original.replace('state: active', 'state: parked\n  parking_reason: Later'),
  );
  const parked = snapshot(parent.path);
  expect(
    createAction(child.path, { title: 'Allowed' }).result.action.owner.url,
  ).toBe(child.url);
  expect(snapshot(parent.path)).toEqual(parked);
  for (const state of [
    'achieved',
    'abandoned',
    'archived\n  archived_from: achieved',
  ]) {
    writeFileSync(readme, original.replace('state: active', `state: ${state}`));
    const before = snapshot(root);
    expect(() => createAction(child.path, { title: 'Rejected' })).toThrow(
      expect.objectContaining({ code: 'INVALID_OWNER' }),
    );
    expect(snapshot(root)).toEqual(before);
  }
});

test.each([
  "title = ' padded '",
  "created_at = 'not-a-time'",
  "updated_at = '2020-01-01T00:00:00.000Z'",
  "owner_url = 'broken'",
])(
  'get and list reject malformed persisted data (%s) without writes',
  (assignment) => {
    const { root, store } = workspace();
    const action = createAction(root, { title: 'Existing' }).result.action;
    sql(store, `UPDATE actions SET ${assignment}`);
    createAction(root, { title: 'Valid companion' });
    const before = snapshot(root);
    expect(() => getAction(root, action.id)).toThrow(
      expect.objectContaining({ code: 'ACTION_READ_FAILED' }),
    );
    for (const filter of [
      {},
      { owner: '/' },
      { owner: '/', recursive: true },
      { owner: '/missing/' },
      { owner: '/missing/', recursive: true },
    ])
      expect(() => listActions(root, filter)).toThrow(
        expect.objectContaining({ code: 'ACTION_READ_FAILED' }),
      );
    expect(snapshot(root)).toEqual(before);
  },
);

test('list is empty or ordered by stored creation time then ID, preserving full records and every byte', () => {
  const { root } = workspace();
  expect(listActions(root).result.actions).toEqual([]);
  const actions = [
    [
      '00000000-0000-4000-8000-000000000002',
      '2026-09-20T10:00:00.000Z',
      undefined,
    ],
    ['00000000-0000-4000-8000-000000000001', '2026-09-20T10:00:00.000Z', ''],
    [
      '00000000-0000-4000-8000-000000000003',
      '2026-09-21T10:00:00.000Z',
      "# Literal\n' % _ Život",
    ],
  ].map(
    ([id, time, description]) =>
      createWithPorts(
        root,
        { title: 'Same', description },
        {
          ...actionPorts,
          newId: () => id!,
          now: () => time!,
        },
      ).result.action,
  );
  const before = snapshot(root);
  for (let repeat = 0; repeat < 2; repeat++) {
    expect(listActions(root)).toEqual({
      result: {
        status: 'listed',
        type: 'actions',
        root,
        actions: [actions[2], actions[1], actions[0]],
      },
      warnings: [],
    });
    expect(listActions(root, { owner: '/unknown/' }).result.actions).toEqual(
      [],
    );
  }
  expect(snapshot(root)).toEqual(before);
});

test('canonical filters treat percent and underscore literally and keep stale stored ownership after a move', () => {
  const { root, store } = workspace();
  const project = create(root, { type: 'project', title: 'Original' }).result;
  const action = createAction(project.path, { title: 'Stale' }).result.action;
  renameSync(project.path, join(root, '_projects', 'moved'));
  const beforeMoveRead = snapshot(root);
  expect(
    listActions(root, { owner: project.url, recursive: true }).result.actions,
  ).toEqual([action]);
  expect(
    listActions(root, { owner: '/_projects/moved/', recursive: true }).result
      .actions,
  ).toEqual([]);
  expect(snapshot(root)).toEqual(beforeMoveRead);
  const owners = [
    '/a_b%25/',
    '/axb%25/',
    '/a_bXYZ25/',
    '/a_b%25/child/',
    '/a_b%25suffix/',
  ];
  const db = new DatabaseSync(store);
  try {
    const insert = db.prepare(
      'INSERT INTO actions SELECT ?,title,state,?,description,created_at,updated_at,waiting_for FROM actions WHERE id = ?',
    );
    owners.forEach((owner, index) =>
      insert.run(
        `00000000-0000-4000-8000-00000000000${index}`,
        owner,
        action.id,
      ),
    );
  } finally {
    db.close();
  }
  const before = snapshot(root);
  expect(
    listActions(root, { owner: '/%61_b%25/' }).result.actions.map(
      (a) => a.owner.url,
    ),
  ).toEqual([owners[0]]);
  expect(
    listActions(root, {
      owner: '/%61_b%25/',
      recursive: true,
    }).result.actions.map((a) => a.owner.url),
  ).toEqual([owners[0], owners[3]]);
  expect(
    listActions(root, { owner: '/A_b%25/', recursive: true }).result.actions,
  ).toEqual([]);
  expect(snapshot(root)).toEqual(before);
});

test('list rejects invalid arguments before discovery and distinguishes corrupt store and Workspace metadata', () => {
  const root = temporaryDirectory();
  roots.push(root);
  for (const input of [
    { recursive: true },
    { owner: '/..//' },
    { owner: '/bad%/' },
  ])
    expect(() => listActions(root, input)).toThrow(
      expect.objectContaining({ code: 'INVALID_ARGUMENT' }),
    );
  expect(snapshot(root)).toEqual({});
  expect(() => listActions(root)).toThrow(
    expect.objectContaining({ code: 'WORKSPACE_NOT_FOUND' }),
  );
  const { store } = initialize(root);
  writeFileSync(store, 'corrupt');
  const before = snapshot(root);
  expect(() => listActions(root)).toThrow(
    expect.objectContaining({ code: 'INVALID_STORE' }),
  );
  expect(snapshot(root)).toEqual(before);
  writeFileSync(
    join(root, 'README.md'),
    '---\ntype: OWF Workspace\ntitle: [broken\n---',
  );
  expect(() => listActions(root)).toThrow(
    expect.objectContaining({ code: 'INVALID_WORKSPACE' }),
  );
});
