import { statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { ActionRepository } from '../../application/ports/index.js';
import {
  actionId,
  actionStates,
  type Action,
} from '../../domain/actions/index.js';
import {
  validateTitle,
  WorkspaceError,
} from '../../domain/workspaces/index.js';

const rowSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    state: z.enum(actionStates),
    waiting_for: z.string().nullable(),
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
    Date.parse(row.updated_at) < Date.parse(row.created_at) ||
    (row.waiting_for !== null &&
      (row.state !== 'waiting' || !row.waiting_for.trim()))
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
    ...(row.waiting_for === null ? {} : { waiting_for: row.waiting_for }),
    owner: { url: row.owner_url },
    ...(row.description === null ? {} : { description: row.description }),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const actionRepository: ActionRepository = {
  update(path, id, change) {
    let db: DatabaseSync | undefined;
    try {
      if (!statSync(path).isFile()) throw new Error('Missing store');
      // Open an existing file only; BEGIN IMMEDIATE serializes writers before reading.
      db = new DatabaseSync(path);
      db.exec(
        'PRAGMA busy_timeout = 1000; PRAGMA foreign_keys = ON; BEGIN IMMEDIATE',
      );
      const row = db
        .prepare(
          'SELECT id,title,state,owner_url,description,created_at,updated_at,waiting_for FROM actions WHERE id = ?',
        )
        .get(id);
      if (row === undefined)
        throw new WorkspaceError(
          'ACTION_NOT_FOUND',
          'No Action with that ID exists in this Workspace.',
        );
      let current: Action;
      try {
        current = mapRow(row);
      } catch {
        throw new WorkspaceError(
          'ACTION_READ_FAILED',
          'Could not read a valid Action. Check store access and integrity.',
        );
      }
      const action = change(current);
      const fields = (
        ['title', 'description', 'owner', 'state', 'waiting_for'] as const
      )
        .filter((field) =>
          field === 'owner'
            ? action.owner.url !== current.owner.url
            : action[field] !== current[field],
        )
        .map((field) => (field === 'waiting_for' ? 'waiting_for' : field));
      const changed = fields.length > 0;
      if (changed) {
        const written = db
          .prepare(
            'UPDATE actions SET title = ?, description = ?, owner_url = ?, state = ?, waiting_for = ?, updated_at = ? WHERE id = ? AND title = ? AND description IS ? AND owner_url = ? AND state = ? AND waiting_for IS ? AND updated_at = ?',
          )
          .run(
            action.title,
            action.description ?? null,
            action.owner.url,
            action.state,
            action.waiting_for ?? null,
            action.updated_at,
            id,
            current.title,
            current.description ?? null,
            current.owner.url,
            current.state,
            current.waiting_for ?? null,
            current.updated_at,
          );
        if (written.changes !== 1)
          throw new WorkspaceError(
            'ACTION_CONFLICT',
            'The Action changed concurrently. Read it again and retry.',
          );
        db.prepare(
          'INSERT INTO action_events (kind,action_id,created_at,old_state,new_state,old_waiting_for,new_waiting_for,changed_fields,old_owner_url,new_owner_url) VALUES (?,?,?,?,?,?,?,?,?,?)',
        ).run(
          fields.some((field) =>
            ['title', 'description', 'owner'].includes(field),
          )
            ? 'action.updated'
            : 'action.state_changed',
          id,
          action.updated_at,
          fields.includes('state') || fields.includes('waiting_for')
            ? current.state
            : null,
          fields.includes('state') || fields.includes('waiting_for')
            ? action.state
            : null,
          fields.includes('state') || fields.includes('waiting_for')
            ? (current.waiting_for ?? null)
            : null,
          fields.includes('state') || fields.includes('waiting_for')
            ? (action.waiting_for ?? null)
            : null,
          JSON.stringify(fields),
          fields.includes('owner') ? current.owner.url : null,
          fields.includes('owner') ? action.owner.url : null,
        );
      }
      db.exec('COMMIT');
      return { action: changed ? action : current, changed };
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      throw new WorkspaceError(
        'ACTION_UPDATE_FAILED',
        'Could not save the Action and its event. Check store access or concurrent writes and retry.',
      );
    } finally {
      // Closing rolls back writes after update, event or COMMIT failure.
      db?.close();
    }
  },
  list(path, filter) {
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(path, { readOnly: true });
      db.exec('PRAGMA busy_timeout = 1000');
      // Canonical owner URLs end in /, so a literal prefix respects path segments.
      const matches =
        filter?.owner === undefined
          ? '1'
          : filter.recursive
            ? 'substr(owner_url, 1, length(?)) = ?'
            : 'owner_url = ?';
      const parameters =
        filter?.owner === undefined
          ? []
          : filter.recursive
            ? [filter.owner, filter.owner]
            : [filter.owner];
      // Validate every row from the same read, including nonmatching owners.
      // A WHERE clause could hide corruption as an empty or partial result.
      const rows = db
        .prepare(
          `SELECT id,title,state,owner_url,description,created_at,updated_at,waiting_for, (${matches}) AS matches_filter FROM actions ORDER BY created_at DESC, id ASC`,
        )
        .all(...parameters)
        .map(({ matches_filter, ...row }) => ({
          action: mapRow(row),
          matches: matches_filter === 1,
        }));
      return rows
        .filter(
          (row) =>
            row.matches &&
            (filter?.states === undefined ||
              filter.states.includes(row.action.state)),
        )
        .map((row) => row.action);
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
        'INSERT INTO actions (id,title,state,owner_url,description,created_at,updated_at,waiting_for) VALUES (?,?,?,?,?,?,?,?)',
      ).run(
        action.id,
        action.title,
        action.state,
        action.owner.url,
        action.description ?? null,
        action.created_at,
        action.updated_at,
        action.waiting_for ?? null,
      );
      db.prepare(
        'INSERT INTO action_events (kind,action_id,created_at,new_state,new_waiting_for) VALUES (?,?,?,?,?)',
      ).run(
        'action.created',
        action.id,
        action.created_at,
        action.state,
        action.waiting_for ?? null,
      );
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
          'SELECT id,title,state,owner_url,description,created_at,updated_at,waiting_for FROM actions WHERE id = ?',
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
