import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, test, vi } from 'vitest';
import { serve } from '../../src/bootstrap/server.js';
import {
  initialize,
  createAction,
  createView,
  showView,
  listViews,
  getAction,
  setAction,
  viewPorts,
  actionPorts,
} from '../../src/bootstrap/workspaces.js';
import { displayView } from '../../src/application/views/index.js';
import { viewResponse, viewsResponse } from '../../src/contracts/index.js';
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
  const { store } = initialize(root, 'Web Views');
  mkdirSync(join(root, '_views'));
  const file = join(root, '_views', 'board.md');
  copyFileSync(
    new URL('../../docs/examples/work-board.md', import.meta.url),
    file,
  );
  const view = createView(root, {
    title: 'Instance title',
    definition: '/_views/board.md',
  }).result.view;
  const server = await serve(root, 0);
  servers.push(server);
  const read = () => server.inject(`/api/views/${view.id}`);
  return { root, store, file, view, server, read };
}

test('HTTP uses the CLI evaluator order and complete facts from one repository read; reads preserve all semantic data', async () => {
  const { root, store, view, server, read } = await setup();
  const a = createAction(root, {
    title: 'Z first',
    description: 'Full detail',
    state: 'waiting',
    waitingFor: 'Reply',
  }).result.action;
  const b = createAction(root, { title: 'A second' }).result.action;
  setAction(root, a.id, { addDependency: [b.id], manualBlock: 'Reason' });
  createAction(root, { title: 'Omitted', state: 'cancelled' });
  createView(root, { title: view.title, definition: '/_views/board.md' });
  const before = semanticSnapshot(root, store);
  const list = vi.fn(actionPorts.actions.list.bind(actionPorts.actions));
  const projection = displayView(root, view.id, {
    ...viewPorts,
    actions: { ...actionPorts.actions, list },
  });
  expect(list).toHaveBeenCalledTimes(1);
  const response = await read();
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  const web = viewResponse.parse(response.json());
  expect(web.columns).toEqual(projection.columns);
  expect(web.view).toEqual(view);
  expect(
    web.columns.map((column) => ({
      ...column,
      members: column.members.map((member) => ({
        id: member.id,
        title: member.title,
        state: member.state,
        blocked: member.blocking.blocked,
      })),
    })),
  ).toEqual(showView(root, view.id).result.columns);
  expect(
    web.columns
      .flatMap((column) => column.members)
      .find((member) => member.id === a.id),
  ).toEqual(getAction(root, a.id).result.action);
  expect(
    viewsResponse.parse((await server.inject('/api/views')).json()).views,
  ).toEqual(listViews(root).result.views);
  expect(semanticSnapshot(root, store)).toEqual(before);
});

test('HTTP distinguishes broken/missing definitions, unknown instances and malformed omitted Actions from empty success without writes', async () => {
  const { root, store, file, server, read } = await setup();
  const valid = readFileSync(file, 'utf8');
  const failure = async () => {
    const before = semanticSnapshot(root, store);
    expect((await read()).statusCode).toBe(503);
    expect(semanticSnapshot(root, store)).toEqual(before);
  };
  writeFileSync(file, 'Broken');
  await failure();
  expect((await server.inject('/api/views')).statusCode).toBe(200);
  expect((await server.inject('/api/actions')).statusCode).toBe(200);
  unlinkSync(file);
  await failure();
  writeFileSync(file, valid);
  expect((await server.inject('/api/views/missing')).statusCode).toBe(404);
  const omitted = createAction(root, { title: 'Excluded', state: 'cancelled' })
    .result.action;
  const db = new DatabaseSync(store);
  db.prepare('UPDATE actions SET owner_url = ? WHERE id = ?').run(
    'broken',
    omitted.id,
  );
  db.close();
  await failure();
});

test('existing HTTP edits reroute blocks, can exclude an Action and never apply column defaults', async () => {
  const { root, file, view, server, read } = await setup();
  const action = createAction(root, {
    title: 'Waiting',
    state: 'waiting',
    waitingFor: 'Reply',
  }).result.action;
  const address = server.server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  const edit = async (changes: Record<string, unknown>) => {
    const current = getAction(root, action.id).result.action;
    const response = await server.inject({
      method: 'PATCH',
      url: `/api/actions/${action.id}`,
      headers: {
        host: `127.0.0.1:${address.port}`,
        origin: `http://127.0.0.1:${address.port}`,
        'content-type': 'application/json',
      },
      payload: {
        expected: {
          title: current.title,
          owner: current.owner,
          state: current.state,
          waiting_for: current.waiting_for,
          updated_at: current.updated_at,
        },
        ...changes,
      },
    });
    expect(response.statusCode).toBe(200);
    return viewResponse.parse((await read()).json());
  };
  let web = await edit({ manualBlock: 'Blocked by supplier' });
  expect(
    web.columns.find((column) => column.id === 'blocked')?.members[0]?.id,
  ).toBe(action.id);
  web = await edit({ clearManualBlock: true });
  expect(
    web.columns.find((column) => column.id === 'active')?.members[0]?.state,
  ).toBe('waiting');
  writeFileSync(
    file,
    '---\ntype: OWF View Definition\ntitle: Only blocked\nowf:\n  renderer: kanban\n  columns:\n    - id: blocked\n      title: Blocked\n      type: blocked\n---\n# Only blocked\n',
  );
  await edit({ manualBlock: 'Again' });
  web = await edit({ clearManualBlock: true });
  expect(web.columns[0]?.members).toEqual([]);
  expect(getAction(root, action.id).result.action.state).toBe('waiting');
  writeFileSync(
    file,
    '---\ntype: OWF View Definition\ntitle: Empty\nowf:\n  renderer: kanban\n  columns: []\n---\n# Empty\n',
  );
  expect(viewResponse.parse((await read()).json()).columns).toEqual([]);
  expect(view.id).toBe(web.view.id);
});
