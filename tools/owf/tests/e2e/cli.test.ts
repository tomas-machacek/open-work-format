import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { afterEach, expect, test } from 'vitest';
import { cleanup, snapshot, temporaryDirectory } from '../support/workspace.js';

const metadata = z
  .object({ version: z.string() })
  .parse(
    JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ),
  );
const cli = resolve('dist/bootstrap/cli.js');
const roots: string[] = [];
function run(root: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}
afterEach(() => {
  roots.splice(0).forEach(cleanup);
});
test('real processes initialize and rediscover immutable workspace in spaces/Unicode path', () => {
  const root = temporaryDirectory();
  roots.push(root);
  const first = run(root, ['init', '--title', 'Život práce', '--json']);
  expect(first.status).toBe(0);
  expect(JSON.parse(first.stdout)).toMatchObject({
    ok: true,
    result: { status: 'initialized', root, title: 'Život práce' },
  });
  const child = join(root, 'child');
  mkdirSync(child);
  const before = snapshot(root);
  const second = run(child, ['init', '--title', 'Different', '--json']);
  expect(second.status).toBe(0);
  expect(JSON.parse(second.stdout)).toMatchObject({
    ok: true,
    result: { status: 'already_initialized', root, title: 'Život práce' },
  });
  expect(snapshot(root)).toEqual(before);
});
test.each([
  [['init', '--title', ' ', '--json'], 'INVALID_TITLE'],
  [['init', '--unknown', '--json'], 'INVALID_ARGUMENT'],
  [['init', '--json', '--title'], 'INVALID_ARGUMENT'],
])('argument failure has one JSON envelope and exit 2', (args, code) => {
  const root = temporaryDirectory();
  roots.push(root);
  const result = run(root, args);
  expect(result.status).toBe(2);
  expect(JSON.parse(result.stdout)).toMatchObject({
    ok: false,
    error: { code },
  });
  expect(snapshot(root)).toEqual({});
});
test('help, version and human output run outside checkout', () => {
  const root = temporaryDirectory();
  roots.push(root);
  expect(run(root, ['--help']).stdout).toContain('init');
  expect(run(root, ['--version']).stdout.trim()).toBe(metadata.version);
  const result = run(root, ['init', '--title', 'Human']);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain(`Root: ${root}`);
  expect(result.stdout).toContain('Title: Human');
});

test('generated guide examples execute through the built CLI outside checkout', () => {
  const root = temporaryDirectory();
  roots.push(root);
  expect(run(root, ['init', '--title', 'Trial']).status).toBe(0);
  const guide = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  let cwd = root;
  let actionId = '';
  for (const line of guide.split('\n')) {
    if (line.startsWith('cd ')) {
      cwd = join(root, line.slice(3));
      continue;
    }
    if (!line.startsWith('owf ')) continue;
    const args = [...line.slice(4).matchAll(/"([^"]*)"|(\S+)/gu)].map((match) =>
      (match[1] ?? match[2] ?? '').replace('{id}', actionId),
    );
    const result = run(cwd, args);
    expect(result.status, result.stderr).toBe(0);
    if (args[0] === 'create' && args[1] === 'action' && args.includes('--json'))
      actionId = z
        .object({ result: z.object({ action: z.object({ id: z.string() }) }) })
        .parse(JSON.parse(result.stdout)).result.action.id;
  }
  expect(
    readFileSync(
      join(root, '_projects/kitchen/materials-selected/README.md'),
      'utf8',
    ),
  ).toContain('## Expected Result\n\nMaterials selected');
  for (const type of ['project', 'outcome'])
    expect(run(root, ['create', type, '--help']).stdout).toContain('--slug');
  expect(run(root, ['create', 'outcome', '--help']).stdout).toContain(
    '--expected-result',
  );
});

test.each([
  [['project', '--json'], 'INVALID_ARGUMENT', 2],
  [['project', '--title', ' ', '--json'], 'INVALID_TITLE', 2],
  [['project', '--title', 'X', '--slug', 'CON', '--json'], 'INVALID_SLUG', 2],
  [
    ['project', '--title', 'X', '--owner', '/', '--json'],
    'INVALID_ARGUMENT',
    2,
  ],
  [
    ['outcome', '--title', 'X', '--expected-result', ' ', '--json'],
    'INVALID_EXPECTED_RESULT',
    2,
  ],
  [
    ['outcome', '--title', 'X', '--owner', '/../', '--json'],
    'INVALID_ARGUMENT',
    2,
  ],
  [['outcome', '--title', 'X', '--json'], 'OWNER_REQUIRED', 1],
])('create failures emit one JSON envelope', (args, code, status) => {
  const root = temporaryDirectory();
  roots.push(root);
  run(root, ['init']);
  const before = snapshot(root);
  const result = run(root, ['create', ...args]);
  expect(result.status).toBe(status);
  expect(JSON.parse(result.stdout)).toMatchObject({
    ok: false,
    error: { code },
  });
  expect(snapshot(root)).toEqual(before);
});

