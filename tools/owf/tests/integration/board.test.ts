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
  updateActionStateResponse,
  editActionResponse,
  type EditActionRequest,
  type UpdateActionStateRequest,
  type CreateActionRequest,
  type BoardQuery,
} from '../../src/contracts/index.js';
import { cleanup, snapshot, temporaryDirectory } from '../support/workspace.js';
const roots: string[] = [];
test('HTTP selection round trips literal values, uses shared AND selection and never changes the store', async () => {
  const root = directory();
  const { store } = initialize(root);
  const owner = '/_projects/a%20%26%25/';
  create(root, { type: 'project', title: 'Encoded context', slug: 'encoded' });
  renameSync(
    resolve(root, '_projects/encoded'),
    resolve(root, '_projects/a &%'),
  );
  const actualOwner = owner;
  const selected = createAction(root, {
    title: 'Plain title',
    description: 'literal a & b + %_ **č**',
    owner: actualOwner,
  }).result.action;
  const other = createAction(root, { title: 'Nonmatching' }).result.action;
  const read = vi.fn((query: BoardQuery) => listActions(root, query));
  const server = createBoardServer(read, resolve('dist/web'), (input) =>
    createAction(root, input),
  );
  try {
    const before = snapshot(root);
    const query = new URLSearchParams({
      search: 'a & b + %_ **č**',
      owner: actualOwner,
      recursive: 'true',
    });
    const response = await server.inject(`/api/actions?${query.toString()}`);
    expect(response.statusCode).toBe(200);
    expect(boardResponse.parse(response.json()).actions).toEqual([selected]);
    expect(read).toHaveBeenLastCalledWith({
      search: 'a & b + %_ **č**',
      owner: actualOwner,
      recursive: true,
    });
    const encoded = new URLSearchParams({ owner, search: 'none' });
    expect(
      (await server.inject(`/api/actions?${encoded.toString()}`)).statusCode,
    ).toBe(200);
    expect(read).toHaveBeenLastCalledWith({ owner, search: 'none' });
    expect(
      boardResponse.parse((await server.inject('/api/actions')).json()).actions,
    ).toEqual(listActions(root).result.actions);
    expect(
      boardResponse.parse(
        (await server.inject('/api/actions?search=absent')).json(),
      ).actions,
    ).toEqual([]);
    expect(snapshot(root)).toEqual(before);
    const db = new DatabaseSync(store);
    try {
      db.prepare('UPDATE actions SET title = ? WHERE id = ?').run(
        'Invalid\ntitle',
        other.id,
      );
    } finally {
      db.close();
    }
    const corrupt = snapshot(root);
    expect(
      (await server.inject(`/api/actions?${query.toString()}`)).statusCode,
    ).toBe(503);
    expect(snapshot(root)).toEqual(corrupt);
    renameSync(store, `${store}.away`);
    expect((await server.inject('/api/actions?search=absent')).statusCode).toBe(
      503,
    );
    expect(existsSync(store)).toBe(false);
  } finally {
    await server.close();
  }
});

test('HTTP rejects blank, invalid, repeated, unknown and malformed queries before opening an unavailable store', async () => {
  const root = directory();
  const { store } = initialize(root);
  renameSync(store, `${store}.away`);
  const server = createBoardServer(
    (query) => listActions(root, query),
    resolve('dist/web'),
    (input) => createAction(root, input),
  );
  try {
    const before = snapshot(root);
    for (const query of [
      'search=',
      'search=%20%20',
      'owner=',
      'owner=relative',
      'owner=/%ZZ/',
      'search=a&search=b',
      'owner=/&owner=/',
      'recursive=true&recursive=false',
      'recursive=1',
      'recursive=TRUE',
      'recursive=',
      'recursive=true',
      'state=open',
      'unexpected=x',
      '__proto__=x',
    ]) {
      const response = await server.inject(`/api/actions?${query}`);
      expect(response.statusCode, query).toBe(400);
      expect(boardError.parse(response.json()).error.code).toBeTruthy();
    }
    expect(
      (await server.inject('/api/actions?recursive=false')).statusCode,
    ).toBe(503);
    expect(snapshot(root)).toEqual(before);
    expect(existsSync(store)).toBe(false);
  } finally {
    await server.close();
  }
});
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

