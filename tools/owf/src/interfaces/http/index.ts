import Fastify, {
  type FastifyError,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import staticFiles from '@fastify/static';
import type { AvailableOwner } from '../../application/owners/index.js';
import type {
  ListActionsResult,
  ActionResult,
} from '../../application/actions/index.js';
import { WorkspaceError } from '../../application/workspaces/index.js';
import {
  boardResponse,
  ownersResponse,
  createActionRequest,
  createActionResponse,
  type CreateActionRequest,
  updateActionStateRequest,
  updateActionStateResponse,
  type UpdateActionStateRequest,
  editActionRequest,
  editActionResponse,
  type EditActionRequest,
} from '../../contracts/index.js';

export function createBoardServer(
  read: () => ListActionsResult,
  assets: string,
  create: (input: CreateActionRequest) => ActionResult,
  update?: (id: string, input: UpdateActionStateRequest) => ActionResult,
  edit?: (id: string, input: EditActionRequest) => ActionResult,
  owners?: () => { owners: AvailableOwner[] },
) {
  const server = Fastify({ logger: false });
  server.get('/api/owners', (_request, reply) => {
    try {
      if (!owners) throw new Error('Owner discovery is unavailable.');
      return ownersResponse.parse(owners());
    } catch (error) {
      return reply.code(503).send({
        error: {
          code: 'OWNER_DISCOVERY_FAILED',
          message:
            error instanceof Error ? error.message : 'Unable to read owners.',
        },
      });
    }
  });
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
        code:
          status < 500
            ? 'INVALID_REQUEST'
            : _request.method === 'PATCH'
              ? 'ACTION_UPDATE_FAILED'
              : 'ACTION_CREATE_FAILED',
        message:
          status < 500
            ? 'Send a valid JSON Action request.'
            : 'Unable to save Action.',
      },
    });
  });
  function trustedWrite(request: FastifyRequest, reply: FastifyReply) {
    const address = server.server.address();
    const port = address && typeof address !== 'string' ? address.port : 4317;
    const origin = new URL(`http://127.0.0.1:${port}`);
    if (
      request.headers.host !== origin.host ||
      request.headers.origin !== origin.origin ||
      (request.headers['sec-fetch-site'] !== undefined &&
        request.headers['sec-fetch-site'] !== 'same-origin')
    ) {
      reply.code(403).send({
        error: {
          code: 'ORIGIN_REJECTED',
          message: 'Change Actions from this local board only.',
        },
      });
      return Promise.resolve();
    }
    if (
      request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !==
      'application/json'
    ) {
      reply.code(415).send({
        error: {
          code: 'JSON_REQUIRED',
          message: 'An application/json request is required.',
        },
      });
      return Promise.resolve();
    }
    return Promise.resolve();
  }
  server.post('/api/actions', { onRequest: trustedWrite }, (request, reply) => {
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
  });
  server.patch<{ Params: { id: string } }>(
    '/api/actions/:id/state',
    { onRequest: trustedWrite },
    (request, reply) => {
      const parsed = updateActionStateRequest.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Supply a valid state and expected Action snapshot only.',
          },
        });
      try {
        if (!update) throw new Error('State updates are unavailable.');
        const { result } = update(request.params.id, parsed.data);
        return updateActionStateResponse.parse({
          status: result.status,
          action: result.action,
        });
      } catch (error) {
        const code =
          error instanceof WorkspaceError ? error.code : 'ACTION_UPDATE_FAILED';
        const status =
          code === 'ACTION_NOT_FOUND'
            ? 404
            : code === 'ACTION_CONFLICT'
              ? 409
              : code === 'INVALID_ARGUMENT'
                ? 400
                : 503;
        return reply.code(status).send({
          error: {
            code,
            message:
              status < 500 && error instanceof Error
                ? error.message
                : 'Unable to update Action. Check the Workspace store and try again.',
          },
        });
      }
    },
  );
  server.patch<{ Params: { id: string } }>(
    '/api/actions/:id',
    { onRequest: trustedWrite },
    (request, reply) => {
      const parsed = editActionRequest.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({
          error: {
            code: 'INVALID_REQUEST',
            message:
              'Supply an expected Action snapshot and editable fields only.',
          },
        });
      try {
        if (!edit) throw new Error('Action editing is unavailable.');
        const { result } = edit(request.params.id, parsed.data);
        return editActionResponse.parse({
          status: result.status,
          action: result.action,
        });
      } catch (error) {
        const code =
          error instanceof WorkspaceError ? error.code : 'ACTION_UPDATE_FAILED';
        const status =
          code === 'ACTION_NOT_FOUND'
            ? 404
            : code === 'ACTION_CONFLICT'
              ? 409
              : [
                    'INVALID_ARGUMENT',
                    'INVALID_TITLE',
                    'INVALID_OWNER',
                    'OWNER_REQUIRED',
                  ].includes(code)
                ? 400
                : 503;
        return reply.code(status).send({
          error: {
            code,
            message:
              status < 500 && error instanceof Error
                ? error.message
                : 'Unable to update Action. Check the Workspace store and try again.',
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