test('flag-looking values do not activate JSON; explicit JSON still reports failures', () => {
  const root = temporaryDirectory();
  roots.push(root);
  for (const option of ['--title', '--slug', '--owner', '--expected-result']) {
    const result = run(root, ['create', 'outcome', option, '--json']);
    expect(result.stdout).toBe('');
    expect(result.status).not.toBe(0);
  }
  const result = run(root, [
    'create',
    'outcome',
    '--title',
    '--json',
    '--json',
  ]);
  expect(JSON.parse(result.stdout)).toMatchObject({
    ok: false,
    error: { code: 'WORKSPACE_NOT_FOUND' },
  });
});

test('explicit owner overrides cwd, conflicts exit 1, log warning succeeds in both output modes', () => {
  const root = temporaryDirectory();
  roots.push(root);
  run(root, ['init']);
  run(root, ['create', 'project', '--title', 'Kitchen']);
  run(root, ['create', 'project', '--title', 'Garden']);
  const args = [
    'create',
    'outcome',
    '--title',
    'Approved',
    '--owner',
    '/_projects/garden/',
    '--json',
  ];
  const result = run(join(root, '_projects/kitchen'), args);
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    ok: true,
    result: { owner: '/_projects/garden/', url: '/_projects/garden/approved/' },
    warnings: [],
  });
  const duplicate = run(root, args);
  expect(duplicate.status).toBe(1);
  expect(JSON.parse(duplicate.stdout)).toMatchObject({
    error: { code: 'PATH_CONFLICT' },
  });
  writeFileSync(join(root, 'log.md'), 'Do not overwrite');
  for (const json of [true, false]) {
    const warning = run(root, [
      'create',
      'project',
      '--title',
      json ? 'One' : 'Two',
      ...(json ? ['--json'] : []),
    ]);
    expect(warning.status).toBe(0);
    if (json)
      expect(JSON.parse(warning.stdout)).toMatchObject({
        ok: true,
        warnings: [{ code: 'LOG_WRITE_FAILED' }],
      });
    else expect(warning.stderr).toContain('LOG_WRITE_FAILED');
  }
  expect(readFileSync(join(root, 'log.md'), 'utf8')).toBe('Do not overwrite');
});

test('Action commands round trip across processes with complete envelopes, human fields and precise errors', () => {
  const root = temporaryDirectory();
  roots.push(root);
  expect(run(root, ['init']).status).toBe(0);
  const created = run(root, [
    'create',
    'action',
    '--title',
    'Call supplier',
    '--description',
    '',
    '--json',
  ]);
  expect(created.status).toBe(0);
  const saved = z
    .object({
      ok: z.literal(true),
      result: z.strictObject({
        status: z.literal('created'),
        type: z.literal('action'),
        root: z.literal(root),
        uri: z.string(),
        action: z.strictObject({
          id: z.uuidv4(),
          title: z.literal('Call supplier'),
          state: z.literal('open'),
          owner: z.strictObject({ url: z.literal('/') }),
          description: z.literal(''),
          created_at: z.iso.datetime(),
          updated_at: z.iso.datetime(),
        }),
      }),
      warnings: z.tuple([]),
    })
    .parse(JSON.parse(created.stdout));
  expect(saved.result.uri).toBe(`owf:action:${saved.result.action.id}`);
  expect(saved.result.action.id).toBe(saved.result.action.id.toLowerCase());
  expect(saved.result.action.updated_at).toBe(saved.result.action.created_at);
  const before = snapshot(root);
  const found = run(root, ['get', 'action', saved.result.uri, '--json']);
  expect(found.status).toBe(0);
  expect(JSON.parse(found.stdout)).toEqual({
    ok: true,
    result: { ...saved.result, status: 'found' },
    warnings: [],
  });
  const human = run(root, ['get', 'action', saved.result.action.id]);
  expect(human.status).toBe(0);
  for (const field of [
    'found action',
    'Title: Call supplier',
    `ID: ${saved.result.action.id}`,
    `URI: ${saved.result.uri}`,
    'State: open',
    'Owner: /',
    'Description: ',
    `Created: ${saved.result.action.created_at}`,
    `Updated: ${saved.result.action.updated_at}`,
    `Root: ${root}`,
  ])
    expect(human.stdout.split(/\r?\n/u)).toContain(field);
  for (const [args, code, status] of [
    [
      ['create', 'action', '--title', 'X', '--state', 'open', '--json'],
      'INVALID_ARGUMENT',
      2,
    ],
    [
      ['create', 'action', '--title', 'X', '--slug', 'x', '--json'],
      'INVALID_ARGUMENT',
      2,
    ],
    [['create', 'action', '--title', ' ', '--json'], 'INVALID_TITLE', 2],
    [
      ['get', 'action', saved.result.uri, 'extra', '--json'],
      'INVALID_ARGUMENT',
      2,
    ],
    [['get', 'action', '--json'], 'INVALID_ARGUMENT', 2],
    [['get', 'action', 'invalid', '--json'], 'INVALID_ARGUMENT', 2],
    [
      ['get', 'action', '00000000-0000-4000-8000-000000000000', '--json'],
      'ACTION_NOT_FOUND',
      1,
    ],
  ] as const) {
    const result = run(root, [...args]);
    expect(result.status).toBe(status);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: { code },
    });
  }
  expect(run(root, ['create', 'action', '--help']).stdout).toContain(
    '/ selects',
  );
  expect(run(root, ['get', 'action', '--help']).stdout).toContain('owf:action');
  expect(snapshot(root)).toEqual(before);
});