test('PATCH checks the observed snapshot in the transaction and emits only real changes', async () => {
  const root = directory();
  const { store } = initialize(root);
  const initial = createAction(root, { title: 'Move me' }).result.action;
  const write = vi.fn((id: string, request: UpdateActionStateRequest) =>
    setAction(root, id, { state: request.state }, request.expected),
  );
  const server = createBoardServer(
    () => listActions(root),
    resolve('dist/web'),
    (input) => createAction(root, input),
    write,
  );
  const request = (id: string, payload: unknown, headers = trustedHeaders) =>
    server.inject({
      method: 'PATCH',
      url: `/api/actions/${id}/state`,
      headers,
      payload: JSON.stringify(payload),
    });
  const expected = { state: initial.state, updated_at: initial.updated_at };
  try {
    const before = snapshot(root);
    for (const payload of [
      null,
      { state: 'waiting' },
      { state: 'bogus', expected },
      { state: 'waiting', expected, waitingFor: 'not allowed' },
      { state: 'waiting', expected: { ...expected, waiting_for: 'reason' } },
    ]) {
      const response = await request(initial.id, payload);
      expect(response.statusCode).toBe(400);
      expect(snapshot(root)).toEqual(before);
    }
    expect(write).not.toHaveBeenCalled();
    for (const headers of [
      { ...trustedHeaders, origin: 'http://foreign.example' },
      { ...trustedHeaders, host: 'foreign.example' },
      { ...trustedHeaders, 'content-type': 'text/plain' },
    ]) {
      const response = await request(
        initial.id,
        { state: 'waiting', expected },
        headers,
      );
      expect([403, 415]).toContain(response.statusCode);
      expect(snapshot(root)).toEqual(before);
    }
    const missing = await request('00000000-0000-4000-8000-000000000000', {
      state: 'waiting',
      expected,
    });
    expect(missing.statusCode).toBe(404);
    expect(boardError.parse(missing.json()).error.code).toBe(
      'ACTION_NOT_FOUND',
    );
    expect(snapshot(root)).toEqual(before);
    const changed = await request(initial.id, { state: 'waiting', expected });
    expect(changed.statusCode).toBe(200);
    const waiting = updateActionStateResponse.parse(changed.json());
    expect(waiting.status).toBe('updated');
    expect(waiting.action).toMatchObject({ id: initial.id, state: 'waiting' });
    expect(waiting.action.waiting_for).toBeUndefined();
    expect(getAction(root, initial.id).result.action).toEqual(waiting.action);
    const after = snapshot(root);
    const conflict = await request(initial.id, {
      state: 'completed',
      expected,
    });
    expect(conflict.statusCode).toBe(409);
    expect(boardError.parse(conflict.json()).error.code).toBe(
      'ACTION_CONFLICT',
    );
    expect(snapshot(root)).toEqual(after);
    const unchanged = await request(initial.id, {
      state: 'waiting',
      expected: {
        state: 'waiting',
        updated_at: waiting.action.updated_at,
      },
    });
    expect(updateActionStateResponse.parse(unchanged.json()).status).toBe(
      'unchanged',
    );
    expect(snapshot(root)).toEqual(after);
    setAction(root, initial.id, { state: 'waiting', waitingFor: 'CLI reply' });
    const reasonChanged = snapshot(root);
    const staleReason = await request(initial.id, {
      state: 'completed',
      expected: {
        state: 'waiting',
        updated_at: waiting.action.updated_at,
      },
    });
    expect(staleReason.statusCode).toBe(409);
    expect(snapshot(root)).toEqual(reasonChanged);
    const current = getAction(root, initial.id).result.action;
    const leave = await request(initial.id, {
      state: 'completed',
      expected: {
        state: current.state,
        updated_at: current.updated_at,
        waiting_for: current.waiting_for,
      },
    });
    expect(
      updateActionStateResponse.parse(leave.json()).action.waiting_for,
    ).toBeUndefined();
    const db = new DatabaseSync(store);
    try {
      expect(
        db
          .prepare(
            "SELECT kind FROM action_events WHERE kind = 'action.state_changed'",
          )
          .all(),
      ).toHaveLength(3);
    } finally {
      db.close();
    }
  } finally {
    await server.close();
  }
});

