import { afterEach, expect, test } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  initialize,
  captureInbox,
  getInbox,
  listInbox,
  setInbox,
  resolveInbox,
  discardInbox,
  inboxPorts,
  createAction,
} from '../../src/bootstrap/workspaces.js';
import { captureInbox as captureWithPorts } from '../../src/application/inbox/index.js';
import { workspaceStore } from '../../src/infrastructure/sqlite/index.js';
import { cleanup, temporaryDirectory } from '../support/workspace.js';
import { semanticSnapshot } from '../support/store-snapshot.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(cleanup));
function workspace() {
  const root = temporaryDirectory();
  roots.push(root);
  return { root, store: initialize(root).store };
}
function sql(store: string, statement: string) {
  const db = new DatabaseSync(store);
  try {
    db.exec(statement);
  } finally {
    db.close();
  }
}
function events(store: string) {
  const db = new DatabaseSync(store, { readOnly: true });
  try {
    return db
      .prepare(
        'SELECT kind, inbox_id, created_at FROM inbox_events ORDER BY event_id',
      )
      .all();
  } finally {
    db.close();
  }
}

test('capture and edit preserve literal text and original identity/time across independent reads', () => {
  const { root, store } = workspace();
  const text =
    '  Život\r\nhttps://example.com/?x=1&y=2\n[not Markdown](x) `code`\t ';
  const captured = captureWithPorts(root, text, {
    ...inboxPorts,
    now: () => '2026-11-05T12:00:00.000Z',
  }).result.item;
  expect(getInbox(root, captured.id).result.item).toEqual(captured);
  expect(captured.text).toBe(text);
  expect(Object.keys(captured).sort()).toEqual(['captured_at', 'id', 'text']);
  const replacement = '\tReconsider\n' + text;
  const edited = setInbox(root, captured.id, replacement).result;
  expect(edited.status).toBe('updated');
  expect(edited.item).toEqual({ ...captured, text: replacement });
  const before = semanticSnapshot(root, store);
  expect(setInbox(root, captured.id, replacement).result.status).toBe(
    'unchanged',
  );
  expect(listInbox(root).result.items).toEqual([edited.item]);
  getInbox(root, captured.id);
  expect(semanticSnapshot(root, store)).toEqual(before);
  expect(events(store).map((e) => e.kind)).toEqual([
    'inbox.captured',
    'inbox.updated',
  ]);
});

test('list orders capture age then ID; different Workspace IDs never resolve locally', () => {
  const { root } = workspace();
  const { root: other } = workspace();
  const values = [
    ['00000000-0000-4000-8000-000000000003', '2026-11-05T12:00:00.000Z'],
    ['00000000-0000-4000-8000-000000000002', '2026-11-04T12:00:00.000Z'],
    ['00000000-0000-4000-8000-000000000001', '2026-11-05T12:00:00.000Z'],
  ] as const;
  for (const [id, time] of values)
    captureWithPorts(root, id, {
      ...inboxPorts,
      newId: () => id,
      now: () => time,
    });
  expect(listInbox(root).result.items.map((i) => i.id)).toEqual([
    values[1][0],
    values[2][0],
    values[0][0],
  ]);
  expect(listInbox(other).result.items).toEqual([]);
  expect(() => getInbox(other, values[0][0])).toThrow(
    expect.objectContaining({ code: 'INBOX_NOT_FOUND' }),
  );
});

test('blank capture/edit and invalid identifiers leave current data and history unchanged', () => {
  const { root, store } = workspace();
  const item = captureInbox(root, 'Keep me').result.item;
  const before = semanticSnapshot(root, store);
  for (const text of ['', ' \t\r\n', '\u00a0']) {
    expect(() => captureInbox(root, text)).toThrow(
      expect.objectContaining({ code: 'INVALID_ARGUMENT' }),
    );
    expect(() => setInbox(root, item.id, text)).toThrow(
      expect.objectContaining({ code: 'INVALID_ARGUMENT' }),
    );
  }
  expect(() => resolveInbox(root, 'not-a-uuid')).toThrow(
    expect.objectContaining({ code: 'INVALID_ARGUMENT' }),
  );
  expect(semanticSnapshot(root, store)).toEqual(before);
});

test.each(['resolved', 'discarded'] as const)(
  '%s consumes current input, preserves history and rejects repetition or identity reuse',
  (outcome) => {
    const { root, store } = workspace();
    const item = captureInbox(root, 'Process me').result.item;
    const consume = outcome === 'resolved' ? resolveInbox : discardInbox;
    const receipt = consume(root, item.id).result;
    expect(receipt).toEqual({
      status: outcome,
      type: 'inbox_item',
      root,
      id: item.id,
    });
    expect(listInbox(root).result.items).toEqual([]);
    const before = semanticSnapshot(root, store);
    for (const operation of [getInbox, resolveInbox, discardInbox])
      expect(() => operation(root, item.id)).toThrow(
        expect.objectContaining({ code: 'INBOX_NOT_FOUND' }),
      );
    expect(() => setInbox(root, item.id, 'Again')).toThrow(
      expect.objectContaining({ code: 'INBOX_NOT_FOUND' }),
    );
    expect(() =>
      captureWithPorts(root, 'Again', { ...inboxPorts, newId: () => item.id }),
    ).toThrow(expect.objectContaining({ code: 'INBOX_WRITE_FAILED' }));
    expect(semanticSnapshot(root, store)).toEqual(before);
    expect(events(store).map((e) => e.kind)).toEqual([
      'inbox.captured',
      `inbox.${outcome}`,
    ]);
  },
);

