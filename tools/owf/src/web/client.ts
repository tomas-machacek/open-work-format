import {
  deleteActionResponse,
  type ViewCreateRequest,
  viewMoveResponse,
  type ViewMoveRequest,
  boardResponse,
  viewsResponse,
  viewResponse,
  ownersResponse,
  createActionResponse,
  type CreateActionRequest,
  type BoardAction,
  boardError,
  type BoardResponse,
  type BoardQuery,
  updateActionStateResponse,
  type UpdateActionStateRequest,
  editActionResponse,
  type EditActionRequest,
} from '../contracts/index.js';

async function readViewResource(path: string): Promise<unknown> {
  const response = await fetch(path, { cache: 'no-store' });
  const body: unknown = await response.json();
  if (!response.ok) {
    const parsed = boardError.safeParse(body);
    throw new Error(
      parsed.success ? parsed.data.error.message : 'Unable to read Views.',
    );
  }
  return body;
}
export async function fetchViews() {
  return viewsResponse.parse(await readViewResource('/api/views')).views;
}
export async function fetchView(id: string) {
  const result = viewResponse.parse(
    await readViewResource(`/api/views/${encodeURIComponent(id)}`),
  );
  if (result.view.id !== id)
    throw new Error('The server returned a different View instance.');
  return result;
}
export async function fetchOwners() {
  const response = await fetch('/api/owners', { cache: 'no-store' });
  const body: unknown = await response.json();
  if (!response.ok) {
    const parsed = boardError.safeParse(body);
    throw new Error(
      parsed.success ? parsed.data.error.message : 'Unable to read owners.',
    );
  }
  return ownersResponse.parse(body).owners;
}
export class StateUpdateError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}
export async function editBoardAction(
  id: string,
  input: EditActionRequest,
): Promise<BoardAction> {
  let response: Response;
  let body: unknown;
  try {
    response = await fetch(`/api/actions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    body = await response.json();
    if (response.ok) return editActionResponse.parse(body).action;
  } catch {
    throw new StateUpdateError(
      'Save could not be confirmed. Refresh and inspect the current Action before trying again.',
      'UNCERTAIN',
    );
  }
  const parsed = boardError.safeParse(body);
  if (!parsed.success)
    throw new StateUpdateError(
      'Save could not be confirmed. Refresh and inspect the current Action before trying again.',
      'UNCERTAIN',
    );
  throw new StateUpdateError(parsed.data.error.message, parsed.data.error.code);
}
export async function updateActionState(
  id: string,
  input: UpdateActionStateRequest,
): Promise<BoardAction> {
  let response: Response;
  let body: unknown;
  try {
    response = await fetch(`/api/actions/${encodeURIComponent(id)}/state`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    body = await response.json();
    if (response.ok) return updateActionStateResponse.parse(body).action;
  } catch {
    throw new StateUpdateError(
      'Move could not be confirmed. Refresh and check the board before trying again.',
      'UNCERTAIN',
    );
  }
  const parsed = boardError.safeParse(body);
  if (!parsed.success)
    throw new StateUpdateError(
      'Move could not be confirmed. Refresh and check the board before trying again.',
      'UNCERTAIN',
    );
  throw new StateUpdateError(parsed.data.error.message, parsed.data.error.code);
}
export async function fetchBoard(
  query: BoardQuery = {},
): Promise<BoardResponse> {
  const parameters = new URLSearchParams();
  if (query.search !== undefined) parameters.set('search', query.search);
  if (query.owner !== undefined) parameters.set('owner', query.owner);
  if (query.recursive !== undefined)
    parameters.set('recursive', String(query.recursive));
  const suffix = parameters.size ? `?${parameters.toString()}` : '';
  const response = await fetch(`/api/actions${suffix}`, { cache: 'no-store' });
  const body: unknown = await response.json();
  if (!response.ok) {
    const parsed = boardError.safeParse(body);
    throw new Error(
      parsed.success ? parsed.data.error.message : 'Unable to read Actions.',
    );
  }
  return boardResponse.parse(body);
}

export async function saveAction(
  input: CreateActionRequest,
): Promise<BoardAction> {
  let response: Response;
  let body: unknown;
  try {
    response = await fetch('/api/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    body = await response.json();
    if (response.ok) return createActionResponse.parse(body).action;
  } catch {
    throw new Error(
      'Save could not be confirmed. Refresh and check the board before submitting again.',
    );
  }
  const parsed = boardError.safeParse(body);
  throw new Error(
    parsed.success
      ? parsed.data.error.message
      : 'Save could not be confirmed. Refresh and check the board before submitting again.',
  );
}

export async function moveViewAction(view: string, input: ViewMoveRequest) {
  let response: Response;
  let body: unknown;
  try {
    response = await fetch(`/api/views/${encodeURIComponent(view)}/moves`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    body = await response.json();
    if (response.ok) return viewMoveResponse.parse(body);
  } catch {
    throw new StateUpdateError(
      'Move outcome is unknown. Refresh before trying again; do not resend automatically.',
      'UNCERTAIN',
    );
  }
  const parsed = boardError.safeParse(body);
  throw new StateUpdateError(
    parsed.success
      ? parsed.data.error.message
      : 'Move outcome is unknown. Refresh before trying again.',
    parsed.success ? parsed.data.error.code : 'UNCERTAIN',
  );
}

async function actionMutation(
  path: string,
  method: string,
  input: unknown,
  deletion = false,
): Promise<BoardAction | undefined> {
  let response: Response;
  let body: unknown;
  try {
    response = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    body = await response.json();
    if (response.ok) {
      if (deletion) {
        deleteActionResponse.parse(body);
        return;
      }
      return createActionResponse.parse(body).action;
    }
  } catch {
    throw new StateUpdateError(
      'Write could not be confirmed. Refresh and check before deliberately trying again. Do not resend automatically.',
      'UNCERTAIN',
    );
  }
  const parsed = boardError.safeParse(body);
  throw new StateUpdateError(
    parsed.success
      ? parsed.data.error.message
      : 'Write could not be confirmed. Refresh before trying again.',
    parsed.success ? parsed.data.error.code : 'UNCERTAIN',
  );
}
export async function createViewAction(
  id: string,
  input: ViewCreateRequest,
): Promise<BoardAction> {
  const action = (await actionMutation(
    `/api/views/${encodeURIComponent(id)}/actions`,
    'POST',
    input,
  ))!;
  window.dispatchEvent(
    new CustomEvent('owf-action-created', { detail: action }),
  );
  return action;
}
export async function deleteBoardAction(id: string): Promise<void> {
  await actionMutation(
    `/api/actions/${encodeURIComponent(id)}`,
    'DELETE',
    {},
    true,
  );
  window.dispatchEvent(new CustomEvent('owf-action-deleted', { detail: id }));
}