test('PATCH rolls back an event failure and hides storage details', async () => {
  const root = directory();
  const { store } = initialize(root);
  const action = createAction(root, { title: 'Rollback' }).result.action;
  const db = new DatabaseSync(store);
  db.exec(
    "CREATE TRIGGER fail_change BEFORE INSERT ON action_events WHEN NEW.kind = 'action.state_changed' BEGIN SELECT RAISE(ABORT, 'private SQL details'); END",
  );
  db.close();
  const before = snapshot(root);
  const server = createBoardServer(
    () => listActions(root),
    resolve('dist/web'),
    (input) => createAction(root, input),
    (id, input) => setAction(root, id, { state: input.state }, input.expected),
  );
  try {
    const response = await server.inject({
      method: 'PATCH',
      url: `/api/actions/${action.id}/state`,
      headers: trustedHeaders,
      payload: {
        state: 'completed',
        expected: { state: 'open', updated_at: action.updated_at },
      },
    });
    expect(response.statusCode).toBe(503);
    expect(boardError.parse(response.json()).error.code).toBe(
      'ACTION_UPDATE_FAILED',
    );
    expect(response.body).not.toContain('private SQL');
    expect(snapshot(root)).toEqual(before);
  } finally {
    await server.close();
  }
});

test('expected Waiting reason detects a conflict even when timestamps coincide', () => {
  const root = directory();
  const { store } = initialize(root);
  const action = createAction(root, {
    title: 'Await reply',
    state: 'waiting',
    waitingFor: 'First reply',
  }).result.action;
  const db = new DatabaseSync(store);
  try {
    // Simulate an external writer that commits a different reason with the
    // same timestamp resolution as the card snapshot.
    db.prepare('UPDATE actions SET waiting_for = ? WHERE id = ?').run(
      'New reply',
      action.id,
    );
  } finally {
    db.close();
  }
  const before = snapshot(root);
  expect(() =>
    setAction(
      root,
      action.id,
      { state: 'completed' },
      {
        state: action.state,
        updated_at: action.updated_at,
        waiting_for: action.waiting_for,
      },
    ),
  ).toThrow(/changed since it was displayed/);
  expect(snapshot(root)).toEqual(before);
  expect(getAction(root, action.id).result.action.waiting_for).toBe(
    'New reply',
  );
});

