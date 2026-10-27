import {
  validateTitle,
  WorkspaceError,
} from '../../domain/workspaces/index.js';
import {
  evaluateView,
  moveViewAction,
  type MoveActionInput,
  type EvaluatedViewColumn,
  type ViewDefinition,
  type ViewInstance,
} from '../../domain/views/index.js';
import type {
  ViewPorts,
  ViewEvaluationPorts,
  ViewMovePorts,
} from '../ports/index.js';
import { actionId, type ActionProjection } from '../../domain/actions/index.js';
import { reconcilePlacements } from './reconciliation.js';
export { reconcilePlacements } from './reconciliation.js';
export type { MoveActionInput } from '../../domain/views/index.js';
import { discoverWorkspace } from '../workspaces/index.js';

export type { ViewDefinition, ViewInstance } from '../../domain/views/index.js';
export interface CreateViewInput {
  title: string;
  definition: string;
}
export interface ViewResult {
  result: {
    status: 'created' | 'found';
    type: 'view';
    root: string;
    view: ViewInstance;
    definition?: ViewDefinition;
  };
  warnings: [];
}
export interface ListViewsResult {
  result: {
    status: 'listed';
    type: 'views';
    root: string;
    views: ViewInstance[];
  };
  warnings: [];
}
export interface ShowViewResult {
  result: {
    status: 'evaluated';
    type: 'view';
    root: string;
    view: ViewInstance;
    columns: EvaluatedViewColumn[];
  };
  warnings: [];
}

export function showView(
  start: string,
  id: string,
  ports: ViewEvaluationPorts,
): ShowViewResult {
  const { root, view, columns } = readEvaluation(start, id, ports);
  return {
    result: { status: 'evaluated', type: 'view', root, view, columns },
    warnings: [],
  };
}

export interface DisplayViewResult {
  root: string;
  view: ViewInstance;
  columns: { id: string; title: string; members: ActionProjection[] }[];
}

export function displayView(
  start: string,
  id: string,
  ports: ViewEvaluationPorts,
): DisplayViewResult {
  const { root, view, columns, actions } = readEvaluation(start, id, ports);
  const byId = new Map(actions.map((action) => [action.id, action]));
  return {
    root,
    view,
    columns: columns.map((column) => ({
      ...column,
      members: column.members.map((member) => byId.get(member.id)!),
    })),
  };
}

function readEvaluation(start: string, id: string, ports: ViewEvaluationPorts) {
  let reference: string | undefined;
  try {
    const found = workspace(start, ports);
    const view = ports.views.get(found.store, id);
    if (!view)
      throw new WorkspaceError(
        'VIEW_NOT_FOUND',
        'No such stored View instance.',
      );
    reference = view.definition.url;
    const definition = ports.definitions.load(found.root, view.definition);
    // The repository reads candidates and prerequisite facts in one SQLite statement.
    const actions = ports.actions.list(found.store);
    return {
      status: 'evaluated' as const,
      type: 'view' as const,
      root: found.root,
      view,
      columns: evaluateView(
        definition,
        actions,
        ports.views.placements(found.store, id),
      ),
      actions,
    };
  } catch (error) {
    throw new WorkspaceError(
      error instanceof WorkspaceError ? error.code : 'VIEW_READ_FAILED',
      `View instance ${id}${reference === undefined ? '' : `, definition ${reference}`}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export interface MoveActionResult {
  result: {
    status: 'moved' | 'unchanged';
    type: 'view-move';
    root: string;
    view: ViewInstance;
    source: string | null;
    destination: string;
    changed: boolean;
    action: ActionProjection;
  };
  warnings: [];
}

export function moveAction(
  start: string,
  identifier: string,
  input: MoveActionInput,
  ports: ViewMovePorts,
): MoveActionResult {
  const id = actionId(identifier);
  const found = workspace(start, ports);
  let moved: ReturnType<typeof moveViewAction> | undefined;
  let view: ViewInstance | undefined;
  const time = ports.now();
  const saved = ports.actions.update(
    found.store,
    id,
    (current, _target, snapshot) => {
      view = snapshot.views.find((view) => view.id === input.view);
      if (!view)
        throw new WorkspaceError(
          'VIEW_NOT_FOUND',
          `View instance not found: ${input.view}`,
        );
      try {
        const definition = ports.definitions.load(found.root, view.definition);
        moved = moveViewAction(
          definition,
          snapshot.actions,
          snapshot.placements.filter(
            (placement) => placement.view_id === view!.id,
          ),
          snapshot.actions.find((action) => action.id === current.id)!,
          input,
          time,
        );
        return moved.action;
      } catch (error) {
        throw new WorkspaceError(
          error instanceof WorkspaceError ? error.code : 'VIEW_MOVE_FAILED',
          `View instance ${view.id}, definition ${view.definition.url}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    (snapshot, after) => {
      // A same-column request must be entirely write-free, including reconciliation.
      if (!moved!.changed) return snapshot.placements;
      return reconcilePlacements(
        found.root,
        id,
        snapshot,
        after,
        ports.definitions,
      )
        .filter(
          (placement) =>
            placement.view_id !== input.view || placement.action_id !== id,
        )
        .concat({
          view_id: input.view,
          action_id: id,
          column_id: input.column,
        });
    },
    time,
  );
  return {
    result: {
      status: moved!.changed ? 'moved' : 'unchanged',
      type: 'view-move',
      root: found.root,
      view: view!,
      source: moved!.source,
      destination: input.column,
      changed: moved!.changed,
      action: saved.action,
    },
    warnings: [],
  };
}
function workspace(start: string, ports: ViewPorts) {
  const found = discoverWorkspace(start, ports);
  if (!found)
    throw new WorkspaceError(
      'WORKSPACE_NOT_FOUND',
      'Enter an initialized Workspace first.',
    );
  return found;
}
export function createView(
  start: string,
  input: CreateViewInput,
  ports: ViewPorts,
): ViewResult {
  const title = validateTitle(input.title);
  const found = workspace(start, ports);
  const definition = ports.definitions.load(found.root, {
    url: input.definition,
  });
  const view: ViewInstance = {
    id: ports.newId(),
    title,
    definition: {
      url: input.definition,
      ...(definition.id === undefined ? {} : { id: definition.id }),
    },
    created_at: ports.now(),
  };
  ports.views.create(found.store, view);
  return {
    result: { status: 'created', type: 'view', root: found.root, view },
    warnings: [],
  };
}
export function listViews(start: string, ports: ViewPorts): ListViewsResult {
  const found = workspace(start, ports);
  return {
    result: {
      status: 'listed',
      type: 'views',
      root: found.root,
      views: ports.views.list(found.store),
    },
    warnings: [],
  };
}
export function getView(
  start: string,
  id: string,
  ports: ViewPorts,
): ViewResult {
  const found = workspace(start, ports);
  const view = ports.views.get(found.store, id);
  if (!view)
    throw new WorkspaceError(
      'VIEW_NOT_FOUND',
      `View instance not found: ${id}`,
    );
  try {
    const definition = ports.definitions.load(found.root, view.definition);
    return {
      result: {
        status: 'found',
        type: 'view',
        root: found.root,
        view,
        definition,
      },
      warnings: [],
    };
  } catch (error) {
    if (error instanceof WorkspaceError)
      throw new WorkspaceError(
        error.code,
        `View instance ${id}: ${error.message}`,
      );
    throw new WorkspaceError(
      'VIEW_READ_FAILED',
      `View instance ${id}, definition ${view.definition.url}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
