import {
  validateActionDeletion,
  projectAction,
  validateCompletion,
  type ActionProjection,
  actionId,
  actionState,
  editAction,
  validateEditRequest,
  validateStateRequest,
  type SetActionInput,
  newAction,
  validateActionOwner,
  type ActionInput,
} from '../../domain/actions/index.js';
import { removeActionOrganization } from '../../domain/views/index.js';
import {
  validateTitle,
  WorkspaceError,
} from '../../domain/workspaces/index.js';
import type { ViewPorts, ActionPorts } from '../ports/index.js';
import { resolveContextOwner } from '../contexts/index.js';
import { discoverWorkspace } from '../workspaces/index.js';
import { getView, reconcilePlacements } from '../views/index.js';

export type {
  Action,
  ActionProjection,
  ActionInput,
  SetActionInput,
} from '../../domain/actions/index.js';
export interface ListActionsInput {
  search?: string | undefined;
  owner?: string | undefined;
  recursive?: boolean | undefined;
  state?: string[] | undefined;
}
export interface ListActionsResult {
  result: {
    status: 'listed';
    type: 'actions';
    root: string;
    actions: ActionProjection[];
  };
  warnings: [];
}
export function listActions(
  start: string,
  input: ListActionsInput,
  ports: ActionPorts,
): ListActionsResult {
  const search = input.search?.trim().toLowerCase();
  if (search === '')
    throw new WorkspaceError(
      'INVALID_ARGUMENT',
      'Search text must be nonblank.',
    );
  if (input.recursive && input.owner === undefined)
    throw new WorkspaceError(
      'INVALID_ARGUMENT',
      '--recursive requires --owner.',
    );
  const states = input.state?.map(actionState);
  const ownerFilter =
    input.owner === undefined
      ? undefined
      : {
          owner: ports.contexts.url(ports.contexts.decodeOwner(input.owner)),
          recursive: input.recursive ?? false,
        };
  const found = workspace(start, ports);
  return {
    result: {
      status: 'listed',
      type: 'actions',
      root: found.root,
      actions: ports.actions
        .list(found.store, {
          ...ownerFilter,
          ...(states === undefined ? {} : { states }),
        })
        .filter(
          (action) =>
            search === undefined ||
            action.title.toLowerCase().includes(search) ||
            (action.description?.toLowerCase().includes(search) ?? false),
        ),
    },
    warnings: [],
  };
}
export interface ActionResult {
  result: {
    status: 'created' | 'found' | 'updated' | 'unchanged';
    type: 'action';
    root: string;
    uri: string;
    action: ActionProjection;
  };
  warnings: [];
}
export interface DeleteActionResult {
  result: {
    status: 'deleted';
    type: 'action';
    root: string;
    id: string;
    title: string;
    uri: string;
  };
  warnings: [];
}
export function deleteAction(
  start: string,
  identifier: string,
  ports: ActionPorts,
): DeleteActionResult {
  const id = actionId(identifier);
  const found = workspace(start, ports);
  const deleted = ports.actions.delete(
    found.store,
    id,
    ports.now(),
    validateActionDeletion,
    ({ placements, order }) => removeActionOrganization(id, placements, order),
  );
  return {
    result: {
      status: 'deleted',
      type: 'action',
      root: found.root,
      ...deleted,
      uri: `owf:action:${id}`,
    },
    warnings: [],
  };
}
export interface ExpectedActionSnapshot {
  state: string;
  updated_at: string;
  waiting_for?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  owner?: { url: string } | undefined;
}
function workspace(start: string, ports: ActionPorts) {
  const found = discoverWorkspace(start, ports);
  if (!found)
    throw new WorkspaceError(
      'WORKSPACE_NOT_FOUND',
      'Enter an initialized Workspace first.',
    );
  return found;
}
function result(
  root: string,
  action: ActionProjection,
  status: ActionResult['result']['status'],
): ActionResult {
  return {
    result: {
      status,
      type: 'action',
      root,
      uri: `owf:action:${action.id}`,
      action,
    },
    warnings: [],
  };
}
export function setAction(
  start: string,
  identifier: string,
  input: SetActionInput,
  ports: ActionPorts,
  expected?: ExpectedActionSnapshot,
): ActionResult {
  const id = actionId(identifier);
  validateEditRequest(input);
  const explicit =
    input.owner === undefined
      ? undefined
      : ports.contexts.decodeOwner(input.owner);
  const found = workspace(start, ports);
  let owner: string | undefined;
  if (explicit !== undefined) {
    const resolved = resolveContextOwner(
      start,
      found.root,
      explicit,
      ports,
      false,
    );
    validateActionOwner(resolved.chain);
    owner = ports.contexts.url(resolved.segments);
  }
  const time = ports.now();
  const saved = ports.actions.update(
    found.store,
    id,
    (current, target) => {
      if (
        expected &&
        (current.state !== expected.state ||
          current.updated_at !== expected.updated_at ||
          current.waiting_for !== expected.waiting_for ||
          ('title' in expected &&
            (current.title !== expected.title ||
              current.description !== expected.description ||
              current.owner.url !== expected.owner?.url)))
      )
        throw new WorkspaceError(
          'ACTION_CONFLICT',
          'The Action changed since it was displayed. Refresh the board and inspect the current values.',
        );
      // Validate even idempotent supplied additions/removals within the write snapshot.
      for (const value of [
        ...(input.addDependency ?? []),
        ...(input.removeDependency ?? []),
      ]) {
        if (!target(actionId(value)))
          throw new WorkspaceError(
            'ACTION_NOT_FOUND',
            `No prerequisite ${value} exists in this Workspace.`,
          );
      }
      const candidate = editAction(current, input, time, owner);
      validateCompletion(current, projectAction(candidate, target));
      return candidate;
    },
    (snapshot, after) =>
      reconcilePlacements(found.root, id, snapshot, after, ports.definitions),
    time,
  );
  return result(
    found.root,
    saved.action,
    saved.changed ? 'updated' : 'unchanged',
  );
}
export interface ViewCreationTarget {
  view: string;
  column: string;
  expected_definition: string;
}
export function createActionInView(
  start: string,
  input: ActionInput,
  target: ViewCreationTarget,
  ports: ActionPorts & ViewPorts,
): ActionResult {
  const { definition } = getView(start, target.view, ports).result;
  if (JSON.stringify(definition) !== target.expected_definition)
    throw new WorkspaceError(
      'VIEW_CONFLICT',
      'View definition changed. Refresh and review the destination.',
    );
  const column = definition!.columns.find((c) => c.id === target.column);
  if (!column || column.type === 'blocked')
    throw new WorkspaceError(
      'INVALID_ARGUMENT',
      'Choose an ordinary View column.',
    );
  return createAction(
    start,
    { ...input, state: column.default_status },
    ports,
    target,
  );
}
export function createAction(
  start: string,
  input: ActionInput,
  ports: ActionPorts,
  destination?: ViewCreationTarget,
): ActionResult {
  const found = workspace(start, ports);
  const creationDefinition = destination?.expected_definition;
  const title = validateTitle(input.title);
  validateStateRequest({
    state: input.state ?? 'open',
    waitingFor: input.waitingFor,
  });
  const explicit =
    input.owner === undefined
      ? undefined
      : ports.contexts.decodeOwner(input.owner);
  const owner = resolveContextOwner(start, found.root, explicit, ports, false);
  validateActionOwner(owner.chain);
  const action = newAction(
    { ...input, title },
    ports.newId(),
    ports.now(),
    ports.contexts.url(owner.segments),
  );
  ports.actions.create(found.store, action, (snapshot, after) => {
    if (destination) {
      const view = snapshot.views.find((v) => v.id === destination.view);
      if (!view)
        throw new WorkspaceError(
          'VIEW_NOT_FOUND',
          'View instance no longer exists.',
        );
      const definition = ports.definitions.load(found.root, view.definition);
      const column = definition.columns.find(
        (c) => c.id === destination.column,
      );
      if (!column || column.type === 'blocked')
        throw new WorkspaceError(
          'INVALID_ARGUMENT',
          'Choose an ordinary View column.',
        );
      if (
        JSON.stringify(definition) !== creationDefinition ||
        column.default_status !== action.state
      )
        throw new WorkspaceError(
          'VIEW_CONFLICT',
          'View definition changed. Refresh and review the destination before creating.',
        );
    }
    return reconcilePlacements(
      found.root,
      action.id,
      snapshot,
      after,
      ports.definitions,
      destination,
    );
  });
  return result(
    found.root,
    projectAction(action, () => undefined),
    'created',
  );
}
export function getAction(
  start: string,
  identifier: string,
  ports: ActionPorts,
): ActionResult {
  const id = actionId(identifier);
  const found = workspace(start, ports);
  const action = ports.actions.get(found.store, id);
  if (!action)
    throw new WorkspaceError(
      'ACTION_NOT_FOUND',
      'No Action with that ID exists in this Workspace.',
    );
  return result(found.root, action, 'found');
}
