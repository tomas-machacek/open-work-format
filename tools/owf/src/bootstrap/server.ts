import { fileURLToPath } from 'node:url';
import { createBoardServer } from '../interfaces/http/index.js';
import {
  listInbox,
  getInbox,
  captureInbox,
  setInbox,
  resolveInbox,
  discardInbox,
  workspacePorts,
  listActions,
  createAction,
  createActionInView,
  deleteAction,
  setAction,
  listOwners,
  listViews,
  displayView,
  moveAction,
} from './workspaces.js';
import { discoverWorkspace } from '../application/workspaces/index.js';

export async function serve(start: string, port = 4317) {
  const { result } = listActions(start);
  const server = createBoardServer(
    (query) => {
      const current = listActions(result.root, query);
      if (current.result.root !== result.root)
        throw new Error('The original Workspace is no longer available.');
      return current;
    },
    fileURLToPath(new URL('../../dist/web/', import.meta.url)),
    (input) => {
      if (listActions(result.root).result.root !== result.root)
        throw new Error('The original Workspace is no longer available.');
      return createAction(result.root, input);
    },
    (id, input) => {
      if (listActions(result.root).result.root !== result.root)
        throw new Error('The original Workspace is no longer available.');
      return setAction(result.root, id, { state: input.state }, input.expected);
    },
    (id, input) => {
      if (listActions(result.root).result.root !== result.root)
        throw new Error('The original Workspace is no longer available.');
      const { expected, ...changes } = input;
      return setAction(result.root, id, changes, expected);
    },
    () => {
      const current = listOwners(result.root);
      if (current.root !== result.root)
        throw new Error('The original Workspace is no longer available.');
      return current;
    },
    {
      create: (id, input) => {
        if (listActions(result.root).result.root !== result.root)
          throw new Error('The original Workspace is no longer available.');
        const { column, expected_definition, ...fields } = input;
        return createActionInView(result.root, fields, {
          view: id,
          column,
          expected_definition,
        });
      },
      move: (id, input) => {
        if (listActions(result.root).result.root !== result.root)
          throw new Error('The original Workspace is no longer available.');
        const { action, ...options } = input;
        return moveAction(result.root, action, { ...options, view: id });
      },
      list: () => {
        const current = listViews(result.root);
        if (current.result.root !== result.root)
          throw new Error('The original Workspace is no longer available.');
        return current;
      },
      display: (id) => {
        const current = displayView(result.root, id);
        if (current.root !== result.root)
          throw new Error('The original Workspace is no longer available.');
        return current;
      },
    },
    (id) => {
      if (listActions(result.root).result.root !== result.root)
        throw new Error('The original Workspace is no longer available.');
      return deleteAction(result.root, id);
    },
    {
      root: result.root,
      list: () => {
        checkInboxWorkspace();
        return listInbox(result.root);
      },
      get: (id) => {
        checkInboxWorkspace();
        return getInbox(result.root, id);
      },
      capture: (text) => {
        checkInboxWorkspace();
        return captureInbox(result.root, text);
      },
      set: (id, text) => {
        checkInboxWorkspace();
        return setInbox(result.root, id, text);
      },
      consume: (id, outcome) => {
        checkInboxWorkspace();
        return outcome === 'resolved'
          ? resolveInbox(result.root, id)
          : discardInbox(result.root, id);
      },
    },
  );
  function checkInboxWorkspace() {
    if (discoverWorkspace(result.root, workspacePorts)?.root !== result.root)
      throw new Error('The original Workspace is no longer available.');
  }
  try {
    await server.listen({ host: '127.0.0.1', port });
  } catch (error) {
    await server.close();
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'EADDRINUSE'
    )
      throw new Error(
        `Port ${port} is occupied. Stop the other server or use --port.`,
        { cause: error },
      );
    throw error;
  }
  return server;
}
