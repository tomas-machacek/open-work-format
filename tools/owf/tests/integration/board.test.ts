import { DatabaseSync } from 'node:sqlite';
import { renameSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import {
  initialize,
  create,
  getAction,
  createAction,
  setAction,
  listActions,
} from '../../src/bootstrap/workspaces.js';
import { serve } from '../../src/bootstrap/server.js';
import { createBoardServer } from '../../src/interfaces/http/index.js';
import {
  boardResponse,
  boardError,
  createActionResponse,
  type CreateActionRequest,
} from '../../src/contracts/index.js';
import { cleanup, snapshot, temporaryDirectory } from '../support/workspace.js';
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(cleanup));
function directory() {
  const root = temporaryDirectory();
  roots.push(root);
  return root;
}
test('HTTP returns complete ordered records, rejects untrusted writes, preserves files and reports store loss', async () => {
  const root = directory();
  const workspace = initialize(root, 'Local work');
  const server = createBoardServer(
    () => listActions(root),
    resolve('dist/web'),
    (input) => createAction(root, input),
  );
  try {
    const empty = boardResponse.parse(
      (await server.inject('/api/actions')).json(),
    );
    expect(empty.actions).toEqual([]);
    const action = createAction(root, {
      title: '<script>literal</script>',
      description: 'Details',
    }).result.action;
    setAction(root, action.id, { state: 'waiting', waitingFor: 'Reply' });
    const before = snapshot(root);
    const response = await server.inject('/api/actions');
    expect(response.statusCode).toBe(200);
    expect(boardResponse.parse(response.json()).actions).toEqual(
      listActions(root).result.actions,
    );
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/actions',
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    await server.inject('/api/actions');
    expect(snapshot(root)).toEqual(before);
    renameSync(workspace.store, `${workspace.store}.away`);
    const failed = await server.inject('/api/actions');
    expect(failed.statusCode).toBe(503);
    expect(boardError.parse(failed.json()).error.code).toBeTruthy();
    expect(existsSync(workspace.store)).toBe(false);
    renameSync(`${workspace.store}.away`, workspace.store);
    expect((await server.inject('/api/actions')).statusCode).toBe(200);
  } finally {
    await server.close();
  }
});
test('startup rejects non-Workspaces and missing stores without writes; occupied port is clear', async () => {
  const root = directory();
  await expect(serve(root, 0)).rejects.toThrow('Workspace');
  expect(snapshot(root)).toEqual({});
  const workspace = initialize(root);
  const first = await serve(root, 0);
  try {
    const address = first.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing TCP address');
    await expect(serve(root, address.port)).rejects.toThrow('occupied');
  } finally {
    await first.close();
  }
  renameSync(workspace.store, `${workspace.store}.away`);
  const before = snapshot(root);
  await expect(serve(root, 0)).rejects.toThrow();
  expect(snapshot(root)).toEqual(before);
  renameSync(`${workspace.store}.away`, workspace.store);
  const db = new DatabaseSync(workspace.store);
  try {
    db.exec(
      "UPDATE owf_metadata SET value = '999' WHERE key = 'schema_version'",
    );
  } finally {
    db.close();
  }
  const unsupported = snapshot(root);
  await expect(serve(root, 0)).rejects.toThrow('Unsupported store schema');
  expect(snapshot(root)).toEqual(unsupported);
});

const trustedHeaders = {
  host: '127.0.0.1:4317',
  origin: 'http://127.0.0.1:4317',
  'content-type': 'application/json',
};
const input = {
  title: 'Wait for review',
  owner: '/',
  state: 'waiting',
  waitingFor: '  Reply\nplease  ',
  description: '**Context**',
};

test('POST persists the accepted Action and exactly one creation event', async () => {
  const root = directory();
  const { store } = initialize(root);
  create(root, { type: 'project', title: 'Launch', slug: 'launch' });
  const write = vi.fn((input: CreateActionRequest) =>
    createAction(root, input),
  );
  const server = createBoardServer(
    () => listActions(root),
    resolve('dist/web'),
    write,
  );
  try {
    const response = await server.inject({
      method: 'POST',
      url: '/api/actions',
      headers: trustedHeaders,
      payload: { ...input, owner: '/_projects/launch/' },
    });
    expect(response.statusCode).toBe(201);
    const { action } = createActionResponse.parse(response.json());
    expect(write).toHaveBeenCalledTimes(1);
    expect(action).toMatchObject({
      title: input.title,
      state: 'waiting',
      waiting_for: input.waitingFor,
      description: input.description,
      owner: { url: '/_projects/launch/' },
    });
    expect(getAction(root, action.id).result.action).toEqual(action);
    expect(listActions(root).result.actions).toEqual([action]);
    const db = new DatabaseSync(store);
    try {
      expect(
        db
          .prepare(
            'SELECT kind, action_id, old_state, new_state, new_waiting_for FROM action_events',
          )
          .all(),
      ).toEqual([
        {
          kind: 'action.created',
          action_id: action.id,
          old_state: null,
          new_state: 'waiting',
          new_waiting_for: input.waitingFor,
        },
      ]);
    } finally {
      db.close();
    }
  } finally {
    await server.close();
  }
});

