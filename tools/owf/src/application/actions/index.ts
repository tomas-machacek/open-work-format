import {
  actionId,
  newAction,
  validateActionOwner,
  type Action,
  type ActionInput,
} from '../../domain/actions/index.js';
import {
  validateTitle,
  WorkspaceError,
} from '../../domain/workspaces/index.js';
import type { ActionPorts } from '../ports/index.js';
import { resolveContextOwner } from '../contexts/index.js';
import { discoverWorkspace } from '../workspaces/index.js';

export type { Action, ActionInput } from '../../domain/actions/index.js';
export interface ActionResult {
  result: {
    status: 'created' | 'found';
    type: 'action';
    root: string;
    uri: string;
    action: Action;
  };
  warnings: [];
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
  action: Action,
  status: 'created' | 'found',
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
export function createAction(
  start: string,
  input: ActionInput,
  ports: ActionPorts,
): ActionResult {
  const title = validateTitle(input.title);
  const explicit =
    input.owner === undefined
      ? undefined
      : ports.contexts.decodeOwner(input.owner);
  const found = workspace(start, ports);
  const owner = resolveContextOwner(start, found.root, explicit, ports, false);
  validateActionOwner(owner.chain);
  const action = newAction(
    { ...input, title },
    ports.newId(),
    ports.now(),
    ports.contexts.url(owner.segments),
  );
  ports.actions.create(found.store, action);
  return result(found.root, action, 'created');
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
