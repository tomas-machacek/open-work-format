import { validateTitle, WorkspaceError } from '../workspaces/index.js';
import type { ContextMetadata } from '../contexts/index.js';

export interface ActionInput {
  title: string;
  state?: string | undefined;
  waitingFor?: string | undefined;
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
  state?: string | undefined;
  waitingFor?: string | undefined;
  clearWaitingFor?: boolean | undefined;
  title?: string | undefined;
  description?: string | undefined;
  clearDescription?: boolean | undefined;
  owner?: string | undefined;
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
export function validateStateRequest(input: {
  state: string;
  waitingFor?: string | undefined;
}): ActionState {
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
  input: { state: string; waitingFor?: string | undefined },
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

export function validateEditRequest(input: SetActionInput): void {
  if (
    ![
      input.state,
      input.waitingFor,
      input.title,
      input.description,
      input.owner,
    ].some((value) => value !== undefined) &&
    !input.clearDescription &&
    !input.clearWaitingFor
  )
    throw new WorkspaceError(
      'INVALID_ARGUMENT',
      'Supply at least one change option.',
    );
  if (input.description !== undefined && input.clearDescription)
    throw new WorkspaceError(
      'INVALID_ARGUMENT',
      'Choose --description or --clear-description.',
    );
  if (input.waitingFor !== undefined && input.clearWaitingFor)
    throw new WorkspaceError(
      'INVALID_ARGUMENT',
      'Choose --waiting-for or --clear-waiting-for.',
    );
  if (input.title !== undefined) validateTitle(input.title);
  if (input.state !== undefined) actionState(input.state);
  if (input.waitingFor !== undefined && !input.waitingFor.trim())
    throw new WorkspaceError(
      'INVALID_ARGUMENT',
      '--waiting-for requires nonblank text.',
    );
  if (
    input.state !== undefined &&
    input.state !== 'waiting' &&
    input.clearWaitingFor
  )
    throw new WorkspaceError(
      'INVALID_ARGUMENT',
      'Leaving waiting already clears its reason.',
    );
}

export function editAction(
  action: Action,
  input: SetActionInput,
  time: string,
  owner?: string,
): Action {
  validateEditRequest(input);
  const state =
    input.state === undefined ? action.state : actionState(input.state);
  if (input.waitingFor !== undefined && state !== 'waiting')
    throw new WorkspaceError(
      'INVALID_ARGUMENT',
      '--waiting-for requires waiting.',
    );
  if (input.clearWaitingFor && state !== 'waiting')
    throw new WorkspaceError(
      'INVALID_ARGUMENT',
      '--clear-waiting-for requires waiting.',
    );
  const reason =
    state !== 'waiting' || input.clearWaitingFor
      ? undefined
      : (input.waitingFor ?? action.waiting_for);
  const title =
    input.title === undefined ? action.title : validateTitle(input.title);
  const description = input.clearDescription
    ? undefined
    : (input.description ?? action.description);
  const ownerUrl = owner ?? action.owner.url;
  if (
    state === action.state &&
    reason === action.waiting_for &&
    title === action.title &&
    description === action.description &&
    ownerUrl === action.owner.url
  )
    return action;
  // eslint-disable-next-line no-restricted-globals -- Parse supplied timestamps only.
  if (Date.parse(time) < Date.parse(action.created_at))
    throw new WorkspaceError(
      'ACTION_UPDATE_FAILED',
      'Current time precedes Action creation. Check the system clock and retry.',
    );
  // A distinct revision timestamp also invalidates an old board snapshot when
  // the CLI edit and board read happen within the same clock millisecond.
  /* eslint-disable no-restricted-globals -- Parse supplied values and derive a revision timestamp; do not read the clock. */
  const nextTime =
    Date.parse(time) <= Date.parse(action.updated_at)
      ? new Date(Date.parse(action.updated_at) + 1).toISOString()
      : time;
  /* eslint-enable no-restricted-globals */
  const edited = {
    ...action,
    title,
    state,
    owner: { url: ownerUrl },
    updated_at: nextTime,
  };
  delete edited.waiting_for;
  delete edited.description;
  if (reason !== undefined) edited.waiting_for = reason;
  if (description !== undefined) edited.description = description;
  return edited;
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
    state: validateStateRequest({
      state: input.state ?? 'open',
      waitingFor: input.waitingFor,
    }),
    ...(input.waitingFor === undefined
      ? {}
      : { waiting_for: input.waitingFor }),
    owner: { url: owner },
    ...(input.description === undefined
      ? {}
      : { description: input.description }),
    created_at: time,
    updated_at: time,
  };
}
