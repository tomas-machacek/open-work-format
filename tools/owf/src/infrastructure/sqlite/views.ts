import { statSync } from 'node:fs';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import type { ViewRepository } from '../../application/ports/index.js';
import {
  validateViewInstance,
  type ViewInstance,
} from '../../domain/views/index.js';
import { WorkspaceError } from '../../domain/workspaces/index.js';

const columns = 'id, title, definition_url, definition_id, created_at';

function mapRow(row: Record<string, SQLOutputValue>): ViewInstance {
  try {
    return validateViewInstance({
      id: row.id,
      title: row.title,
      definition: {
        url: row.definition_url,
        ...(row.definition_id === null ? {} : { id: row.definition_id }),
      },
      created_at: row.created_at,
    });
  } catch {
    throw new WorkspaceError(
      'INVALID_STORE',
      `Invalid stored View instance ${String(row.id)}.`,
    );
  }
}

function read<T>(path: string, query: (db: DatabaseSync) => T): T {
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(path, { readOnly: true });
    db.exec('PRAGMA busy_timeout = 1000');
    return query(db);
  } catch (error) {
    if (error instanceof WorkspaceError) throw error;
    throw new WorkspaceError(
      'VIEW_READ_FAILED',
      'Could not read View instances. Check store access and integrity.',
    );
  } finally {
    db?.close();
  }
}

export const viewRepository: ViewRepository = {
  create(path, view) {
    let db: DatabaseSync | undefined;
    try {
      validateViewInstance(view);
      // Discovery validated the existing store; never initialize a missing file.
      if (!statSync(path).isFile()) throw new Error('Missing store');
      db = new DatabaseSync(path);
      db.exec(
        'PRAGMA busy_timeout = 1000; PRAGMA foreign_keys = ON; BEGIN IMMEDIATE',
      );
      db.prepare(`INSERT INTO views (${columns}) VALUES (?, ?, ?, ?, ?)`).run(
        view.id,
        view.title,
        view.definition.url,
        view.definition.id ?? null,
        view.created_at,
      );
      db.prepare(
        'INSERT INTO view_events (kind, view_id, created_at) VALUES (?, ?, ?)',
      ).run('view.created', view.id, view.created_at);
      db.exec('COMMIT');
    } catch {
      throw new WorkspaceError(
        'VIEW_CREATE_FAILED',
        'Could not save the View instance and its event. Check store access and retry.',
      );
    } finally {
      // Closing rolls back the transaction after an insert, event or commit failure.
      db?.close();
    }
  },
  get(path, id) {
    return read(path, (db) => {
      const row = db
        .prepare(`SELECT ${columns} FROM views WHERE id = ?`)
        .get(id);
      return row === undefined ? undefined : mapRow(row);
    });
  },
  list(path) {
    return read(path, (db) =>
      db
        .prepare(`SELECT ${columns} FROM views ORDER BY id ASC`)
        .all()
        .map(mapRow),
    );
  },
};
