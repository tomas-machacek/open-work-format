import { fileURLToPath } from 'node:url';
import { createBoardServer } from '../interfaces/http/index.js';
import { listActions } from './workspaces.js';

export async function serve(start: string, port = 4317) {
  const { result } = listActions(start);
  const server = createBoardServer(
    () => {
      const current = listActions(result.root);
      if (current.result.root !== result.root)
        throw new Error('The original Workspace is no longer available.');
      return current;
    },
    fileURLToPath(new URL('../../dist/web/', import.meta.url)),
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
