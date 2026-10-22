import {
  validateTitle,
  WorkspaceError,
} from '../../domain/workspaces/index.js';
import {
  evaluateView,
  type EvaluatedViewColumn,
  type ViewDefinition,
  type ViewInstance,
} from '../../domain/views/index.js';
import type { ViewPorts, ViewEvaluationPorts } from '../ports/index.js';
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
      result: {
        status: 'evaluated',
        type: 'view',
        root: found.root,
        view,
        columns: evaluateView(definition, actions),
      },
      warnings: [],
    };
  } catch (error) {
    throw new WorkspaceError(
      error instanceof WorkspaceError ? error.code : 'VIEW_READ_FAILED',
      `View instance ${id}${reference === undefined ? '' : `, definition ${reference}`}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
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
