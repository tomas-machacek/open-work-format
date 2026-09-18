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
      insert.run('schema_version', '1');
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
      if (version !== '1')
        throw new WorkspaceError(
          'UNSUPPORTED_STORE_VERSION',
          `Unsupported store schema ${version}: ${path}`,
        );
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
