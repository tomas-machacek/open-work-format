import Fastify from 'fastify';
import staticFiles from '@fastify/static';
import type { ListActionsResult } from '../../application/actions/index.js';
import { WorkspaceError } from '../../application/workspaces/index.js';
import { boardResponse } from '../../contracts/index.js';

export function createBoardServer(
  read: () => ListActionsResult,
  assets: string,
) {
  const server = Fastify({ logger: false });
  server.addHook('onRequest', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; style-src 'self'; frame-ancestors 'none'",
    );
  });
  server.get('/api/actions', (_request, reply) => {
    try {
      const { result } = read();
      return boardResponse.parse({
        workspace: { root: result.root },
        actions: result.actions,
      });
    } catch (error) {
      return reply.code(503).send({
        error: {
          code:
            error instanceof WorkspaceError ? error.code : 'ACTION_READ_FAILED',
          message:
            error instanceof Error ? error.message : 'Unable to read Actions.',
        },
      });
    }
  });
  server.register(staticFiles, { root: assets, index: 'index.html' });
  return server;
}
