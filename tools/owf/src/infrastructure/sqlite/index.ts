import { DatabaseSync } from 'node:sqlite';
import { accessSync, constants, statSync } from 'node:fs';
import type { WorkspaceStore } from '../../application/ports/index.js';
import { WorkspaceError } from '../../domain/workspaces/index.js';

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
      insert.run('schema_version', '3');
      db.exec(`
        CREATE TABLE actions (
          id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL CHECK(length(trim(title)) > 0),
          state TEXT NOT NULL CHECK(state IN ('open','in_progress','waiting','completed','cancelled')), owner_url TEXT NOT NULL,
          description TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          waiting_for TEXT CHECK(waiting_for IS NULL OR (state = 'waiting' AND length(trim(waiting_for)) > 0))
        ) STRICT;
        CREATE TABLE action_events (
          event_id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('action.created','action.state_changed')),
          action_id TEXT NOT NULL REFERENCES actions(id), created_at TEXT NOT NULL,
          old_state TEXT, new_state TEXT, old_waiting_for TEXT, new_waiting_for TEXT
        ) STRICT;
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
      if (version !== '3')
        throw new WorkspaceError(
          'UNSUPPORTED_STORE_VERSION',
          `Unsupported store schema ${version}: ${path}`,
        );
      db.prepare(
        'SELECT id, title, state, owner_url, description, created_at, updated_at, waiting_for FROM actions LIMIT 0',
      ).all();
      db.prepare(
        'SELECT event_id, kind, action_id, created_at, old_state, new_state, old_waiting_for, new_waiting_for FROM action_events LIMIT 0',
      ).all();
      const integrity = db.prepare('PRAGMA quick_check').get();
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
