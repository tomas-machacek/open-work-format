import {
  newInboxItem,
  editInboxItem,
  inboxId,
  inboxText,
  type InboxItem,
} from '../../domain/inbox/index.js';
import { WorkspaceError } from '../../domain/workspaces/index.js';
import type { InboxPorts } from '../ports/index.js';
import { discoverWorkspace } from '../workspaces/index.js';

export type { InboxItem } from '../../domain/inbox/index.js';
export interface InboxResult {
  result: {
    status: 'captured' | 'found' | 'updated' | 'unchanged';
    type: 'inbox_item';
    root: string;
    item: InboxItem;
  };
  warnings: [];
}
export interface ListInboxResult {
  result: { status: 'listed'; type: 'inbox'; root: string; items: InboxItem[] };
  warnings: [];
}
export interface ConsumeInboxResult {
  result: {
    status: 'resolved' | 'discarded';
    type: 'inbox_item';
    root: string;
    id: string;
  };
  warnings: [];
}

function workspace(start: string, ports: InboxPorts) {
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
  item: InboxItem,
  status: InboxResult['result']['status'],
): InboxResult {
  return { result: { status, type: 'inbox_item', root, item }, warnings: [] };
}
export function captureInbox(
  start: string,
  text: string,
  ports: InboxPorts,
): InboxResult {
  inboxText(text);
  const found = workspace(start, ports);
  const item = newInboxItem(text, ports.newId(), ports.now());
  ports.inbox.capture(found.store, item);
  return result(found.root, item, 'captured');
}
export function getInbox(
  start: string,
  identifier: string,
  ports: InboxPorts,
): InboxResult {
  const id = inboxId(identifier);
  const found = workspace(start, ports);
  const item = ports.inbox.get(found.store, id);
  if (!item)
    throw new WorkspaceError(
      'INBOX_NOT_FOUND',
      'No Inbox Item with that ID exists in this Workspace.',
    );
  return result(found.root, item, 'found');
}
export function listInbox(start: string, ports: InboxPorts): ListInboxResult {
  const found = workspace(start, ports);
  return {
    result: {
      status: 'listed',
      type: 'inbox',
      root: found.root,
      items: ports.inbox.list(found.store),
    },
    warnings: [],
  };
}
export function setInbox(
  start: string,
  identifier: string,
  text: string,
  ports: InboxPorts,
): InboxResult {
  const id = inboxId(identifier);
  inboxText(text);
  const found = workspace(start, ports);
  const saved = ports.inbox.update(
    found.store,
    id,
    (item) => editInboxItem(item, text),
    ports.now(),
  );
  return result(
    found.root,
    saved.item,
    saved.changed ? 'updated' : 'unchanged',
  );
}
export function consumeInbox(
  start: string,
  identifier: string,
  outcome: 'resolved' | 'discarded',
  ports: InboxPorts,
): ConsumeInboxResult {
  const id = inboxId(identifier);
  const found = workspace(start, ports);
  ports.inbox.consume(found.store, id, outcome, ports.now());
  return {
    result: { status: outcome, type: 'inbox_item', root: found.root, id },
    warnings: [],
  };
}