test('Action listing renders complete JSON, compact human output and argument errors', () => {
  const root = temporaryDirectory();
  roots.push(root);
  expect(run(root, ['init']).status).toBe(0);
  const created = run(root, [
    'create',
    'action',
    '--title',
    'Call supplier',
    '--description',
    '',
    '--json',
  ]);
  expect(created.status).toBe(0);
  const saved = z
    .object({
      result: z.object({ action: z.object({ id: z.string() }).passthrough() }),
    })
    .parse(JSON.parse(created.stdout));
  const before = snapshot(root);
  const listed = run(root, [
    'list',
    'actions',
    '--owner',
    '/',
    '--recursive',
    '--json',
  ]);
  expect(listed.status).toBe(0);
  expect(JSON.parse(listed.stdout)).toEqual({
    ok: true,
    result: {
      status: 'listed',
      type: 'actions',
      root,
      actions: [saved.result.action],
    },
    warnings: [],
  });
  const listHuman = run(root, ['list', 'actions']);
  expect(listHuman.status).toBe(0);
  for (const field of [
    'Title: Call supplier',
    `ID: ${saved.result.action.id}`,
    'State: open',
    'Owner: /',
  ])
    expect(listHuman.stdout.split(/\r?\n/u)).toContain(field);
  for (const json of [false, true]) {
    const empty = run(root, [
      'list',
      'actions',
      '--owner',
      '/missing/',
      ...(json ? ['--json'] : []),
    ]);
    expect(empty.status).toBe(0);
    if (json)
      expect(JSON.parse(empty.stdout)).toEqual({
        ok: true,
        result: { status: 'listed', type: 'actions', root, actions: [] },
        warnings: [],
      });
    else expect(empty.stdout.trim()).toBe('No Actions found.');
  }
  for (const args of [
    ['--recursive'],
    ['--owner', '/../'],
    ['--json', '--owner'],
    ['--state', 'open'],
    ['extra'],
  ]) {
    const failed = run(root, ['list', 'actions', '--json', ...args]);
    expect(failed.status).toBe(2);
    expect(JSON.parse(failed.stdout)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENT' },
    });
  }
  const help = run(root, ['list', 'actions', '--help']).stdout;
  for (const text of [
    'regardless of working directory',
    '--owner',
    '--recursive',
    '--json',
  ])
    expect(help).toContain(text);
  expect(snapshot(root)).toEqual(before);
});

test('listing CLI forwards recursive ownership and reports read/store failures with exit 1', () => {
  const root = temporaryDirectory();
  roots.push(root);
  expect(run(root, ['init']).status).toBe(0);
  expect(run(root, ['create', 'project', '--title', 'Kitchen']).status).toBe(0);
  expect(
    run(join(root, '_projects/kitchen'), [
      'create',
      'action',
      '--title',
      'Nested',
    ]).status,
  ).toBe(0);
  const before = snapshot(root);
  for (const recursive of [false, true]) {
    const result = run(root, [
      'list',
      'actions',
      '--owner',
      '/',
      '--json',
      ...(recursive ? ['--recursive'] : []),
    ]);
    expect(result.status).toBe(0);
    const parsed = z
      .object({
        result: z.object({ actions: z.array(z.object({ title: z.string() })) }),
      })
      .parse(JSON.parse(result.stdout));
    expect(parsed.result.actions.map((action) => action.title)).toEqual(
      recursive ? ['Nested'] : [],
    );
  }
  expect(snapshot(root)).toEqual(before);

  const store = join(root, '_store/owf.sqlite');
  const db = new DatabaseSync(store);
  try {
    db.prepare('UPDATE actions SET owner_url = ?').run('broken');
  } finally {
    db.close();
  }
  for (const code of ['ACTION_READ_FAILED', 'INVALID_STORE']) {
    if (code === 'INVALID_STORE') writeFileSync(store, 'corrupt');
    const damaged = snapshot(root);
    const failed = run(root, [
      'list',
      'actions',
      '--owner',
      '/',
      '--recursive',
      '--json',
    ]);
    expect(failed.status).toBe(1);
    expect(JSON.parse(failed.stdout)).toMatchObject({
      ok: false,
      error: { code },
    });
    expect(snapshot(root)).toEqual(damaged);
  }
});
