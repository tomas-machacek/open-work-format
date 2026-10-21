import {
  validateTitle,
  WorkspaceError,
} from '../../domain/workspaces/index.js';
import type { ViewDefinition, ViewInstance } from '../../domain/views/index.js';
import type { ViewPorts } from '../ports/index.js';
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
