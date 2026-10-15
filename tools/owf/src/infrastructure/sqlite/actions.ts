import { statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { ActionRepository } from '../../application/ports/index.js';
import {
  projectAction,
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
    manual_block: z.string().nullable(),
    depends_on: z.string(),
    owner_url: z.string(),
    description: z.string().nullable(),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .strict();

function mapRow(value: unknown): Action {
  const row = rowSchema.parse(value);
  const dependencies = z.array(z.string()).parse(JSON.parse(row.depends_on));
  if (
    new Set(dependencies).size !== dependencies.length ||
    dependencies.some((uri) => uri !== `owf:action:${actionId(uri)}`) ||
    (row.manual_block !== null &&
      (!row.manual_block.trim() ||
        ['completed', 'cancelled'].includes(row.state)))
  )
    throw new Error('Invalid blocking data');
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
    depends_on: dependencies.sort(),
    ...(row.manual_block === null ? {} : { manual_block: row.manual_block }),
    ...(row.waiting_for === null ? {} : { waiting_for: row.waiting_for }),
    owner: { url: row.owner_url },
    ...(row.description === null ? {} : { description: row.description }),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// One statement loads all authoritative source/target facts from a single SQLite snapshot.
// Validate all rows and references before selection so filters cannot conceal corruption.
function readActions(db: DatabaseSync): Map<string, Action> {
  try {
    const actions = db
      .prepare(
        'SELECT id,title,state,owner_url,description,created_at,updated_at,waiting_for,manual_block,depends_on FROM actions ORDER BY created_at DESC, id ASC',
      )
      .all()
      .map(mapRow);
    const byId = new Map(actions.map((action) => [action.id, action]));
    for (const action of actions) projectAction(action, (id) => byId.get(id));
    return byId;
  } catch {
    throw new WorkspaceError(
      'ACTION_READ_FAILED',
      'Could not read valid Actions and prerequisites. Check store access and integrity.',
    );
  }
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
      const byId = readActions(db);
      const current = byId.get(id);
      if (!current)
        throw new WorkspaceError(
          'ACTION_NOT_FOUND',
          'No Action with that ID exists in this Workspace.',
        );
      const action = change(current, (targetId) => byId.get(targetId));
      const fields = (
        [
          'title',
          'description',
          'owner',
          'state',
          'waiting_for',
          'manual_block',
          'depends_on',
        ] as const
      )
        .filter((field) =>
          field === 'owner'
            ? action.owner.url !== current.owner.url
            : field === 'depends_on'
              ? JSON.stringify(action.depends_on ?? []) !==
                JSON.stringify(current.depends_on ?? [])
              : action[field] !== current[field],
        )
        .map((field) => (field === 'waiting_for' ? 'waiting_for' : field));
      const changed = fields.length > 0;
      if (changed) {
        const written = db
          .prepare(
            'UPDATE actions SET title = ?, description = ?, owner_url = ?, state = ?, waiting_for = ?, manual_block = ?, depends_on = ?, updated_at = ? WHERE id = ? AND title = ? AND description IS ? AND owner_url = ? AND state = ? AND waiting_for IS ? AND updated_at = ?',
          )
          .run(
            action.title,
            action.description ?? null,
            action.owner.url,
            action.state,
            action.waiting_for ?? null,
            action.manual_block ?? null,
            JSON.stringify(action.depends_on ?? []),
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
          'INSERT INTO action_events (kind,action_id,created_at,old_state,new_state,old_waiting_for,new_waiting_for,changed_fields,old_owner_url,new_owner_url,old_manual_block,new_manual_block,old_depends_on,new_depends_on) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        ).run(
          fields.some((field) =>
            [
              'title',
              'description',
              'owner',
              'manual_block',
              'depends_on',
            ].includes(field),
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
          fields.includes('manual_block')
            ? (current.manual_block ?? null)
            : null,
          fields.includes('manual_block')
            ? (action.manual_block ?? null)
            : null,
          fields.includes('depends_on')
            ? JSON.stringify(current.depends_on ?? [])
            : null,
          fields.includes('depends_on')
            ? JSON.stringify(action.depends_on ?? [])
            : null,
        );
      }
      // Project before COMMIT, including the final candidate for self-dependencies.
      byId.set(id, changed ? action : current);
      const projected = projectAction(changed ? action : current, (targetId) =>
        byId.get(targetId),
      );
      db.exec('COMMIT');
      return { action: projected, changed };
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
      const byId = readActions(db);
      return [...byId.values()]
        .filter(
          (action) =>
            (filter?.owner === undefined ||
              (filter.recursive
                ? action.owner.url.startsWith(filter.owner)
                : action.owner.url === filter.owner)) &&
            (filter?.states === undefined ||
              filter.states.includes(action.state)),
        )
        .map((action) => projectAction(action, (id) => byId.get(id)));
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
        'INSERT INTO actions (id,title,state,owner_url,description,created_at,updated_at,waiting_for,manual_block,depends_on) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ).run(
        action.id,
        action.title,
        action.state,
        action.owner.url,
        action.description ?? null,
        action.created_at,
        action.updated_at,
        action.waiting_for ?? null,
        action.manual_block ?? null,
        JSON.stringify(action.depends_on ?? []),
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
      const byId = readActions(db);
      const action = byId.get(id);
      return action === undefined
        ? undefined
        : projectAction(action, (targetId) => byId.get(targetId));
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
