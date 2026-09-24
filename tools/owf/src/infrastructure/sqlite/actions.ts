import { statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { ActionRepository } from '../../application/ports/index.js';
import { actionId, type Action } from '../../domain/actions/index.js';
import {
  validateTitle,
  WorkspaceError,
} from '../../domain/workspaces/index.js';

const rowSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    state: z.literal('open'),
    owner_url: z.string(),
    description: z.string().nullable(),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .strict();

function mapRow(value: unknown): Action {
  const row = rowSchema.parse(value);
  if (
    actionId(row.id) !== row.id ||
    validateTitle(row.title) !== row.title ||
    row.created_at !== row.updated_at
  )
    throw new Error('Invalid Action');
  const parts = row.owner_url.split('/');
  if (
    !row.owner_url.startsWith('/') ||
    !row.owner_url.endsWith('/') ||
    /[\\?#\s]/u.test(row.owner_url)
  )
    throw new Error('Invalid reference');
  if (row.owner_url !== '/') {
    for (const part of parts.slice(1, -1)) {
      const decoded = decodeURIComponent(part);
      if (
        !decoded ||
        decoded === '.' ||
        decoded === '..' ||
        /[/\\]/u.test(decoded) ||
        [...decoded].some(
          (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
        )
      )
        throw new Error('Invalid reference');
    }
  }
  return {
    id: row.id,
    title: row.title,
    state: row.state,
    owner: { url: row.owner_url },
    ...(row.description === null ? {} : { description: row.description }),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const actionRepository: ActionRepository = {
  list(path, filter) {
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(path, { readOnly: true });
      db.exec('PRAGMA busy_timeout = 1000');
      // Canonical owner URLs end in /, so a literal prefix respects path segments.
      const matches =
        filter === undefined
          ? '1'
          : filter.recursive
            ? 'substr(owner_url, 1, length(?)) = ?'
            : 'owner_url = ?';
      const parameters =
        filter === undefined
          ? []
          : filter.recursive
            ? [filter.owner, filter.owner]
            : [filter.owner];
      // Validate every row from the same read, including nonmatching owners.
      // A WHERE clause could hide corruption as an empty or partial result.
      const rows = db
        .prepare(
          `SELECT id,title,state,owner_url,description,created_at,updated_at, (${matches}) AS matches_filter FROM actions ORDER BY created_at DESC, id ASC`,
        )
        .all(...parameters)
        .map(({ matches_filter, ...row }) => ({
          action: mapRow(row),
          matches: matches_filter === 1,
        }));
      return rows.filter((row) => row.matches).map((row) => row.action);
    } catch {
      throw new WorkspaceError(
        'ACTION_READ_FAILED',
        'Could not read valid Actions. Check store access and integrity.',
      );
    } finally {
      db?.close();
    }
  },
  create(path, action) {
    let db: DatabaseSync | undefined;
    try {
      // Discovery validated the existing store; never create a missing database.
      if (!statSync(path).isFile()) throw new Error('Missing store');
      db = new DatabaseSync(path);
      db.exec(
        'PRAGMA busy_timeout = 1000; PRAGMA foreign_keys = ON; BEGIN IMMEDIATE',
      );
      db.prepare(
        'INSERT INTO actions (id,title,state,owner_url,description,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
      ).run(
        action.id,
        action.title,
        action.state,
        action.owner.url,
        action.description ?? null,
        action.created_at,
        action.updated_at,
      );
      db.prepare(
        'INSERT INTO action_events (kind,action_id,created_at) VALUES (?,?,?)',
      ).run('action.created', action.id, action.created_at);
      db.exec('COMMIT');
    } catch {
      throw new WorkspaceError(
        'ACTION_CREATE_FAILED',
        'Could not save the Action and its event. Check store access and retry.',
      );
    } finally {
      // SQLite close rolls back an uncommitted transaction, including failed COMMIT.
      db?.close();
    }
  },
  get(path, id) {
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(path, { readOnly: true });
      db.exec('PRAGMA busy_timeout = 1000');
      const row = db
        .prepare(
          'SELECT id,title,state,owner_url,description,created_at,updated_at FROM actions WHERE id = ?',
        )
        .get(id);
      return row === undefined ? undefined : mapRow(row);
    } catch {
      throw new WorkspaceError(
        'ACTION_READ_FAILED',
        'Could not read a valid Action. Check store access and integrity.',
      );
    } finally {
      db?.close();
    }
  },
};
