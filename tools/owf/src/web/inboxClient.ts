import {
  inboxResponse,
  workspaceIdentityResponse,
  inboxItemResponse,
  inboxConsumedResponse,
  boardError,
} from '../contracts/index.js';
import { StateUpdateError } from './client.js';

export async function fetchWorkspaceIdentity() {
  const response = await fetch('/api/workspace', { cache: 'no-store' });
  if (!response.ok) throw new Error('Workspace identity is unavailable.');
  return workspaceIdentityResponse.parse(await response.json()).workspace.root;
}

export async function fetchInbox() {
  const response = await fetch('/api/inbox', { cache: 'no-store' });
  const body: unknown = await response.json();
  if (!response.ok) {
    const parsed = boardError.safeParse(body);
    throw new Error(
      parsed.success ? parsed.data.error.message : 'Unable to read Inbox.',
    );
  }
  return inboxResponse.parse(body);
}

export async function writeInbox(
  operation: 'capture' | 'save' | 'resolve' | 'discard',
  text: string,
  id?: string,
) {
  const suffix =
    operation === 'capture'
      ? ''
      : `/${encodeURIComponent(id!)}${operation === 'save' ? '' : `/${operation}`}`;
  let response: Response;
  let body: unknown;
  try {
    response = await fetch(`/api/inbox${suffix}`, {
      method: operation === 'save' ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        operation === 'capture' || operation === 'save' ? { text } : {},
      ),
    });
    body = await response.json();
    if (response.ok) {
      if (operation === 'capture' || operation === 'save') {
        const saved = inboxItemResponse.parse(body).item;
        if (operation === 'save' && saved.id !== id)
          throw new Error('Unexpected Inbox Item');
        return saved;
      }
      const consumed = inboxConsumedResponse.parse(body);
      if (
        consumed.id !== id ||
        consumed.status !== (operation === 'resolve' ? 'resolved' : 'discarded')
      )
        throw new Error('Unexpected consumption result');
      return undefined;
    }
  } catch {
    throw new StateUpdateError(
      'Inbox write outcome is unknown. Refresh and inspect Inbox before deliberately trying again.',
      'UNCERTAIN',
    );
  }
  const parsed = boardError.safeParse(body);
  if (parsed.success && parsed.data.error.code === 'INBOX_OPERATION_FAILED') {
    throw new StateUpdateError(
      'Inbox write outcome is unknown. Refresh and inspect Inbox before deliberately trying again.',
      'UNCERTAIN',
    );
  }
  throw new StateUpdateError(
    parsed.success
      ? parsed.data.error.message
      : 'Inbox write outcome is unknown. Refresh and inspect Inbox.',
    parsed.success ? parsed.data.error.code : 'UNCERTAIN',
  );
}
