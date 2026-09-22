import { validateTitle, WorkspaceError } from '../workspaces/index.js';
import type { ContextMetadata } from '../contexts/index.js';

export interface ActionInput {
  title: string;
  description?: string | undefined;
  owner?: string | undefined;
}
export interface Action {
  id: string;
  title: string;
  state: 'open';
  owner: { url: string };
  description?: string;
  created_at: string;
  updated_at: string;
}

export function actionId(value: string): string {
  const id = value.startsWith('owf:action:') ? value.slice(11) : value;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      id,
    )
  )
    throw new WorkspaceError(
      'INVALID_ARGUMENT',
      'Supply a UUID v4 or owf:action:UUID without a query or fragment.',
    );
  return id.toLowerCase();
}

export function validateActionOwner(chain: ContextMetadata[]): void {
  if (
    chain.some(
      (owner) =>
        !['active', 'parked'].includes(owner.state) ||
        owner.archivedFrom !== undefined,
    )
  )
    throw new WorkspaceError(
      'INVALID_OWNER',
      'Choose an active or parked owner with no terminal or archived ancestors.',
    );
}

export function newAction(
  input: ActionInput,
  id: string,
  time: string,
  owner: string,
): Action {
  return {
    id: actionId(id),
    title: validateTitle(input.title),
    state: 'open',
    owner: { url: owner },
    ...(input.description === undefined
      ? {}
      : { description: input.description }),
    created_at: time,
    updated_at: time,
  };
}
