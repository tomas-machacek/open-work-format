import Fastify, { type FastifyError } from 'fastify';
import staticFiles from '@fastify/static';
import type {
  ListActionsResult,
  ActionResult,
} from '../../application/actions/index.js';
import { WorkspaceError } from '../../application/workspaces/index.js';
import {
  boardResponse,
  createActionRequest,
  createActionResponse,
  type CreateActionRequest,
} from '../../contracts/index.js';

export function createBoardServer(
  read: () => ListActionsResult,
  assets: string,
  create: (input: CreateActionRequest) => ActionResult,
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
  server.setErrorHandler<FastifyError>((error, _request, reply) => {
    const status =
      error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    return reply.code(status).send({
      error: {
        code: status < 500 ? 'INVALID_REQUEST' : 'ACTION_CREATE_FAILED',
        message:
          status < 500
            ? 'Send a valid JSON Action request.'
            : 'Unable to save Action.',
      },
    });
  });
  server.post(
    '/api/actions',
    {
      onRequest: async (request, reply) => {
        const address = server.server.address();
        const port =
          address && typeof address !== 'string' ? address.port : 4317;
        const origin = new URL(`http://127.0.0.1:${port}`);
        if (
          request.headers.host !== origin.host ||
          request.headers.origin !== origin.origin ||
          (request.headers['sec-fetch-site'] !== undefined &&
            request.headers['sec-fetch-site'] !== 'same-origin')
        ) {
          return reply.code(403).send({
            error: {
              code: 'ORIGIN_REJECTED',
              message: 'Create Actions from this local board only.',
            },
          });
        }
        if (
          request.headers['content-type']
            ?.split(';')[0]
            ?.trim()
            .toLowerCase() !== 'application/json'
        ) {
          return reply.code(415).send({
            error: {
              code: 'JSON_REQUIRED',
              message: 'An application/json request is required.',
            },
          });
        }
      },
    },
    (request, reply) => {
      const parsed = createActionRequest.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({
          error: {
            code: 'INVALID_REQUEST',
            message:
              'Supply title, owner and state, with optional description and waitingFor only.',
          },
        });
      try {
        const { result } = create(parsed.data);
        return reply
          .code(201)
          .send(createActionResponse.parse({ action: result.action }));
      } catch (error) {
        const clientError =
          error instanceof WorkspaceError &&
          [
            'INVALID_ARGUMENT',
            'INVALID_TITLE',
            'INVALID_OWNER',
            'OWNER_REQUIRED',
          ].includes(error.code);
        return reply.code(clientError ? 400 : 503).send({
          error: {
            code:
              error instanceof WorkspaceError
                ? error.code
                : 'ACTION_CREATE_FAILED',
            message: clientError
              ? error.message
              : 'Unable to save Action. Check the Workspace store and try again.',
          },
        });
      }
    },
  );
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
