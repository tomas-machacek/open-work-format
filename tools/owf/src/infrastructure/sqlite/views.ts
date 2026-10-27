import { statSync } from 'node:fs';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import type { ViewRepository } from '../../application/ports/index.js';
import {
  validateViewInstance,
  type ViewInstance,
  type ViewPlacement,
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

export function readViews(db: DatabaseSync): ViewInstance[] {
  return db
    .prepare(`SELECT ${columns} FROM views ORDER BY id ASC`)
    .all()
    .map(mapRow);
}

export function readPlacements(
  db: DatabaseSync,
  viewId?: string,
): ViewPlacement[] {
  return db
    .prepare(
      `SELECT view_id, action_id, column_id FROM view_placements${viewId === undefined ? '' : ' WHERE view_id = ?'} ORDER BY view_id, action_id`,
    )
    .all(...(viewId === undefined ? [] : [viewId]))
    .map((row) => {
      if (
        typeof row.view_id !== 'string' ||
        typeof row.action_id !== 'string' ||
        typeof row.column_id !== 'string' ||
        !row.column_id.trim()
      )
        throw new WorkspaceError(
          'INVALID_VIEW_PLACEMENT',
          'Invalid stored View placement.',
        );
      return {
        view_id: row.view_id,
        action_id: row.action_id,
        column_id: row.column_id,
      };
    });
}

export function writePlacements(
  db: DatabaseSync,
  before: ViewPlacement[],
  after: ViewPlacement[],
  time: string,
): boolean {
  let changed = false;
  for (const old of before) {
    const next = after.find(
      (row) => row.view_id === old.view_id && row.action_id === old.action_id,
    );
    if (next?.column_id === old.column_id) continue;
    changed = true;
    db.prepare(
      'DELETE FROM view_placements WHERE view_id = ? AND action_id = ?',
    ).run(old.view_id, old.action_id);
    db.prepare(
      'INSERT INTO view_events (kind, view_id, created_at, action_id, old_column_id, new_column_id) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      'view.placement_changed',
      old.view_id,
      time,
      old.action_id,
      old.column_id,
      next?.column_id ?? null,
    );
  }
  for (const next of after) {
    const old = before.find(
      (row) => row.view_id === next.view_id && row.action_id === next.action_id,
    );
    if (old?.column_id === next.column_id) continue;
    changed = true;
    db.prepare(
      'INSERT INTO view_placements (view_id, action_id, column_id) VALUES (?, ?, ?)',
    ).run(next.view_id, next.action_id, next.column_id);
    if (!old)
      db.prepare(
        'INSERT INTO view_events (kind, view_id, created_at, action_id, old_column_id, new_column_id) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(
        'view.placement_changed',
        next.view_id,
        time,
        next.action_id,
        null,
        next.column_id,
      );
  }
  return changed;
}

export const viewRepository: ViewRepository = {
  placements(path, viewId) {
    return read(path, (db) => readPlacements(db, viewId));
  },
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
    return read(path, readViews);
  },
};
