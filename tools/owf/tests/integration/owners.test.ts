import {
  mkdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import {
  initialize,
  create,
  contextPorts,
  listOwners,
  createAction,
  listActions,
  setAction,
  getAction,
} from '../../src/bootstrap/workspaces.js';
import { listOwners as discover } from '../../src/application/owners/index.js';
import {
  ownerFiles,
  contextFiles,
} from '../../src/infrastructure/configuration/index.js';
import { createBoardServer } from '../../src/interfaces/http/index.js';
import { ownersResponse, boardError } from '../../src/contracts/index.js';
import { cleanup, snapshot, temporaryDirectory } from '../support/workspace.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(cleanup));
function workspace() {
  const root = temporaryDirectory();
  roots.push(root);
  initialize(root, 'My workspace');
  return root;
}
function project(root: string, title = 'Launch') {
  return create(root, { type: 'project', title }).result;
}
function outcome(root: string, owner: string, title = 'Ready') {
  return create(root, { type: 'outcome', title, owner }).result;
}
function metadata(path: string, change: (text: string) => string) {
  const readme = join(path, 'README.md');
  writeFileSync(readme, change(readFileSync(readme, 'utf8')));
}

test('discovery uses physical containment and metadata, canonical URLs and stable ordering without reading the store or writing', () => {
  const root = workspace();
  const launch = project(root);
  const other = project(root, 'Another');
  outcome(root, launch.url);
  outcome(root, other.url);
  const nested = outcome(root, `${launch.url}ready/`, 'Nested');
  renameSync(nested.path, join(launch.path, 'ready', 'Ž 100%'));
  mkdirSync(join(launch.path, 'notes'));
  writeFileSync(join(launch.path, 'notes', 'README.md'), '# Notes');
  mkdirSync(join(launch.path, 'knowledge'));
  writeFileSync(
    join(launch.path, 'knowledge', 'README.md'),
    '---\ntype: OWF Knowledge\ntitle: Info\n---',
  );
  writeFileSync(join(root, 'index.md'), '- [False owner](_projects/missing/)');
  renameSync(join(root, '_store'), join(root, '_store-away'));
  const before = snapshot(root);
  const result = discover(root, {
    ...contextPorts,
    ownerFiles,
    store: {
      ...contextPorts.store,
      validate() {
        throw new Error('Store must not be read');
      },
    },
  });
  expect(result.owners.map((owner) => owner.url)).toEqual([
    '/',
    other.url,
    launch.url,
    `${launch.url}ready/%C5%BD%20100%25/`,
    `${other.url}ready/`,
    `${launch.url}ready/`,
  ]);
  expect(result.owners.find((owner) => owner.title === 'Nested')).toMatchObject(
    {
      type: 'outcome',
      hierarchy: 'My workspace / Launch / Ready',
    },
  );
  expect(
    result.owners
      .filter((owner) => owner.title === 'Ready')
      .map((owner) => owner.hierarchy),
  ).toEqual(['My workspace / Another', 'My workspace / Launch']);
  expect(snapshot(root)).toEqual(before);
});

test('active and parked owners are offered; terminal and archived contexts prune their descendants', () => {
  const root = workspace();
  const active = project(root);
  const parked = outcome(root, active.url, 'Parked');
  metadata(parked.path, (text) =>
    text.replace('state: active', 'state: parked\n  parking_reason: Later'),
  );
  for (const state of ['completed', 'abandoned', 'archived']) {
    const parent = project(root, state);
    outcome(root, parent.url);
    metadata(parent.path, (text) =>
      text.replace(
        'state: active',
        `state: ${state}${state === 'archived' ? '\n  archived_from: completed' : ''}`,
      ),
    );
  }
  const terminal = outcome(root, active.url, 'Done');
  outcome(root, terminal.url, 'Hidden');
  metadata(terminal.path, (text) =>
    text.replace('state: active', 'state: achieved'),
  );
  const archived = project(root, 'Moved');
  renameSync(archived.path, join(root, '_projects', '_archive'));
  expect(listOwners(root).owners.map((owner) => owner.url)).toEqual([
    '/',
    active.url,
    parked.url,
  ]);
});

test.each([
  [
    'invalid archive',
    '---\ntype: OWF Project\ntitle: Bad\nowf: {state: archived}\n---',
  ],
  [
    'unexpected archived_from',
    '---\ntype: OWF Project\ntitle: Bad\nowf: {state: active, archived_from: completed}\n---',
  ],
  ['invalid YAML', '---\ntype: OWF Project\ntitle: [\n---'],
  ['missing title', '---\ntype: OWF Project\nowf: {state: active}\n---'],
  [
    'wrong location',
    '---\ntype: OWF Outcome\ntitle: Wrong\nowf: {state: active}\n---\n## Expected Result\nResult',
  ],
  [
    'invalid lifecycle',
    '---\ntype: OWF Project\ntitle: Bad\nowf: {state: unknown}\n---',
  ],
  [
    'invalid parked',
    '---\ntype: OWF Project\ntitle: Bad\nowf: {state: parked}\n---',
  ],
])('claimed owner with %s fails the entire discovery', (_label, text) => {
  const root = workspace();
  project(root, 'Valid');
  const invalid = project(root, 'Invalid');
  writeFileSync(join(invalid.path, 'README.md'), text);
  expect(() => listOwners(root)).toThrow(
    expect.objectContaining({ code: 'OWNER_DISCOVERY_FAILED' }),
  );
});

test('unreadable metadata and failed enumeration do not become empty or partial lists', () => {
  const root = workspace();
  project(root);
  for (const ports of [
    {
      ...contextPorts,
      ownerFiles: {
        children() {
          throw new Error('EACCES');
        },
      },
    },
    {
      ...contextPorts,
      ownerFiles,
      contexts: {
        ...contextFiles,
        readOwner(path: string) {
          if (path !== root) throw new Error('EACCES');
          return contextFiles.readOwner(path);
        },
      },
    },
  ])
    expect(() => discover(root, ports)).toThrow(
      /Unable to read owners: EACCES/u,
    );
});

test('directory junctions, linked README entries and traversal are rejected without following them', () => {
  const root = workspace();
  const outside = workspace();
  const parent = project(root);
  const link = join(parent.path, 'linked');
  symlinkSync(outside, link, 'junction');
  try {
    expect(() => listOwners(root)).toThrow(/Linked entry is unsafe/u);
  } finally {
    unlinkSync(link);
  }
  const readme = join(parent.path, 'README.md');
  renameSync(readme, `${readme}.original`);
  symlinkSync(outside, readme, 'junction');
  try {
    expect(() => listOwners(root)).toThrow(/Cannot read owner metadata/u);
  } finally {
    unlinkSync(readme);
  }
  expect(() => ownerFiles.children(root, ['..'])).toThrow(
    /Invalid directory segment/u,
  );
  symlinkSync(outside, join(root, '_projects-link'), 'junction');
  renameSync(join(root, '_projects'), join(root, '_projects-original'));
  renameSync(join(root, '_projects-link'), join(root, '_projects'));
  try {
    expect(() => listOwners(root)).toThrow(/physical directories/u);
  } finally {
    unlinkSync(join(root, '_projects'));
  }
});

test('HTTP serves Workspace-only and current owners with no-store; stale selections fail atomically and unchanged missing owners remain editable', async () => {
  const root = workspace();
  const server = createBoardServer(
    () => listActions(root),
    resolve('dist/web'),
    (input) => createAction(root, input),
    undefined,
    (id, { expected, ...changes }) => setAction(root, id, changes, expected),
    () => listOwners(root),
  );
  const headers = {
    host: '127.0.0.1:4317',
    origin: 'http://127.0.0.1:4317',
    'content-type': 'application/json',
  };
  try {
    const empty = await server.inject('/api/owners');
    expect(empty.statusCode).toBe(200);
    expect(empty.headers['cache-control']).toBe('no-store');
    expect(ownersResponse.parse(empty.json()).owners).toEqual([
      {
        url: '/',
        title: 'My workspace',
        type: 'workspace',
        hierarchy: 'Workspace',
      },
    ]);
    const parent = project(root);
    const action = createAction(root, { title: 'Existing' }).result.action;
    const owned = createAction(root, { title: 'Old owner', owner: parent.url })
      .result.action;
    expect(
      ownersResponse
        .parse((await server.inject('/api/owners')).json())
        .owners.map((owner) => owner.url),
    ).toContain(parent.url);
    metadata(parent.path, (text) =>
      text.replace('state: active', 'state: completed'),
    );
    const before = snapshot(root);
    const failedCreate = await server.inject({
      method: 'POST',
      url: '/api/actions',
      headers,
      payload: { title: 'Stale', state: 'open', owner: parent.url },
    });
    expect(failedCreate.statusCode).toBe(400);
    const expected = {
      title: action.title,
      state: action.state,
      owner: action.owner,
      updated_at: action.updated_at,
    };
    const failedEdit = await server.inject({
      method: 'PATCH',
      url: `/api/actions/${action.id}`,
      headers,
      payload: { owner: parent.url, title: 'Also changed', expected },
    });
    expect(failedEdit.statusCode).toBe(400);
    expect(boardError.parse(failedEdit.json()).error.code).toBe(
      'INVALID_OWNER',
    );
    expect(snapshot(root)).toEqual(before);
    renameSync(parent.path, `${parent.path}-missing`);
    const oldExpected = {
      title: owned.title,
      state: owned.state,
      owner: owned.owner,
      updated_at: owned.updated_at,
    };
    expect(
      (
        await server.inject({
          method: 'PATCH',
          url: `/api/actions/${owned.id}`,
          headers,
          payload: { title: 'Still editable', expected: oldExpected },
        })
      ).statusCode,
    ).toBe(200);
    expect(getAction(root, owned.id).result.action).toMatchObject({
      title: 'Still editable',
      owner: owned.owner,
    });
    writeFileSync(
      join(`${parent.path}-missing`, 'README.md'),
      '---\ntype: OWF Project\n---',
    );
    const failure = await server.inject('/api/owners');
    expect(failure.statusCode).toBe(503);
    expect(failure.headers['cache-control']).toBe('no-store');
    expect(boardError.parse(failure.json()).error.code).toBe(
      'OWNER_DISCOVERY_FAILED',
    );
    expect(failure.json()).not.toHaveProperty('owners');
  } finally {
    await server.close();
  }
});
