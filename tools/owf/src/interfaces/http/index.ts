import Fastify, {
  type FastifyError,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import staticFiles from '@fastify/static';
import type { AvailableOwner } from '../../application/owners/index.js';
import type {
  DisplayViewResult,
  MoveActionResult,
  ListViewsResult,
} from '../../application/views/index.js';
import type {
  ListActionsResult,
  ActionResult,
  DeleteActionResult,
} from '../../application/actions/index.js';
import { WorkspaceError } from '../../application/workspaces/index.js';
import type {
  InboxResult,
  ListInboxResult,
  ConsumeInboxResult,
} from '../../application/inbox/index.js';
import {
  inboxTextRequest,
  workspaceIdentityResponse,
  inboxConsumeRequest,
  inboxResponse,
  inboxItemResponse,
  inboxConsumedResponse,
  viewCreateRequest,
  type ViewCreateRequest,
  deleteActionResponse,
  viewMoveRequest,
  viewMoveResponse,
  type ViewMoveRequest,
  boardResponse,
  viewsResponse,
  viewResponse,
  boardQuery,
  type BoardQuery,
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
  read: (query: BoardQuery) => ListActionsResult,
  assets: string,
  create: (input: CreateActionRequest) => ActionResult,
  update?: (id: string, input: UpdateActionStateRequest) => ActionResult,
  edit?: (id: string, input: EditActionRequest) => ActionResult,
  owners?: () => { owners: AvailableOwner[] },
  views?: {
    create?: (id: string, input: ViewCreateRequest) => ActionResult;
    move?: (id: string, input: ViewMoveRequest) => MoveActionResult;
    list: () => ListViewsResult;
    display: (id: string) => DisplayViewResult;
  },
  remove?: (id: string) => DeleteActionResult,
  inbox?: {
    root: string;
    list: () => ListInboxResult;
    get: (id: string) => InboxResult;
    capture: (text: string) => InboxResult;
    set: (id: string, text: string) => InboxResult;
    consume: (
      id: string,
      outcome: 'resolved' | 'discarded',
    ) => ConsumeInboxResult;
  },
) {
  const server = Fastify({ logger: false });
  server.get('/api/views', (_request, reply) => {
    try {
      if (!views) throw new Error('View inventory is unavailable.');
      return viewsResponse.parse({ views: views.list().result.views });
    } catch (error) {
      return viewError(error, reply);
    }
  });
  server.get<{ Params: { id: string } }>('/api/views/:id', (request, reply) => {
    try {
      if (!views) throw new Error('View evaluation is unavailable.');
      const { root, view, columns, blocked_column, creation_definition } =
        views.display(request.params.id);
      return viewResponse.parse({
        workspace: { root },
        view,
        columns,
        blocked_column,
        creation_definition,
      });
    } catch (error) {
      return viewError(error, reply);
    }
  });
  function viewError(error: unknown, reply: FastifyReply) {
    const code =
      error instanceof WorkspaceError ? error.code : 'VIEW_READ_FAILED';
    return reply.code(code === 'VIEW_NOT_FOUND' ? 404 : 503).send({
      error: {
        code,
        message:
          error instanceof Error ? error.message : 'Unable to read Views.',
      },
    });
  }
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
            : _request.url.startsWith('/api/inbox')
              ? 'INBOX_OPERATION_FAILED'
              : _request.method === 'PATCH'
                ? 'ACTION_UPDATE_FAILED'
                : 'ACTION_CREATE_FAILED',
        message:
          status < 500
            ? 'Send a valid JSON request.'
            : _request.url.startsWith('/api/inbox')
              ? 'Inbox write could not be confirmed.'
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
          message: 'Make changes from this local Workspace only.',
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
  server.post<{ Params: { id: string } }>(
    '/api/views/:id/moves',
    { onRequest: trustedWrite },
    (request, reply) => {
      const parsed = viewMoveRequest.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({
          error: {
            code: 'INVALID_REQUEST',
            message:
              'Supply Action, column, optional positive position and nonblank reason only.',
          },
        });
      try {
        if (!views?.move) throw new Error('View movement is unavailable.');
        return viewMoveResponse.parse(
          views.move(request.params.id, parsed.data).result,
        );
      } catch (error) {
        const code =
          error instanceof WorkspaceError ? error.code : 'VIEW_MOVE_FAILED';
        return reply
          .code(
            code.endsWith('_NOT_FOUND')
              ? 404
              : code === 'INVALID_ARGUMENT'
                ? 400
                : code === 'ACTION_BLOCKED'
                  ? 409
                  : 503,
          )
          .send({
            error: {
              code,
              message:
                error instanceof Error
                  ? error.message
                  : 'Unable to move Action.',
            },
          });
      }
    },
  );
  function mutationError(error: unknown, reply: FastifyReply) {
    const code =
      error instanceof WorkspaceError ? error.code : 'ACTION_WRITE_FAILED';
    return reply
      .code(
        code.endsWith('_NOT_FOUND')
          ? 404
          : ['ACTION_IN_USE', 'VIEW_CONFLICT'].includes(code)
            ? 409
            : code.startsWith('INVALID_')
              ? 400
              : 503,
      )
      .send({
        error: {
          code,
          message:
            error instanceof WorkspaceError
              ? error.message
              : 'Unable to write Action. Check the Workspace store.',
        },
      });
  }
  server.post<{ Params: { id: string } }>(
    '/api/views/:id/actions',
    { onRequest: trustedWrite },
    (request, reply) => {
      const parsed = viewCreateRequest.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({
          error: {
            code: 'INVALID_REQUEST',
            message:
              'Supply Action fields, column and expected_definition only.',
          },
        });
      try {
        if (!views?.create) throw new Error('Creation unavailable');
        return reply.code(201).send(
          createActionResponse.parse({
            action: views.create(request.params.id, parsed.data).result.action,
          }),
        );
      } catch (error) {
        return mutationError(error, reply);
      }
    },
  );
  server.delete<{ Params: { id: string } }>(
    '/api/actions/:id',
    { onRequest: trustedWrite },
    (request, reply) => {
      if (
        !request.body ||
        typeof request.body !== 'object' ||
        Array.isArray(request.body) ||
        Object.keys(request.body).length
      )
        return reply.code(400).send({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Supply an empty JSON object.',
          },
        });
      try {
        if (!remove) throw new Error('Deletion unavailable');
        const { id, status } = remove(request.params.id).result;
        return deleteActionResponse.parse({ id, status });
      } catch (error) {
        return mutationError(error, reply);
      }
    },
  );
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
          message:
            (clientError ||
              (error instanceof WorkspaceError &&
                [
                  'INVALID_VIEW_DEFINITION',
                  'INVALID_VIEW_REFERENCE',
                  'INVALID_VIEW_PLACEMENT',
                  'INVALID_VIEW_ORDER',
                  'VIEW_READ_FAILED',
                ].includes(error.code))) &&
            error instanceof Error
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
            : ['ACTION_CONFLICT', 'ACTION_BLOCKED'].includes(code)
              ? 409
              : code === 'INVALID_ARGUMENT'
                ? 400
                : 503;
        return reply.code(status).send({
          error: {
            code,
            message:
              (status < 500 ||
                [
                  'INVALID_VIEW_DEFINITION',
                  'INVALID_VIEW_REFERENCE',
                  'INVALID_VIEW_PLACEMENT',
                  'INVALID_VIEW_ORDER',
                  'VIEW_READ_FAILED',
                ].includes(code)) &&
              error instanceof Error
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
            : ['ACTION_CONFLICT', 'ACTION_BLOCKED'].includes(code)
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
              (status < 500 ||
                [
                  'INVALID_VIEW_DEFINITION',
                  'INVALID_VIEW_REFERENCE',
                  'INVALID_VIEW_PLACEMENT',
                  'INVALID_VIEW_ORDER',
                  'VIEW_READ_FAILED',
                ].includes(code)) &&
              error instanceof Error
                ? error.message
                : 'Unable to update Action. Check the Workspace store and try again.',
          },
        });
      }
    },
  );
  server.get('/api/actions', (request, reply) => {
    const parameters = new URL(request.url, 'http://127.0.0.1').searchParams;
    const repeated = [...parameters.keys()].some(
      (key) => parameters.getAll(key).length > 1,
    );
    const parsed = boardQuery.safeParse(Object.fromEntries(parameters));
    if (repeated || !parsed.success)
      return reply.code(400).send({
        error: {
          code: 'INVALID_ARGUMENT',
          message:
            'Supply search, owner and recursive (true or false) once each only.',
        },
      });
    try {
      const { result } = read(parsed.data);
      return boardResponse.parse({
        workspace: { root: result.root },
        actions: result.actions,
      });
    } catch (error) {
      const invalid =
        error instanceof WorkspaceError &&
        ['INVALID_ARGUMENT', 'INVALID_OWNER', 'OWNER_REQUIRED'].includes(
          error.code,
        );
      return reply.code(invalid ? 400 : 503).send({
        error: {
          code:
            error instanceof WorkspaceError ? error.code : 'ACTION_READ_FAILED',
          message:
            error instanceof Error ? error.message : 'Unable to read Actions.',
        },
      });
    }
  });
  function inboxError(error: unknown, reply: FastifyReply) {
    const code =
      error instanceof WorkspaceError ? error.code : 'INBOX_OPERATION_FAILED';
    return reply
      .code(
        code === 'INBOX_NOT_FOUND'
          ? 404
          : code === 'INVALID_ARGUMENT'
            ? 400
            : 503,
      )
      .send({
        error: {
          code,
          message:
            error instanceof WorkspaceError
              ? error.message
              : 'Unable to access Inbox. Check the Workspace store.',
        },
      });
  }
  server.get('/api/workspace', (_request, reply) => {
    if (!inbox)
      return inboxError(new Error('Workspace identity unavailable'), reply);
    return workspaceIdentityResponse.parse({ workspace: { root: inbox.root } });
  });
  server.get('/api/inbox', (_request, reply) => {
    try {
      if (!inbox) throw new Error('Inbox unavailable');
      const { root, items } = inbox.list().result;
      return inboxResponse.parse({ workspace: { root }, items });
    } catch (error) {
      return inboxError(error, reply);
    }
  });
  server.get<{ Params: { id: string } }>('/api/inbox/:id', (request, reply) => {
    try {
      if (!inbox) throw new Error('Inbox unavailable');
      return inboxItemResponse.parse({
        item: inbox.get(request.params.id).result.item,
      });
    } catch (error) {
      return inboxError(error, reply);
    }
  });
  for (const method of ['POST', 'PATCH'] as const) {
    server.route<{ Params: { id: string } }>({
      method,
      url: method === 'POST' ? '/api/inbox' : '/api/inbox/:id',
      onRequest: trustedWrite,
      handler: (request, reply) => {
        const parsed = inboxTextRequest.safeParse(request.body);
        if (!parsed.success)
          return reply.code(400).send({
            error: { code: 'INVALID_REQUEST', message: 'Supply text only.' },
          });
        try {
          if (!inbox) throw new Error('Inbox unavailable');
          const saved =
            method === 'POST'
              ? inbox.capture(parsed.data.text)
              : inbox.set(request.params.id, parsed.data.text);
          return reply
            .code(method === 'POST' ? 201 : 200)
            .send(inboxItemResponse.parse({ item: saved.result.item }));
        } catch (error) {
          return inboxError(error, reply);
        }
      },
    });
  }
  for (const outcome of ['resolved', 'discarded'] as const) {
    server.post<{ Params: { id: string } }>(
      `/api/inbox/:id/${outcome === 'resolved' ? 'resolve' : 'discard'}`,
      { onRequest: trustedWrite },
      (request, reply) => {
        if (!inboxConsumeRequest.safeParse(request.body).success)
          return reply.code(400).send({
            error: {
              code: 'INVALID_REQUEST',
              message: 'Supply an empty JSON object.',
            },
          });
        try {
          if (!inbox) throw new Error('Inbox unavailable');
          return inboxConsumedResponse.parse(
            inbox.consume(request.params.id, outcome).result,
          );
        } catch (error) {
          return inboxError(error, reply);
        }
      },
    );
  }
  server.register(staticFiles, { root: assets, index: 'index.html' });
  return server;
}
