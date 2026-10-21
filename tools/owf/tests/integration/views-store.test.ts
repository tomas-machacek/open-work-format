import { afterEach, expect, test } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  viewRepository,
  workspaceStore,
} from '../../src/infrastructure/sqlite/index.js';
import type { ViewInstance } from '../../src/domain/views/index.js';
import { cleanup, snapshot, temporaryDirectory } from '../support/workspace.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(cleanup));

function store() {
  const root = temporaryDirectory();
  roots.push(root);
  const path = join(root, 'store.sqlite');
  writeFileSync(path, '');
  workspaceStore.initializeReserved(path);
  return { root, path };
}

function instance(): ViewInstance {
  return {
    id: randomUUID(),
    title: 'My work',
    definition: { url: '/_views/shared%20board.md', id: 'shared-board' },
    created_at: '2026-10-21T12:00:00.000Z',
  };
}

test('independent IDs and optional definition IDs survive reopened reads with one event each and no read writes', () => {
  const { root, path } = store();
  expect(viewRepository.list(path)).toEqual([]);
  const first = instance();
  const second = { ...instance(), definition: { url: first.definition.url } };
  viewRepository.create(path, first);
  viewRepository.create(path, second);
  const before = snapshot(root);
  expect(viewRepository.get(path, first.id)).toEqual(first);
  expect(viewRepository.get(path, second.id)).toEqual(second);
  expect(viewRepository.get(path, randomUUID())).toBeUndefined();
  // The definition file deliberately does not exist: inventory only reads metadata.
  expect(viewRepository.list(path)).toEqual(
    [first, second].sort((a, b) => a.id.localeCompare(b.id)),
  );
  workspaceStore.validate(path);
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    expect(
      db
        .prepare(
          'SELECT kind, view_id, created_at FROM view_events ORDER BY view_id',
        )
        .all(),
    ).toEqual(
      [first, second]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((view) => ({
          kind: 'view.created',
          view_id: view.id,
          created_at: view.created_at,
        })),
    );
    expect(
      db.prepare('SELECT count(*) AS count FROM actions').get()?.count,
    ).toBe(0);
    expect(
      db.prepare('SELECT count(*) AS count FROM action_events').get()?.count,
    ).toBe(0);
  } finally {
    db.close();
  }
  expect(snapshot(root)).toEqual(before);
});

test('event failure rolls back the new instance and leaves existing records intact', () => {
  const { path } = store();
  const existing = instance();
  viewRepository.create(path, existing);
  const db = new DatabaseSync(path);
  try {
    db.exec(
      "CREATE TRIGGER fail_view_event BEFORE INSERT ON view_events BEGIN SELECT RAISE(ABORT, 'injected event failure'); END",
    );
  } finally {
    db.close();
  }
  const failed = instance();
  expect(() => viewRepository.create(path, failed)).toThrow(
    expect.objectContaining({ code: 'VIEW_CREATE_FAILED' }),
  );
  expect(viewRepository.list(path)).toEqual([existing]);
  const reopened = new DatabaseSync(path, { readOnly: true });
  try {
    expect(reopened.prepare('SELECT view_id FROM view_events').all()).toEqual([
      { view_id: existing.id },
    ]);
  } finally {
    reopened.close();
  }
});

test.each([
  ['title', ' padded '],
  ['definition_url', '/_views/../outside.md'],
  ['definition_id', ''],
  ['created_at', 'not-a-time'],
  ['id', 'invalid-id'],
])(
  'malformed stored %s is an explicit store-data error on get and list',
  (field, value) => {
    const { root, path } = store();
    const view = instance();
    viewRepository.create(path, view);
    const db = new DatabaseSync(path);
    try {
      // Inject corruption independently of normal foreign-key-enforced writes.
      db.exec('PRAGMA foreign_keys = OFF');
      db.prepare(`UPDATE views SET ${field} = ? WHERE id = ?`).run(
        value,
        view.id,
      );
    } finally {
      db.close();
    }
    const before = snapshot(root);
    for (const operation of [
      () => viewRepository.get(path, field === 'id' ? value : view.id),
      () => viewRepository.list(path),
    ])
      expect(operation).toThrow(
        expect.objectContaining({ code: 'INVALID_STORE' }),
      );
    expect(snapshot(root)).toEqual(before);
  },
);

test('missing stores fail reads and creation without creating a replacement', () => {
  const { root } = store();
  const missing = join(root, 'missing.sqlite');
  const before = snapshot(root);
  expect(() => viewRepository.list(missing)).toThrow(
    expect.objectContaining({ code: 'VIEW_READ_FAILED' }),
  );
  expect(() => viewRepository.get(missing, randomUUID())).toThrow(
    expect.objectContaining({ code: 'VIEW_READ_FAILED' }),
  );
  expect(() => viewRepository.create(missing, instance())).toThrow(
    expect.objectContaining({ code: 'VIEW_CREATE_FAILED' }),
  );
  expect(snapshot(root)).toEqual(before);
});

test('schema discovery rejects a View event table without its semantic kind constraint', () => {
  const { root, path } = store();
  const db = new DatabaseSync(path);
  try {
    db.exec(`DROP TABLE view_events;
      CREATE TABLE view_events (
        event_id INTEGER PRIMARY KEY, kind TEXT NOT NULL,
        view_id TEXT NOT NULL REFERENCES views(id), created_at TEXT NOT NULL
      ) STRICT;`);
  } finally {
    db.close();
  }
  const before = snapshot(root);
  expect(() => workspaceStore.validate(path)).toThrow(
    expect.objectContaining({ code: 'INVALID_STORE' }),
  );
  expect(snapshot(root)).toEqual(before);
});
