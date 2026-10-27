import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { snapshot } from './workspace.js';

// Compare semantic SQLite contents and filesystem contents, never database/WAL bytes.
export function semanticSnapshot(root: string, store: string) {
  const files = snapshot(root, [
    store,
    `${store}-wal`,
    `${store}-shm`,
    `${store}-journal`,
  ]);
  if (!existsSync(store)) return { files, store: null };
  const db = new DatabaseSync(store, { readOnly: true });
  try {
    db.exec('BEGIN');
    return {
      files,
      store: {
        schema: db
          .prepare(
            'SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name',
          )
          .all(),
        tables: [
          'owf_metadata',
          'actions',
          'action_events',
          'views',
          'view_events',
          'view_placements',
        ].map((table) => ({
          table,
          rows: db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
        })),
      },
    };
  } finally {
    db.close();
  }
}