test('edit route saves combined fields once, preserves no-ops, and rejects stale content with equal timestamps', async () => {
  const root = directory();
  const { store } = initialize(root);
  create(root, { type: 'project', title: 'Launch', slug: 'launch' });
  const action = createAction(root, {
    title: 'Await',
    state: 'waiting',
    waitingFor: 'Old',
    description: 'Notes',
  }).result.action;
  const write = vi.fn((id: string, request: EditActionRequest) => {
    const { expected, ...changes } = request;
    return setAction(root, id, changes, expected);
  });
  const server = createBoardServer(
    () => listActions(root),
    resolve('dist/web'),
    (input) => createAction(root, input),
    undefined,
    write,
  );
  const expected = {
    title: action.title,
    description: action.description,
    owner: action.owner,
    state: action.state,
    waiting_for: action.waiting_for,
    updated_at: action.updated_at,
  };
  const request = (id: string, payload: unknown, headers = trustedHeaders) =>
    server.inject({
      method: 'PATCH',
      url: `/api/actions/${id}`,
      headers,
      payload: JSON.stringify(payload),
    });
  try {
    const before = snapshot(root);
    for (const payload of [
      null,
      { title: 'Missing snapshot' },
      { expected, state: 'completed', title: 'Illegal' },
      { expected, title: 'Changed', description: '', clearDescription: true },
      { expected, waitingFor: 'x', clearWaitingFor: true },
      { expected, title: 'X', extra: true },
    ]) {
      expect((await request(action.id, payload)).statusCode).toBe(400);
      expect(snapshot(root)).toEqual(before);
    }
    expect(write).not.toHaveBeenCalled();
    for (const headers of [
      { ...trustedHeaders, origin: 'https://foreign.example' },
      { ...trustedHeaders, 'content-type': 'text/plain' },
    ]) {
      expect([403, 415]).toContain(
        (await request(action.id, { expected, title: 'X' }, headers))
          .statusCode,
      );
      expect(snapshot(root)).toEqual(before);
    }
    expect(
      (
        await request('00000000-0000-4000-8000-000000000000', {
          expected,
          title: 'X',
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await request(action.id, { expected, owner: '/missing/' })).statusCode,
    ).toBe(400);
    expect(snapshot(root)).toEqual(before);
    const changed = editActionResponse.parse(
      (
        await request(action.id, {
          expected,
          title: 'Await reply',
          owner: '/_projects/launch/',
          clearDescription: true,
          clearWaitingFor: true,
        })
      ).json(),
    );
    expect(changed.status).toBe('updated');
    expect(changed.action).toMatchObject({
      title: 'Await reply',
      owner: { url: '/_projects/launch/' },
      state: 'waiting',
    });
    expect(changed.action.description).toBeUndefined();
    expect(changed.action.waiting_for).toBeUndefined();
    const db = new DatabaseSync(store);
    try {
      expect(
        db
          .prepare(
            "SELECT kind, old_owner_url, new_owner_url FROM action_events WHERE kind = 'action.updated'",
          )
          .all(),
      ).toEqual([
        {
          kind: 'action.updated',
          old_owner_url: '/',
          new_owner_url: '/_projects/launch/',
        },
      ]);
      const after = snapshot(root);
      const currentExpected = {
        title: changed.action.title,
        owner: changed.action.owner,
        state: changed.action.state,
        updated_at: changed.action.updated_at,
      };
      expect(
        editActionResponse.parse(
          (
            await request(action.id, {
              expected: currentExpected,
              title: changed.action.title,
            })
          ).json(),
        ).status,
      ).toBe('unchanged');
      expect(snapshot(root)).toEqual(after);
      for (const field of ['title', 'owner_url', 'description'] as const) {
        const value =
          field === 'owner_url'
            ? '/_projects/else/'
            : field === 'title'
              ? 'Other edit'
              : 'Other notes';
        db.prepare(`UPDATE actions SET ${field} = ? WHERE id = ?`).run(
          value,
          action.id,
        );
        const stale = snapshot(root);
        const response = await request(action.id, {
          expected: currentExpected,
          title: 'Overwrite',
        });
        expect(response.statusCode).toBe(409);
        expect(boardError.parse(response.json()).error.code).toBe(
          'ACTION_CONFLICT',
        );
        expect(snapshot(root)).toEqual(stale);
        db.prepare(`UPDATE actions SET ${field} = ? WHERE id = ?`).run(
          field === 'owner_url'
            ? changed.action.owner.url
            : field === 'title'
              ? changed.action.title
              : null,
          action.id,
        );
      }
    } finally {
      db.close();
    }
  } finally {
    await server.close();
  }
});

test('edit route rolls back a failed event insert and hides storage details', async () => {
  const root = directory();
  const { store } = initialize(root);
  const action = createAction(root, { title: 'Before' }).result.action;
  const db = new DatabaseSync(store);
  db.exec(
    "CREATE TRIGGER fail_edit BEFORE INSERT ON action_events WHEN NEW.kind = 'action.updated' BEGIN SELECT RAISE(ABORT, 'private SQL details'); END",
  );
  db.close();
  const before = snapshot(root);
  const server = createBoardServer(
    () => listActions(root),
    resolve('dist/web'),
    (input) => createAction(root, input),
    undefined,
    (id, request) => {
      const { expected, ...changes } = request;
      return setAction(root, id, changes, expected);
    },
  );
  try {
    const response = await server.inject({
      method: 'PATCH',
      url: `/api/actions/${action.id}`,
      headers: trustedHeaders,
      payload: {
        expected: {
          title: action.title,
          owner: action.owner,
          state: action.state,
          updated_at: action.updated_at,
        },
        title: 'After',
      },
    });
    expect(response.statusCode).toBe(503);
    expect(boardError.parse(response.json()).error.code).toBe(
      'ACTION_UPDATE_FAILED',
    );
    expect(response.body).not.toContain('private SQL details');
    expect(snapshot(root)).toEqual(before);
  } finally {
    await server.close();
  }
});
