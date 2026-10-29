import { statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { ActionRepository } from '../../application/ports/index.js';
import { projectAction, type Action } from '../../domain/actions/index.js';
import { WorkspaceError } from '../../domain/workspaces/index.js';
import {
  readViews,
  readPlacements,
  readOrder,
  writePlacements,
  writeOrder,
} from './views.js';
import { readActions } from './actions-read.js';

export const actionRepository: ActionRepository = {
  delete(path, id, time, validate, cleanup) {
    let db: DatabaseSync | undefined;
    try {
      if (!statSync(path).isFile()) throw new Error('Missing store');
      db = new DatabaseSync(path);
      db.exec(
        'PRAGMA busy_timeout = 1000; PRAGMA foreign_keys = ON; BEGIN IMMEDIATE',
      );
      const version = db
        .prepare("SELECT value FROM owf_metadata WHERE key = 'schema_version'")
        .get()?.value;
      if (version !== '9')
        throw new WorkspaceError(
          'UNSUPPORTED_STORE_VERSION',
          `Unsupported store schema ${String(version)}: ${path}`,
        );
      const actions = readActions(db);
      const target = actions.get(id);
      if (!target)
        throw new WorkspaceError(
          'ACTION_NOT_FOUND',
          'No Action with that ID exists in this Workspace.',
        );
      validate(target, [...actions.values()]);
      const before = { placements: readPlacements(db), order: readOrder(db) };
      const after = cleanup(before);
      writePlacements(db, before.placements, after.placements, time);
      writeOrder(db, before.order, after.order, time);
      // Outgoing dependencies are values owned by this row; history has no current FK.
      db.prepare('DELETE FROM actions WHERE id = ?').run(id);
      db.prepare(
        'INSERT INTO action_events (kind, action_id, created_at, title) VALUES (?, ?, ?, ?)',
      ).run('action.deleted', id, time, target.title);
      db.exec('COMMIT');
      return { id, title: target.title };
    } catch (error) {
      if (
        error instanceof WorkspaceError &&
        [
          'ACTION_NOT_FOUND',
          'ACTION_IN_USE',
          'UNSUPPORTED_STORE_VERSION',
        ].includes(error.code)
      )
        throw error;
      throw new WorkspaceError(
        'ACTION_DELETE_FAILED',
        'Could not delete the Action, its organization and event. Check store access and integrity or concurrent writes and retry.',
      );
    } finally {
      db?.close();
    }
  },
  update(path, id, change, organizationChange, eventTime) {
    let db: DatabaseSync | undefined;
    try {
      if (!statSync(path).isFile()) throw new Error('Missing store');
      // Open an existing file only; BEGIN IMMEDIATE serializes writers before reading.
      db = new DatabaseSync(path);
      db.exec(
        'PRAGMA busy_timeout = 1000; PRAGMA foreign_keys = ON; BEGIN IMMEDIATE',
      );
      const version = db
        .prepare("SELECT value FROM owf_metadata WHERE key = 'schema_version'")
        .get()?.value;
      if (version !== '9')
        throw new WorkspaceError(
          'UNSUPPORTED_STORE_VERSION',
          `Unsupported store schema ${String(version)}: ${path}`,
        );
      const byId = readActions(db);
      const current = byId.get(id);
      if (!current)
        throw new WorkspaceError(
          'ACTION_NOT_FOUND',
          'No Action with that ID exists in this Workspace.',
        );
      const snapshot = {
        actions: [...byId.values()].map((action) =>
          projectAction(action, (targetId) => byId.get(targetId)),
        ),
        views: readViews(db),
        placements: readPlacements(db),
        order: readOrder(db),
      };
      const action = change(
        current,
        (targetId) => byId.get(targetId),
        snapshot,
      );
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
            : fields.includes('state')
              ? 'action.state_changed'
              : 'action.updated',
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
      const organization = organizationChange?.(
        snapshot,
        [...byId.values()].map((candidate) =>
          projectAction(candidate, (targetId) => byId.get(targetId)),
        ),
      );
      const placementChanged =
        organization === undefined
          ? false
          : writePlacements(
              db,
              snapshot.placements,
              organization.placements,
              eventTime ?? action.updated_at,
            );
      const orderChanged =
        organization === undefined
          ? false
          : writeOrder(
              db,
              snapshot.order,
              organization.order,
              eventTime ?? action.updated_at,
            );
      db.exec('COMMIT');
      return {
        action: projected,
        changed: changed || placementChanged || orderChanged,
      };
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
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      throw new WorkspaceError(
        'ACTION_READ_FAILED',
        'Could not read valid Actions. Check store access and integrity.',
      );
    } finally {
      db?.close();
    }
  },
  create(path, action, organizationChange) {
    let db: DatabaseSync | undefined;
    try {
      // Discovery validated the existing store; never create a missing database.
      if (!statSync(path).isFile()) throw new Error('Missing store');
      db = new DatabaseSync(path);
      db.exec(
        'PRAGMA busy_timeout = 1000; PRAGMA foreign_keys = ON; BEGIN IMMEDIATE',
      );
      const views = readViews(db);
      const byId =
        views.length === 0 ? new Map<string, Action>() : readActions(db);
      const snapshot = {
        actions: [...byId.values()].map((candidate) =>
          projectAction(candidate, (id) => byId.get(id)),
        ),
        views,
        placements: readPlacements(db),
        order: readOrder(db),
      };
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
      byId.set(action.id, action);
      const organization = organizationChange?.(
        snapshot,
        [...byId.values()].map((candidate) =>
          projectAction(candidate, (id) => byId.get(id)),
        ),
      );
      if (organization) {
        writePlacements(
          db,
          snapshot.placements,
          organization.placements,
          action.created_at,
        );
        writeOrder(db, snapshot.order, organization.order, action.created_at);
      }
      db.exec('COMMIT');
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
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
