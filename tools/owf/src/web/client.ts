import {
  boardResponse,
  createActionResponse,
  type CreateActionRequest,
  type BoardAction,
  boardError,
  type BoardResponse,
  updateActionStateResponse,
  type UpdateActionStateRequest,
  editActionResponse,
  type EditActionRequest,
} from '../contracts/index.js';
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
export async function fetchBoard(): Promise<BoardResponse> {
  const response = await fetch('/api/actions', { cache: 'no-store' });
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
