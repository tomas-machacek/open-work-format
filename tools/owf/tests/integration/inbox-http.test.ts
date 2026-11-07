import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, test } from 'vitest';
import { serve } from '../../src/bootstrap/server.js';
import {
  initialize,
  getInbox,
  listInbox,
  createView,
  createAction,
} from '../../src/bootstrap/workspaces.js';
import { inboxResponse, inboxItemResponse } from '../../src/contracts/index.js';
import { cleanup, temporaryDirectory } from '../support/workspace.js';
import { semanticSnapshot } from '../support/store-snapshot.js';

const roots: string[] = [];
const servers: Awaited<ReturnType<typeof serve>>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  roots.splice(0).forEach(cleanup);
});
async function setup() {
  const root = temporaryDirectory();
  roots.push(root);
  const { store } = initialize(root, 'HTTP Inbox');
  const server = await serve(root, 0);
  servers.push(server);
  const address = server.server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  const headers = {
    host: `127.0.0.1:${address.port}`,
    origin: `http://127.0.0.1:${address.port}`,
    'content-type': 'application/json',
  };
  const write = (
    url: string,
    payload: unknown = {},
    method: 'POST' | 'PATCH' = 'POST',
    extra = {},
  ) =>
    server.inject({
      url,
      method,
      headers: { ...headers, ...extra },
      payload: JSON.stringify(payload),
    });
  return { root, store, server, headers, write };
}

test('Inbox HTTP round-trips literal text and uses shared atomic operations independently of broken View definitions', async () => {
  const { root, store, server, write } = await setup();
  expect((await server.inject('/api/workspace')).json()).toEqual({
    workspace: { root },
  });
  mkdirSync(join(root, '_views'));
  const file = join(root, '_views', 'board.md');
  const definition =
    '---\ntype: OWF View Definition\ntitle: Board\nowf:\n  renderer: kanban\n  columns: []\n---\n# Board\n';
  writeFileSync(file, definition);
  const view = createView(root, {
    title: 'Broken later',
    definition: '/_views/board.md',
  }).result.view;
  writeFileSync(file, 'broken');
  expect((await server.inject(`/api/views/${view.id}`)).statusCode).toBe(503);
  const text = '  Život 🧭\r\nhttps://example.com/?a=1&b=2\n[plain](x)\t ';
  const capture = await write('/api/inbox', { text });
  expect(capture.statusCode).toBe(201);
  const item = inboxItemResponse.parse(capture.json()).item;
  expect(item.text).toBe(text);
  expect(
    inboxItemResponse.parse(
      (await server.inject(`/api/inbox/${item.id}`)).json(),
    ).item,
  ).toEqual(item);
  const second = inboxItemResponse.parse(
    (await write('/api/inbox', { text: 'Second' })).json(),
  ).item;
  const edit = await write(
    `/api/inbox/${item.id}`,
    { text: '\tChanged\n' },
    'PATCH',
  );
  expect(inboxItemResponse.parse(edit.json()).item).toEqual({
    ...item,
    text: '\tChanged\n',
  });
  expect(
    inboxResponse
      .parse((await server.inject('/api/inbox')).json())
      .items.map((item) => item.id),
  ).toEqual([item.id, second.id]);
  // Ordinary operations do not imply Inbox consumption.
  writeFileSync(file, definition);
  createAction(root, { title: 'Independent processing' });
  writeFileSync(file, 'broken again');
  expect(listInbox(root).result.items).toHaveLength(2);
  expect((await write(`/api/inbox/${item.id}/resolve`)).json()).toEqual({
    id: item.id,
    status: 'resolved',
  });
  expect((await write(`/api/inbox/${second.id}/discard`)).json()).toEqual({
    id: second.id,
    status: 'discarded',
  });
  expect(
    inboxResponse.parse((await server.inject('/api/inbox')).json()).items,
  ).toEqual([]);
  const db = new DatabaseSync(store, { readOnly: true });
  try {
    expect(
      db
        .prepare('SELECT kind FROM inbox_events ORDER BY event_id')
        .all()
        .map((row) => row.kind),
    ).toEqual([
      'inbox.captured',
      'inbox.captured',
      'inbox.updated',
      'inbox.resolved',
      'inbox.discarded',
    ]);
  } finally {
    db.close();
  }
  expect((await write(`/api/inbox/${item.id}/resolve`)).statusCode).toBe(404);
  expect((await server.inject(`/api/inbox/${item.id}`)).statusCode).toBe(404);
  expect(
    (
      await write(
        `/api/inbox/${item.id}`,
        { text: 'Already consumed' },
        'PATCH',
      )
    ).statusCode,
  ).toBe(404);
});

test('strict Inbox payloads, loopback writes, invalid IDs and storage failures preserve all data and events', async () => {
  const { root, store, server, headers, write } = await setup();
  const item = inboxItemResponse.parse(
    (await write('/api/inbox', { text: 'Keep' })).json(),
  ).item;
  const before = semanticSnapshot(root, store);
  for (const payload of [
    { text: '' },
    { text: ' \n\t' },
    { text: 4 },
    { text: 'x', extra: true },
    {},
    [],
  ]) {
    expect((await write('/api/inbox', payload)).statusCode).toBe(400);
    expect(
      (await write(`/api/inbox/${item.id}`, payload, 'PATCH')).statusCode,
    ).toBe(400);
  }
  for (const operation of ['resolve', 'discard']) {
    expect(
      (
        await write(`/api/inbox/${item.id}/${operation}`, {
          text: 'not accepted',
        })
      ).statusCode,
    ).toBe(400);
    expect((await write(`/api/inbox/not-a-uuid/${operation}`)).statusCode).toBe(
      400,
    );
    expect(
      (
        await write(
          `/api/inbox/00000000-0000-4000-8000-000000000001/${operation}`,
        )
      ).statusCode,
    ).toBe(404);
  }
  for (const extra of [
    { origin: 'https://outside.example' },
    { host: 'outside.example' },
    { 'sec-fetch-site': 'cross-site' },
  ])
    expect(
      (await write('/api/inbox', { text: 'x' }, 'POST', extra)).statusCode,
    ).toBe(403);
  expect(
    (
      await write('/api/inbox', { text: 'x' }, 'POST', {
        'content-type': 'text/plain',
      })
    ).statusCode,
  ).toBe(415);
  expect(
    (
      await server.inject({
        method: 'POST',
        url: '/api/inbox',
        headers,
        payload: '{',
      })
    ).statusCode,
  ).toBe(400);
  expect(semanticSnapshot(root, store)).toEqual(before);
  const db = new DatabaseSync(store);
  try {
    db.exec(
      "CREATE TRIGGER fail_inbox_event BEFORE INSERT ON inbox_events BEGIN SELECT RAISE(ABORT, 'test failure'); END",
    );
  } finally {
    db.close();
  }
  const guarded = semanticSnapshot(root, store);
  for (const [url, payload, method] of [
    ['/api/inbox', { text: 'Fail capture' }, 'POST'],
    [`/api/inbox/${item.id}`, { text: 'Fail save' }, 'PATCH'],
    [`/api/inbox/${item.id}/resolve`, {}, 'POST'],
    [`/api/inbox/${item.id}/discard`, {}, 'POST'],
  ] as const) {
    expect((await write(url, payload, method)).statusCode).toBe(503);
    expect(semanticSnapshot(root, store)).toEqual(guarded);
  }
  expect(getInbox(root, item.id).result.item).toEqual(item);
});
