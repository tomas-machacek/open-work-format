import { DatabaseSync } from 'node:sqlite';
import { renameSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import {
  initialize,
  createAction,
  setAction,
  listActions,
} from '../../src/bootstrap/workspaces.js';
import { serve } from '../../src/bootstrap/server.js';
import { createBoardServer } from '../../src/interfaces/http/index.js';
import { boardResponse, boardError } from '../../src/contracts/index.js';
import { cleanup, snapshot, temporaryDirectory } from '../support/workspace.js';
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(cleanup));
function directory() {
  const root = temporaryDirectory();
  roots.push(root);
  return root;
}
test('HTTP returns complete ordered records, rejects writes, preserves files and reports store loss', async () => {
  const root = directory();
  const workspace = initialize(root, 'Local work');
  const server = createBoardServer(
    () => listActions(root),
    resolve('dist/web'),
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
    ).toBe(404);
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