test.each(['capture', 'edit', 'resolve', 'discard'] as const)(
  '%s rolls back if its event cannot be saved',
  (operation) => {
    const { root, store } = workspace();
    const item = captureInbox(root, 'Keep').result.item;
    sql(
      store,
      `CREATE TRIGGER fail_inbox_event BEFORE INSERT ON inbox_events BEGIN SELECT RAISE(ABORT, 'event unavailable'); END`,
    );
    const before = semanticSnapshot(root, store);
    const attempts = {
      capture: () => captureInbox(root, 'Another'),
      edit: () => setInbox(root, item.id, 'Changed'),
      resolve: () => resolveInbox(root, item.id),
      discard: () => discardInbox(root, item.id),
    };
    expect(attempts[operation]).toThrow(
      expect.objectContaining({ code: 'INBOX_WRITE_FAILED' }),
    );
    expect(semanticSnapshot(root, store)).toEqual(before);
  },
);

test('Inbox operations preserve work, Views and Markdown, including broken View definitions', () => {
  const { root, store } = workspace();
  const action = createAction(root, { title: 'Existing work' }).result.action;
  // A broken definition is represented by an instance pointing to a missing file.
  // Inbox operations must not load it or evaluate any placement/order.
  const db = new DatabaseSync(store);
  db.prepare('INSERT INTO views VALUES (?, ?, ?, NULL, ?)').run(
    action.id,
    'Broken',
    '/_views/missing.md',
    action.created_at,
  );
  db.close();
  const before = semanticSnapshot(root, store);
  const item = captureInbox(root, 'Independent input').result.item;
  setInbox(root, item.id, 'Clarified');
  discardInbox(root, item.id);
  const after = semanticSnapshot(root, store);
  expect(after.files).toEqual(before.files);
  expect(
    after.store?.tables.filter((t) => !t.table.startsWith('inbox_')),
  ).toEqual(before.store?.tables.filter((t) => !t.table.startsWith('inbox_')));
});

test('schema 9 is rejected by every Inbox path and repeat init without altering bytes', () => {
  const { root, store } = workspace();
  const item = captureInbox(root, 'Old data').result.item;
  sql(
    store,
    "UPDATE owf_metadata SET value = '9' WHERE key = 'schema_version'; DROP TABLE inbox_items; DROP TABLE inbox_events;",
  );
  const before = readFileSync(store);
  for (const operation of [
    () => initialize(root),
    () => captureInbox(root, 'New'),
    () => listInbox(root),
    () => getInbox(root, item.id),
    () => setInbox(root, item.id, 'New'),
    () => resolveInbox(root, item.id),
    () => discardInbox(root, item.id),
  ])
    expect(operation).toThrow(
      expect.objectContaining({ code: 'UNSUPPORTED_STORE_VERSION' }),
    );
  expect(readFileSync(store)).toEqual(before);
});

test('discovery rejects an Inbox schema without its event-kind constraint', () => {
  const { root, store } = workspace();
  sql(
    store,
    'DROP TABLE inbox_events; CREATE TABLE inbox_events (event_id INTEGER PRIMARY KEY, kind TEXT NOT NULL, inbox_id TEXT NOT NULL, created_at TEXT NOT NULL) STRICT',
  );
  const before = readFileSync(store);
  expect(() => workspaceStore.validate(store)).toThrow(
    expect.objectContaining({ code: 'INVALID_STORE' }),
  );
  expect(() => listInbox(root)).toThrow(
    expect.objectContaining({ code: 'INVALID_STORE' }),
  );
  expect(readFileSync(store)).toEqual(before);
});

test('corrupt stored content is rejected rather than returned as valid input', () => {
  const { root, store } = workspace();
  const item = captureInbox(root, 'Valid').result.item;
  sql(store, `UPDATE inbox_items SET text = char(9) WHERE id = '${item.id}'`);
  expect(() => getInbox(root, item.id)).toThrow(
    expect.objectContaining({ code: 'INBOX_READ_FAILED' }),
  );
  expect(() => listInbox(root)).toThrow(
    expect.objectContaining({ code: 'INBOX_READ_FAILED' }),
  );
  expect(() => resolveInbox(root, item.id)).toThrow(
    expect.objectContaining({ code: 'INBOX_WRITE_FAILED' }),
  );
});
