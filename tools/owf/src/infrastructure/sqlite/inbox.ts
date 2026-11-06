import { statSync } from 'node:fs';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import type { InboxRepository } from '../../application/ports/index.js';
import {
  inboxId,
  inboxText,
  type InboxItem,
} from '../../domain/inbox/index.js';
import { WorkspaceError } from '../../domain/workspaces/index.js';

function readItem(row: Record<string, SQLOutputValue>): InboxItem {
  if (
    typeof row.id !== 'string' ||
    typeof row.text !== 'string' ||
    typeof row.captured_at !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(row.captured_at) ||
    !Number.isFinite(Date.parse(row.captured_at))
  )
    throw new Error('Invalid Inbox Item');
  const id = inboxId(row.id);
  if (id !== row.id) throw new Error('Noncanonical Inbox ID');
  return { id, text: inboxText(row.text), captured_at: row.captured_at };
}

function access<T>(
  path: string,
  write: boolean,
  operation: (db: DatabaseSync) => T,
): T {
  let db: DatabaseSync | undefined;
  try {
    if (!statSync(path).isFile()) throw new Error('Missing store');
    db = new DatabaseSync(path, { readOnly: !write });
    db.exec('PRAGMA busy_timeout = 1000');
    if (write) db.exec('BEGIN IMMEDIATE');
    const version = db
      .prepare("SELECT value FROM owf_metadata WHERE key = 'schema_version'")
      .get()?.value;
    if (version !== '10')
      throw new WorkspaceError(
        'UNSUPPORTED_STORE_VERSION',
        `Unsupported store schema ${String(version)}: ${path}`,
      );
    const result = operation(db);
    if (write) db.exec('COMMIT');
    return result;
  } catch (error) {
    if (
      error instanceof WorkspaceError &&
      ['INBOX_NOT_FOUND', 'UNSUPPORTED_STORE_VERSION'].includes(error.code)
    )
      throw error;
    throw new WorkspaceError(
      write ? 'INBOX_WRITE_FAILED' : 'INBOX_READ_FAILED',
      write
        ? 'Could not save the Inbox change and its event. Check store access and integrity.'
        : 'Could not read valid Inbox Items. Check store access and integrity.',
    );
  } finally {
    // Closing rolls back uncommitted data and events on any failure.
    db?.close();
  }
}
function required(db: DatabaseSync, id: string): InboxItem {
  const row = db
    .prepare('SELECT id, captured_at, text FROM inbox_items WHERE id = ?')
    .get(id);
  if (!row)
    throw new WorkspaceError(
      'INBOX_NOT_FOUND',
      'No Inbox Item with that ID exists in this Workspace.',
    );
  return readItem(row);
}
function event(db: DatabaseSync, id: string, kind: string, time: string) {
  db.prepare(
    'INSERT INTO inbox_events (kind, inbox_id, created_at) VALUES (?, ?, ?)',
  ).run(kind, id, time);
}

export const inboxRepository: InboxRepository = {
  capture(path, item) {
    access(path, true, (db) => {
      // Event history reserves consumed identities without keeping current Inbox rows.
      if (
        db
          .prepare('SELECT 1 FROM inbox_events WHERE inbox_id = ? LIMIT 1')
          .get(item.id)
      )
        throw new Error('Inbox identity already used');
      db.prepare(
        'INSERT INTO inbox_items (id, captured_at, text) VALUES (?, ?, ?)',
      ).run(item.id, item.captured_at, item.text);
      event(db, item.id, 'inbox.captured', item.captured_at);
    });
  },
  get(path, id) {
    return access(path, false, (db) => {
      const row = db
        .prepare('SELECT id, captured_at, text FROM inbox_items WHERE id = ?')
        .get(id);
      return row ? readItem(row) : undefined;
    });
  },
  list(path) {
    return access(path, false, (db) =>
      db
        .prepare(
          'SELECT id, captured_at, text FROM inbox_items ORDER BY captured_at, id',
        )
        .all()
        .map(readItem),
    );
  },
  update(path, id, change, time) {
    return access(path, true, (db) => {
      const current = required(db, id);
      const item = change(current);
      const changed = item.text !== current.text;
      if (changed) {
        db.prepare('UPDATE inbox_items SET text = ? WHERE id = ?').run(
          item.text,
          id,
        );
        event(db, id, 'inbox.updated', time);
      }
      return { item, changed };
    });
  },
  consume(path, id, outcome, time) {
    access(path, true, (db) => {
      required(db, id);
      db.prepare('DELETE FROM inbox_items WHERE id = ?').run(id);
      event(db, id, `inbox.${outcome}`, time);
    });
  },
};