test('POST rejects untrusted origins, hosts and non-JSON before invoking creation, without writes', async () => {
  const root = directory();
  initialize(root);
  const write = vi.fn((input: CreateActionRequest) =>
    createAction(root, input),
  );
  const server = createBoardServer(
    () => listActions(root),
    resolve('dist/web'),
    write,
  );
  const before = snapshot(root);
  try {
    for (const headers of [
      { ...trustedHeaders, origin: 'https://foreign.example' },
      { ...trustedHeaders, origin: 'null' },
      { ...trustedHeaders, origin: '' },
      {
        ...trustedHeaders,
        host: 'attacker.example:4317',
        origin: 'http://attacker.example:4317',
      },
      { ...trustedHeaders, origin: 'http://127.0.0.1:9999' },
      { ...trustedHeaders, 'sec-fetch-site': 'cross-site' },
      { ...trustedHeaders, 'content-type': 'text/plain' },
      {
        ...trustedHeaders,
        'content-type': 'application/x-www-form-urlencoded',
      },
    ]) {
      const response = await server.inject({
        method: 'POST',
        url: '/api/actions',
        headers,
        payload: JSON.stringify(input),
      });
      expect([403, 415]).toContain(response.statusCode);
      expect(boardError.parse(response.json()).error.code).toMatch(
        /ORIGIN_REJECTED|JSON_REQUIRED/,
      );
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(snapshot(root)).toEqual(before);
    }
    expect(write).not.toHaveBeenCalled();
  } finally {
    await server.close();
  }
});

test('POST reports malformed input and business validation as client errors without changes', async () => {
  const root = directory();
  initialize(root);
  const server = createBoardServer(
    () => listActions(root),
    resolve('dist/web'),
    (input) => createAction(root, input),
  );
  const before = snapshot(root);
  try {
    for (const payload of [
      '{',
      'null',
      JSON.stringify({ ...input, unknown: true }),
      JSON.stringify({ title: 'Missing fields' }),
      ...[
        { title: ' ' },
        { owner: '/missing/' },
        { state: 'archived' },
        { state: 'open' },
        { waitingFor: ' ' },
      ].map((change) => JSON.stringify({ ...input, ...change })),
    ]) {
      const response = await server.inject({
        method: 'POST',
        url: '/api/actions',
        headers: trustedHeaders,
        payload,
      });
      expect(response.statusCode).toBe(400);
      expect(boardError.parse(response.json()).error.code).toMatch(/^INVALID_/);
      expect(snapshot(root)).toEqual(before);
    }
  } finally {
    await server.close();
  }
});

test.each(['actions', 'action_events'])(
  'POST rolls back a failed %s write and hides SQL details',
  async (table) => {
    const root = directory();
    const { store } = initialize(root);
    const db = new DatabaseSync(store);
    db.exec(
      `CREATE TRIGGER fail_create BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'private SQL details'); END`,
    );
    db.close();
    const before = snapshot(root);
    const server = createBoardServer(
      () => listActions(root),
      resolve('dist/web'),
      (input) => createAction(root, input),
    );
    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/actions',
        headers: trustedHeaders,
        payload: input,
      });
      expect(response.statusCode).toBe(503);
      expect(boardError.parse(response.json()).error.code).toBe(
        'ACTION_CREATE_FAILED',
      );
      expect(response.body).not.toContain('private SQL');
      expect(snapshot(root)).toEqual(before);
    } finally {
      await server.close();
    }
  },
);

test('write origin uses the actual configured listening port and lost storage remains unavailable', async () => {
  const root = directory();
  const { store } = initialize(root);
  const server = await serve(root, 0);
  try {
    const address = server.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing address');
    expect(address.address).toBe('127.0.0.1');
    const headers = {
      ...trustedHeaders,
      host: `127.0.0.1:${address.port}`,
      origin: `http://127.0.0.1:${address.port}`,
    };
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/actions',
          headers,
          payload: input,
        })
      ).statusCode,
    ).toBe(201);
    renameSync(store, `${store}.away`);
    const before = snapshot(root);
    const response = await server.inject({
      method: 'POST',
      url: '/api/actions',
      headers,
      payload: input,
    });
    expect(response.statusCode).toBe(503);
    expect(boardError.parse(response.json()).error.code).toBe(
      'STORE_UNAVAILABLE',
    );
    expect(snapshot(root)).toEqual(before);
  } finally {
    await server.close();
  }
});

test('default HTTP port uses canonical browser origin and Host without :80', async () => {
  const root = directory();
  initialize(root);
  const server = createBoardServer(
    () => listActions(root),
    resolve('dist/web'),
    (input) => createAction(root, input),
  );
  const address = vi
    .spyOn(server.server, 'address')
    .mockReturnValue({ address: '127.0.0.1', family: 'IPv4', port: 80 });
  try {
    const response = await server.inject({
      method: 'POST',
      url: '/api/actions',
      headers: {
        ...trustedHeaders,
        host: '127.0.0.1',
        origin: 'http://127.0.0.1',
      },
      payload: input,
    });
    expect(response.statusCode).toBe(201);
  } finally {
    address.mockRestore();
    await server.close();
  }
});
