import { DatabaseSync } from 'node:sqlite';
import { accessSync, constants, statSync } from 'node:fs';
import type { WorkspaceStore } from '../../application/ports/index.js';
import { WorkspaceError } from '../../domain/workspaces/index.js';

const eventTableSchema = `CREATE TABLE action_events (
          event_id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('action.created','action.state_changed','action.updated')),
          action_id TEXT NOT NULL REFERENCES actions(id), created_at TEXT NOT NULL,
          old_state TEXT, new_state TEXT, old_waiting_for TEXT, new_waiting_for TEXT,
          changed_fields TEXT, old_owner_url TEXT, new_owner_url TEXT,
          old_manual_block TEXT, new_manual_block TEXT, old_depends_on TEXT, new_depends_on TEXT
        )`;

const viewEventTableSchema = `CREATE TABLE view_events (
          event_id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('view.created','view.placement_changed','view.order_changed')),
          view_id TEXT NOT NULL REFERENCES views(id), created_at TEXT NOT NULL,
          action_id TEXT REFERENCES actions(id), old_column_id TEXT, new_column_id TEXT
        )`;

const viewTableSchema = `CREATE TABLE views (
          id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL CHECK(length(trim(title)) > 0),
          definition_url TEXT NOT NULL, definition_id TEXT, created_at TEXT NOT NULL
        )`;

const placementTableSchema = `CREATE TABLE view_placements (
          view_id TEXT NOT NULL REFERENCES views(id), action_id TEXT NOT NULL REFERENCES actions(id),
          column_id TEXT NOT NULL CHECK(length(trim(column_id)) > 0),
          PRIMARY KEY (view_id, action_id)
        )`;

const orderTableSchema = `CREATE TABLE view_order (
          view_id TEXT NOT NULL REFERENCES views(id), action_id TEXT NOT NULL REFERENCES actions(id),
          column_id TEXT NOT NULL CHECK(length(trim(column_id)) > 0),
          rank INTEGER NOT NULL CHECK(rank > 0 AND rank <= 9007199254740991),
          PRIMARY KEY (view_id, action_id), UNIQUE (view_id, column_id, rank)
        )`;

export const workspaceStore: WorkspaceStore = {
  initializeReserved(path) {
    const db = new DatabaseSync(path);
    try {
      db.exec(
        'PRAGMA busy_timeout = 1000; PRAGMA journal_mode = MEMORY; BEGIN',
      );
      db.exec(
        'CREATE TABLE owf_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT',
      );
      const insert = db.prepare(
        'INSERT INTO owf_metadata (key, value) VALUES (?, ?)',
      );
      insert.run('format', 'owf-tool-operational');
      insert.run('schema_version', '8');
      db.exec(`
        CREATE TABLE actions (
          id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL CHECK(length(trim(title)) > 0),
          state TEXT NOT NULL CHECK(state IN ('open','in_progress','waiting','completed','cancelled')), owner_url TEXT NOT NULL,
          description TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          waiting_for TEXT CHECK(waiting_for IS NULL OR (state = 'waiting' AND length(trim(waiting_for)) > 0)),
          manual_block TEXT CHECK(manual_block IS NULL OR (state IN ('open','in_progress','waiting') AND length(trim(manual_block)) > 0)),
          depends_on TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(depends_on) AND json_type(depends_on) = 'array')
        ) STRICT;
        ${eventTableSchema} STRICT;
        ${viewTableSchema} STRICT;
        ${viewEventTableSchema} STRICT;
        ${placementTableSchema} STRICT;
        ${orderTableSchema} STRICT;
      `);
      db.exec('COMMIT');
    } finally {
      db.close();
    }
  },
  validate(path) {
    try {
      if (!statSync(path).isFile()) throw new Error('Not a file');
      accessSync(path, constants.R_OK);
    } catch {
      throw new WorkspaceError(
        'STORE_UNAVAILABLE',
        `Cannot access store: ${path}`,
      );
    }
    let db: DatabaseSync;
    try {
      db = new DatabaseSync(path, { readOnly: true });
    } catch {
      throw new WorkspaceError(
        'STORE_UNAVAILABLE',
        `Cannot open store: ${path}`,
      );
    }
    try {
      db.exec('PRAGMA busy_timeout = 1000');
      const rows = db.prepare('SELECT key, value FROM owf_metadata').all();
      const format = rows.find((row) => row.key === 'format')?.value;
      const version = rows.find((row) => row.key === 'schema_version')?.value;
      if (format !== 'owf-tool-operational' || typeof version !== 'string')
        throw new WorkspaceError(
          'INVALID_STORE',
          `Unrecognized store: ${path}`,
        );
      if (version !== '8')
        throw new WorkspaceError(
          'UNSUPPORTED_STORE_VERSION',
          `Unsupported store schema ${version}: ${path}`,
        );
      db.prepare(
        'SELECT id, title, state, owner_url, description, created_at, updated_at, waiting_for, manual_block, depends_on FROM actions LIMIT 0',
      ).all();
      db.prepare(
        'SELECT event_id, kind, action_id, created_at, old_state, new_state, old_waiting_for, new_waiting_for, changed_fields, old_owner_url, new_owner_url, old_manual_block, new_manual_block, old_depends_on, new_depends_on FROM action_events LIMIT 0',
      ).all();
      const eventTable = db
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'action_events'",
        )
        .get()?.sql;
      if (
        typeof eventTable !== 'string' ||
        eventTable.replace(/\s+/gu, ' ').trim() !==
          `${eventTableSchema} STRICT`.replace(/\s+/gu, ' ').trim()
      )
        throw new Error('Invalid Action event table');
      const viewTable = db
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'views'",
        )
        .get()?.sql;
      if (
        typeof viewTable !== 'string' ||
        viewTable.replace(/\s+/gu, ' ').trim() !==
          `${viewTableSchema} STRICT`.replace(/\s+/gu, ' ').trim()
      )
        throw new Error('Invalid View instance table');
      const viewEventTable = db
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'view_events'",
        )
        .get()?.sql;
      if (
        typeof viewEventTable !== 'string' ||
        viewEventTable.replace(/\s+/gu, ' ').trim() !==
          `${viewEventTableSchema} STRICT`.replace(/\s+/gu, ' ').trim()
      )
        throw new Error('Invalid View event table');
      const integrity = db.prepare('PRAGMA quick_check').get();
      const placements = db
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'view_placements'",
        )
        .get()?.sql;
      if (
        typeof placements !== 'string' ||
        placements.replace(/\s+/gu, ' ').trim() !==
          `${placementTableSchema} STRICT`.replace(/\s+/gu, ' ').trim()
      )
        throw new Error('Invalid View placement table');
      const orderTable = db
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'view_order'",
        )
        .get()?.sql;
      if (
        typeof orderTable !== 'string' ||
        orderTable.replace(/\s+/gu, ' ').trim() !==
          `${orderTableSchema} STRICT`.replace(/\s+/gu, ' ').trim()
      )
        throw new Error('Invalid View order table');
      if (integrity?.quick_check !== 'ok') throw new Error('Corrupt store');
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      throw new WorkspaceError(
        'INVALID_STORE',
        `Invalid SQLite metadata: ${path}`,
      );
    } finally {
      db.close();
    }
  },
};

export { actionRepository } from './actions.js';
export { viewRepository } from './views.js';
