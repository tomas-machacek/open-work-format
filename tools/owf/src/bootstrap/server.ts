import { fileURLToPath } from 'node:url';
import { createBoardServer } from '../interfaces/http/index.js';
import {
  listActions,
  createAction,
  setAction,
  listOwners,
} from './workspaces.js';

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
  );
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
