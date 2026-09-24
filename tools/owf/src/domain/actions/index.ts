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
  state: ActionState;
  waiting_for?: string;
  owner: { url: string };
  description?: string;
  created_at: string;
  updated_at: string;
}

export const actionStates = [
  'open',
  'in_progress',
  'waiting',
  'completed',
  'cancelled',
] as const;
export type ActionState = (typeof actionStates)[number];
export interface SetActionInput {
  state: string;
  waitingFor?: string | undefined;
}
export function actionState(value: string): ActionState {
  const state = actionStates.find((state) => state === value);
  if (state === undefined)
    throw new WorkspaceError(
      'INVALID_ARGUMENT',
      `State must be one of: ${actionStates.join(', ')}.`,
    );
  return state;
}
export function validateStateRequest(input: SetActionInput): ActionState {
  const state = actionState(input.state);
  if (
    input.waitingFor !== undefined &&
    (state !== 'waiting' || !input.waitingFor.trim())
  )
    throw new WorkspaceError(
      'INVALID_ARGUMENT',
      '--waiting-for requires waiting and nonblank text.',
    );
  return state;
}
export function changeActionState(
  action: Action,
  input: SetActionInput,
  time: string,
): Action {
  const state = validateStateRequest(input);
  const reason =
    state === 'waiting' ? (input.waitingFor ?? action.waiting_for) : undefined;
  if (state === action.state && reason === action.waiting_for) return action;
  // eslint-disable-next-line no-restricted-globals -- Parse supplied timestamps only; never read the system clock in the domain.
  if (Date.parse(time) < Date.parse(action.created_at))
    throw new WorkspaceError(
      'ACTION_UPDATE_FAILED',
      'Current time precedes Action creation. Check the system clock and retry.',
    );
  const changed = { ...action, state, updated_at: time };
  delete changed.waiting_for;
  if (reason !== undefined) changed.waiting_for = reason;
  return changed;
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
