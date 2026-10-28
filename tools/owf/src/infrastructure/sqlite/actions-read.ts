import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
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
export function readActions(db: DatabaseSync): Map<string, Action> {
  try {
    const actions = db
      .prepare(
        'SELECT id,title,state,owner_url,description,created_at,updated_at,waiting_for,manual_block,depends_on FROM actions ORDER BY created_at DESC, id ASC',
      )
      .all()
      .map((row) => {
        try {
          return mapRow(row);
        } catch {
          throw new WorkspaceError(
            'ACTION_READ_FAILED',
            `Invalid stored Action ${String(row.id)}. Check store integrity.`,
          );
        }
      });
    const byId = new Map(actions.map((action) => [action.id, action]));
    for (const action of actions) {
      try {
        projectAction(action, (id) => byId.get(id));
      } catch (error) {
        throw new WorkspaceError(
          'ACTION_READ_FAILED',
          `Action ${action.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return byId;
  } catch (error) {
    if (error instanceof WorkspaceError) throw error;
    throw new WorkspaceError(
      'ACTION_READ_FAILED',
      'Could not read valid Actions and prerequisites. Check store access and integrity.',
    );
  }
}
