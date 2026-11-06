import { WorkspaceError } from '../workspaces/index.js';

export interface InboxItem {
  id: string;
  captured_at: string;
  text: string;
}

export function inboxText(text: string): string {
  if (typeof text !== 'string' || text.trim().length === 0)
    throw new WorkspaceError(
      'INVALID_ARGUMENT',
      'Inbox text must be nonblank.',
    );
  return text;
}

export function inboxId(id: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(id)
  )
    throw new WorkspaceError('INVALID_ARGUMENT', 'Supply an Inbox Item UUID.');
  return id.toLowerCase();
}

export function newInboxItem(
  text: string,
  id: string,
  time: string,
): InboxItem {
  return { id: inboxId(id), captured_at: time, text: inboxText(text) };
}

export function editInboxItem(item: InboxItem, text: string): InboxItem {
  return { ...item, text: inboxText(text) };
}
