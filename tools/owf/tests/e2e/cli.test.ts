import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { afterEach, expect, test } from 'vitest';
import { boardAction } from '../../src/contracts/index.js';
import {
  initialize,
  create,
  createAction,
  setAction,
} from '../../src/bootstrap/workspaces.js';
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
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 5_000,
    killSignal: 'SIGKILL',
  });
  if (result.error || result.signal)
    throw new Error(
      `CLI ${JSON.stringify(args)} failed: ${String(result.error)}; signal=${result.signal}; stderr=${result.stderr}`,
      { cause: result.error },
    );
  return result;
}
afterEach(() => {
  roots.splice(0).forEach(cleanup);
});

// Supporting data uses the real application/store; each tested command still
// runs the built CLI. Keep the create/get journey below entirely across processes.
function workspaceFixture() {
  const root = temporaryDirectory();
  roots.push(root);
  initialize(root);
  return root;
}

function blockingFixture(sourceState: 'open' | 'completed' = 'open') {
  const root = workspaceFixture();
  create(root, { type: 'project', title: 'Other', slug: 'other' });
  const target = createAction(root, {
    title: 'Approve',
    owner: '/_projects/other/',
  }).result.action;
  const satisfied = createAction(root, {
    title: 'Tests',
    state: 'completed',
  }).result.action;
  const source = createAction(root, { title: 'Deploy', state: sourceState })
    .result.action;
  return { root, target, satisfied, source };
}

test('CLI manual/dependency edits expose complete JSON and detailed human fields', () => {
  const { root, target, satisfied, source } = blockingFixture();
  const record = z.object({ result: z.object({ action: boardAction }) });
  const action = (args: string[]) => {
    const result = run(root, [...args, '--json']);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    return record.parse(JSON.parse(result.stdout)).result.action;
  };
  const edit = ['set', 'action', source.id];
  const read = ['get', 'action', source.id];
  const manualExample = readFileSync(
    join(root, '_knowledge/owf/blocking-and-dependencies.md'),
    'utf8',
  )
    .split('\n')
    .find((line) => line.startsWith('owf set action {id} --manual-block'));
  expect(manualExample).toBeDefined();
  const manualText = manualExample!.match(/--manual-block "([^"]+)"/)?.[1];
  expect(manualText).toBeDefined();
  expect(run(root, read).stdout).toContain('Blocked: no');
  expect(run(root, [...edit, '--manual-block', manualText!]).stdout).toContain(
    'Blocked: yes (manual)',
  );
  const blocked = action([
    ...edit,
    '--add-dependency',
    target.id.toUpperCase(),
    '--add-dependency',
    `owf:action:${target.id}`,
    '--add-dependency',
    satisfied.id,
  ]);
  const refs = [target.id, satisfied.id].map((id) => `owf:action:${id}`).sort();
  expect(blocked.depends_on).toEqual(refs);
  expect(blocked.blocking).toMatchObject({
    blocked: true,
    manual: true,
    unresolved_dependencies: [`owf:action:${target.id}`],
  });
  const human = run(root, read).stdout;
  expect(human).toContain(
    'State: open\nBlocked: yes (manual; dependencies: 1 unresolved of 2)',
  );
  expect(human).toContain(
    `owf:action:${target.id} | Approve | open | unresolved`,
  );
  expect(human).toContain(
    `owf:action:${satisfied.id} | Tests | completed | satisfied`,
  );
  expect(human.indexOf(refs[0]!)).toBeLessThan(human.indexOf(refs[1]!));
});

test('CLI listing exposes manual blocking in concise text and complete JSON', () => {
  const { root, target, satisfied, source } = blockingFixture();
  const manualText = 'Existing block';
  const blocked = setAction(root, source.id, {
    manualBlock: manualText,
    addDependency: [target.id, satisfied.id],
  }).result.action;
  const listArgs = [
    'list',
    'actions',
    '--owner',
    '/',
    '--state',
    'open',
    '--search',
    'Deploy',
  ];
  const listed = run(root, listArgs);
  expect(listed.stdout).toContain(`Manual block: ${manualText}`);
  expect(listed.stdout).not.toContain('Dependencies:');
  expect(JSON.parse(run(root, [...listArgs, '--json']).stdout)).toMatchObject({
    result: { actions: [blocked] },
  });
});

test('CLI rejects blocked completion atomically and clears the manual block independently', () => {
  const { root, target, satisfied, source } = blockingFixture();
  setAction(root, source.id, {
    manualBlock: 'Existing block',
    addDependency: [target.id, satisfied.id],
  });
  const edit = ['set', 'action', source.id];
  const before = snapshot(root);
  const forbidden = run(root, [
    ...edit,
    '--state',
    'completed',
    '--clear-manual-block',
    '--json',
  ]);
  expect(forbidden.status).toBe(1);
  const failure = z
    .object({ error: z.object({ code: z.string(), message: z.string() }) })
    .parse(JSON.parse(forbidden.stdout));
  expect(failure.error.code).toBe('ACTION_BLOCKED');
  expect(failure.error.message).toContain(target.id);
  expect(snapshot(root)).toEqual(before);
  expect(run(root, [...edit, '--clear-manual-block']).stdout).toContain(
    'Blocked: yes (dependencies: 1 unresolved of 2)',
  );
});

test.each([
  ['blank manual block', ['--manual-block', ' ']],
  [
    'duplicate manual block',
    ['--manual-block', 'One', '--manual-block', 'Two'],
  ],
  ['duplicate clear', ['--clear-manual-block', '--clear-manual-block']],
  ['set and clear', ['--manual-block', 'One', '--clear-manual-block']],
  [
    'add and remove',
    ['--add-dependency', '{id}', '--remove-dependency', 'owf:action:{id}'],
  ],
  ['invalid dependency', ['--add-dependency', '/project/']],
  ['missing dependency', ['--add-dependency']],
] as const)('blocking CLI rejects %s without writes', (_name, flags) => {
  const { root, source, target, satisfied } = blockingFixture();
  setAction(root, source.id, {
    manualBlock: 'Existing block',
    addDependency: [target.id, satisfied.id],
  });
  const before = snapshot(root);
  const invalid = run(root, [
    'set',
    'action',
    source.id,
    '--json',
    ...flags.map((flag) => flag.replace('{id}', target.id)),
  ]);
  expect(invalid.status).toBe(2);
  expect(JSON.parse(invalid.stdout)).toMatchObject({
    ok: false,
    error: { code: 'INVALID_ARGUMENT' },
  });
  expect(snapshot(root)).toEqual(before);
});

test('CLI prerequisite completion and reopening update derived blocking without rewriting the dependent Action', () => {
  const { root, target, satisfied, source } = blockingFixture();
  setAction(root, source.id, { addDependency: [target.id, satisfied.id] });
  const action = (args: string[]) => {
    const result = run(root, [...args, '--json']);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    return z
      .object({ result: z.object({ action: boardAction }) })
      .parse(JSON.parse(result.stdout)).result.action;
  };
  const edit = ['set', 'action', source.id];
  const read = ['get', 'action', source.id];
  action(['set', 'action', target.id, '--state', 'completed']);
  const complete = action([...edit, '--state', 'completed']);
  expect(complete.blocking?.blocked).toBe(false);
  action(['set', 'action', target.id, '--state', 'open']);
  const corrected = action(read);
  expect(corrected.state).toBe('completed');
  expect(corrected.updated_at).toBe(complete.updated_at);
  expect(corrected.blocking?.blocked).toBe(true);
});

test('CLI dependency edits allow self and mutual references', () => {
  const { root, target, satisfied, source } = blockingFixture('completed');
  setAction(root, source.id, { addDependency: [target.id, satisfied.id] });
  const action = (args: string[]) => {
    const result = run(root, [...args, '--json']);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    return z
      .object({ result: z.object({ action: boardAction }) })
      .parse(JSON.parse(result.stdout)).result.action;
  };
  const edit = ['set', 'action', source.id];
  const read = ['get', 'action', source.id];
  action([
    ...edit,
    '--remove-dependency',
    target.id,
    '--add-dependency',
    source.id,
  ]);
  action(['set', 'action', satisfied.id, '--add-dependency', source.id]);
  expect(action(read).depends_on).toContain(`owf:action:${source.id}`);
  expect(run(root, [...read]).status).toBe(0);
});

test('create CLI accepts initial waiting state and renders JSON and human fields', () => {
  const root = workspaceFixture();
  const args = [
    'create',
    'action',
    '--title',
    'Wait',
    '--state',
    'waiting',
    '--waiting-for',
    '  Supplier reply  ',
  ];
  const created = run(root, [
    ...args,
    '--owner',
    '/',
    '--description',
    'Details',
    '--json',
  ]);
  expect(created.status).toBe(0);
  expect(JSON.parse(created.stdout)).toMatchObject({
    ok: true,
    result: {
      status: 'created',
      type: 'action',
      action: {
        state: 'waiting',
        waiting_for: '  Supplier reply  ',
        owner: { url: '/' },
        description: 'Details',
      },
    },
  });
  const human = run(root, args);
  expect(human.status).toBe(0);
  expect(human.stdout).toContain('created action');
  expect(human.stdout).toContain('State: waiting');
  expect(human.stdout).toContain('Waiting for:   Supplier reply  ');
});

test.each(
  [
    ['--state', 'open', '--state', 'waiting'],
    ['--state=open', '--state=open'],
    ['--state', 'waiting', '--waiting-for', 'First', '--waiting-for', 'Second'],
    ['--state=waiting', '--waiting-for=', '--waiting-for=Reply'],
    ['--state', 'open,waiting'],
    ['--state', 'waiting', '--waiting-for', '  '],
    ['--waiting-for', 'Reply'],
  ].map((options) => ({ options })),
)(
  'create CLI rejects malformed waiting options $options without writes',
  ({ options }) => {
    const root = workspaceFixture();
    createAction(root, {
      title: 'Wait',
      state: 'waiting',
      waitingFor: '  Supplier reply  ',
      owner: '/',
      description: 'Details',
    });
    createAction(root, {
      title: 'Wait',
      state: 'waiting',
      waitingFor: '  Supplier reply  ',
    });
    const before = snapshot(root);
    const failed = run(root, [
      'create',
      'action',
      '--title',
      'Invalid',
      '--json',
      ...options,
    ]);
    expect(failed.status).toBe(2);
    expect(JSON.parse(failed.stdout)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENT' },
    });
    expect(snapshot(root)).toEqual(before);
  },
);

test('create Action help documents waiting state and owner selection', () => {
  const root = workspaceFixture();
  createAction(root, { title: 'Call supplier', description: '' });
  const before = snapshot(root);
  const help = run(root, ['create', 'action', '--help']).stdout;
  expect(help).toContain('--state');
  expect(help).toContain('--waiting-for');
  expect(help).toContain('open (default)');
  expect(help).toContain('/ selects');
  expect(snapshot(root)).toEqual(before);
});

test('set CLI renders changed and unchanged Actions and forwards combined filters', () => {
  const root = workspaceFixture();
  create(root, { type: 'project', title: 'Kitchen' });
  const { id } = createAction(join(root, '_projects/kitchen'), {
    title: 'Wait',
  }).result.action;
  const command = [
    'set',
    'action',
    `owf:action:${id}`,
    '--state',
    'waiting',
    '--waiting-for',
    '  Supplier reply  ',
  ];
  const changed = run(root, [...command, '--json']);
  expect(changed.status).toBe(0);
  expect(JSON.parse(changed.stdout)).toMatchObject({
    ok: true,
    result: {
      status: 'updated',
      type: 'action',
      root,
      uri: `owf:action:${id}`,
      action: { id, state: 'waiting', waiting_for: '  Supplier reply  ' },
    },
    warnings: [],
  });
  const unchanged = run(root, command);
  expect(unchanged.status).toBe(0);
  expect(unchanged.stdout).toContain('unchanged action');
  expect(unchanged.stdout).toContain('Waiting for:   Supplier reply  ');
  expect(run(root, ['get', 'action', id]).stdout).toContain(
    'Waiting for:   Supplier reply  ',
  );
  expect(run(root, ['list', 'actions']).stdout).toContain(
    'Waiting for:   Supplier reply  ',
  );
  const listed = run(root, [
    'list',
    'actions',
    '--owner',
    '/',
    '--recursive',
    '--state',
    'open',
    '--state',
    'waiting',
    '--state',
    'waiting',
    '--json',
  ]);
  expect(listed.status).toBe(0);
  expect(JSON.parse(listed.stdout)).toMatchObject({
    result: {
      actions: [{ id, state: 'waiting', waiting_for: '  Supplier reply  ' }],
    },
  });
});

test.each(
  [
    [],
    ['--state', 'archived'],
    ['--state', 'waiting', '--waiting-for', ' '],
    ['--state', 'completed', '--waiting-for', 'Reply'],
    ['--state', 'open,waiting'],
  ].map((args) => ({ args })),
)('set CLI rejects invalid state options $args without writes', ({ args }) => {
  const root = workspaceFixture();
  create(root, { type: 'project', title: 'Kitchen' });
  const { id } = createAction(join(root, '_projects/kitchen'), {
    title: 'Wait',
    state: 'waiting',
    waitingFor: '  Supplier reply  ',
  }).result.action;
  const before = snapshot(root);
  const failed = run(root, ['set', 'action', id, '--json', ...args]);
  expect(failed.status).toBe(2);
  expect(JSON.parse(failed.stdout)).toMatchObject({
    ok: false,
    error: { code: 'INVALID_ARGUMENT' },
  });
  expect(snapshot(root)).toEqual(before);
});

test('set CLI reports an unknown Action without writes', () => {
  const root = workspaceFixture();
  create(root, { type: 'project', title: 'Kitchen' });
  createAction(join(root, '_projects/kitchen'), {
    title: 'Wait',
    state: 'waiting',
    waitingFor: '  Supplier reply  ',
  });
  const before = snapshot(root);
  const missing = run(root, [
    'set',
    'action',
    '00000000-0000-4000-8000-000000000000',
    '--state',
    'open',
    '--json',
  ]);
  expect(missing.status).toBe(1);
  expect(JSON.parse(missing.stdout)).toMatchObject({
    error: { code: 'ACTION_NOT_FOUND' },
  });
  expect(snapshot(root)).toEqual(before);
});

test('set Action help documents waiting, unchanged results and dependency removal', () => {
  const root = workspaceFixture();
  const help = run(root, ['set', 'action', '--help']).stdout;
  expect(help).toContain('--waiting-for');
  expect(help).toContain('unchanged');
  expect(help).toContain('--remove-dependency');
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
  expect(run(root, ['serve', '--help']).stdout).toContain('--port');
  expect(run(root, ['serve', '--port', 'invalid']).status).toBe(2);
  expect(run(root, ['serve']).stderr).toContain('WORKSPACE_NOT_FOUND');
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
  const guide = [
    'workspace',
    'actions',
    'blocking-and-dependencies',
    'views',
    'deletion',
  ]
    .map((topic) =>
      readFileSync(join(root, `_knowledge/owf/${topic}.md`), 'utf8'),
    )
    .join('\n');
  expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toContain('owf serve');
  expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toContain(
    'http://127.0.0.1:4317',
  );
  const viewDefinition = /```markdown\n([\s\S]*?)\n```/u.exec(guide)?.[1];
  expect(viewDefinition).toBeDefined();
  mkdirSync(join(root, '_views'));
  writeFileSync(join(root, '_views', 'work-board.md'), viewDefinition!);
  writeFileSync(
    join(root, '_views', 'index.md'),
    '# Index\n\n- [Work board](work-board.md)\n',
  );
  const prerequisiteIds = Array.from({ length: 3 }, (_, index) => {
    return createAction(root, {
      title: `Guide prerequisite ${index}`,
      state: 'completed',
    }).result.action.id;
  });
  const placeholders: Record<string, string> = {
    '{prerequisite-id}': prerequisiteIds[0]!,
    '{first-id}': prerequisiteIds[0]!,
    '{second-id}': prerequisiteIds[1]!,
    '{old-id}': prerequisiteIds[0]!,
    '{new-id}': prerequisiteIds[2]!,
  };
  let cwd = root;
  let actionId = '';
  for (const line of guide.split('\n')) {
    if (line.startsWith('## ')) cwd = root;
    if (line.startsWith('cd ')) {
      cwd = join(root, line.slice(3));
      continue;
    }
    if (!line.startsWith('owf ')) continue;
    const args = [...line.slice(4).matchAll(/"([^"]*)"|(\S+)/gu)].map((match) =>
      Object.entries(placeholders).reduce(
        (value, [placeholder, id]) => value.replace(placeholder, id),
        (match[1] ?? match[2] ?? '').replace('{id}', actionId),
      ),
    );
    const result = run(cwd, args);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    if (args[0] === 'create' && args[1] === 'view')
      placeholders['{view-id}'] = z
        .object({ result: z.object({ view: z.object({ id: z.string() }) }) })
        .parse(JSON.parse(result.stdout)).result.view.id;
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
  // Allow process startup under concurrent suite load on Windows; this is not a performance assertion.
}, 30_000);

test.each(['project', 'outcome'])(
  'create %s help documents context flags',
  (type) => {
    const root = workspaceFixture();
    const help = run(root, ['create', type, '--help']).stdout;
    expect(help).toContain('--slug');
    if (type === 'outcome') expect(help).toContain('--expected-result');
  },
);

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

test('explicit owner overrides cwd and path conflicts exit 1', () => {
  const root = workspaceFixture();
  create(root, { type: 'project', title: 'Kitchen' });
  create(root, { type: 'project', title: 'Garden' });
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
});

test.each([true, false])(
  'log warning succeeds with json=%s and preserves the existing file',
  (json) => {
    const root = workspaceFixture();
    writeFileSync(join(root, 'log.md'), 'Do not overwrite');
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
    expect(readFileSync(join(root, 'log.md'), 'utf8')).toBe('Do not overwrite');
  },
);

test('Action commands round trip across processes with complete envelopes and human fields', () => {
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
          depends_on: z.tuple([]),
          blocking: z.strictObject({
            blocked: z.literal(false),
            manual: z.literal(false),
            unresolved_dependencies: z.tuple([]),
            dependencies: z.tuple([]),
          }),
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
  expect(snapshot(root)).toEqual(before);
});

test.each([
  [
    ['create', 'action', '--title', 'X', '--state', 'archived', '--json'],
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
    ['get', 'action', 'owf:action:{id}', 'extra', '--json'],
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
] as const)(
  'Action CLI rejects %j with %s and exit %i without writes',
  (args, code, status) => {
    const root = workspaceFixture();
    const { id } = createAction(root, {
      title: 'Call supplier',
      description: '',
    }).result.action;
    const before = snapshot(root);
    const result = run(
      root,
      args.map((arg) => arg.replace('{id}', id)),
    );
    expect(result.status).toBe(status);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: { code },
    });
    expect(snapshot(root)).toEqual(before);
  },
);

test('get Action help documents URI selectors', () => {
  const root = workspaceFixture();
  createAction(root, { title: 'Call supplier', description: '' });
  const before = snapshot(root);
  expect(run(root, ['get', 'action', '--help']).stdout).toContain('owf:action');
  expect(snapshot(root)).toEqual(before);
});

test('Action listing renders complete JSON and compact human output', () => {
  const root = workspaceFixture();
  const saved = createAction(root, { title: 'Call supplier', description: '' });
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
  expect(snapshot(root)).toEqual(before);
});

test.each([false, true])(
  'Action listing renders an empty result with json=%s without writes',
  (json) => {
    const root = workspaceFixture();
    createAction(root, { title: 'Call supplier', description: '' });
    const before = snapshot(root);
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
    expect(snapshot(root)).toEqual(before);
  },
);

test.each(
  [
    ['--recursive'],
    ['--owner', '/../'],
    ['--json', '--owner'],
    ['--state', 'archived'],
    ['--state', 'open,waiting'],
    ['extra'],
  ].map((args) => ({ args })),
)('Action listing rejects $args without writes', ({ args }) => {
  const root = workspaceFixture();
  createAction(root, { title: 'Call supplier', description: '' });
  const before = snapshot(root);
  const failed = run(root, ['list', 'actions', '--json', ...args]);
  expect(failed.status).toBe(2);
  expect(JSON.parse(failed.stdout)).toMatchObject({
    ok: false,
    error: { code: 'INVALID_ARGUMENT' },
  });
  expect(snapshot(root)).toEqual(before);
});

test('Action listing help documents scope and output flags', () => {
  const root = workspaceFixture();
  createAction(root, { title: 'Call supplier', description: '' });
  const before = snapshot(root);
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
  const root = workspaceFixture();
  create(root, { type: 'project', title: 'Kitchen' });
  createAction(join(root, '_projects/kitchen'), { title: 'Nested' });
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

test('set action CLI supports combined edits and clears optional fields', () => {
  const root = workspaceFixture();
  const created = createAction(root, { title: 'Original' });
  const id = created.result.action.id;
  const changed = run(root, [
    'set',
    'action',
    id,
    '--title',
    'Revised',
    '--description',
    '',
    '--owner',
    '/',
    '--state',
    'waiting',
    '--waiting-for',
    'Reply',
    '--json',
  ]);
  expect(changed.status).toBe(0);
  expect(JSON.parse(changed.stdout)).toMatchObject({
    ok: true,
    result: {
      status: 'updated',
      action: {
        title: 'Revised',
        description: '',
        owner: { url: '/' },
        state: 'waiting',
        waiting_for: 'Reply',
      },
    },
  });
  const cleared = run(root, [
    'set',
    'action',
    id,
    '--clear-description',
    '--clear-waiting-for',
    '--json',
  ]);
  expect(cleared.status).toBe(0);
  const clearedAction = z
    .object({
      result: z.object({ action: z.object({ id: z.string() }).passthrough() }),
    })
    .parse(JSON.parse(cleared.stdout)).result.action;
  expect(clearedAction).not.toHaveProperty('description');
  expect(clearedAction).not.toHaveProperty('waiting_for');
});

test.each(
  [
    [],
    ['--title', 'A', '--title', 'B'],
    ['--description=', '--description', 'A'],
    ['--owner', '/', '--owner', '/'],
    ['--waiting-for', 'A', '--waiting-for', 'B'],
    ['--clear-description', '--clear-description'],
    ['--clear-waiting-for', '--clear-waiting-for'],
    ['--description', 'A', '--clear-description'],
    ['--state', 'completed', '--clear-waiting-for'],
  ].map((options) => ({ options })),
)(
  'set action CLI rejects duplicate or contradictory flags $options without writes',
  ({ options }) => {
    const root = workspaceFixture();
    const { id } = createAction(root, {
      title: 'Revised',
      state: 'waiting',
      owner: '/',
    }).result.action;
    const before = snapshot(root);
    const result = run(root, ['set', 'action', id, '--json', ...options]);
    expect(result.status).toBe(2);
    expect(
      z
        .object({ error: z.object({ code: z.string() }) })
        .parse(JSON.parse(result.stdout)).error.code,
    ).toBe('INVALID_ARGUMENT');
    expect(snapshot(root)).toEqual(before);
  },
);

test('built search CLI validates arguments, combines filters and runs the documented guide example', () => {
  const root = temporaryDirectory();
  roots.push(root);
  for (const options of [
    ['--search'],
    ['--search', ''],
    ['--search', '  '],
    ['--search=x', '--search=y'],
    ['--search', 'x', '--search', 'y'],
  ]) {
    const failed = run(root, ['list', 'actions', '--json', ...options]);
    expect(failed.status).toBe(2);
    expect(JSON.parse(failed.stdout)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENT' },
    });
  }
  const flagText = run(root, ['list', 'actions', '--search', '--json']);
  expect(flagText.status).toBe(1);
  expect(flagText.stdout).toBe('');
  expect(flagText.stderr).toContain('WORKSPACE_NOT_FOUND');
  expect(run(root, ['init']).status).toBe(0);
  expect(
    run(root, ['create', 'project', '--title', 'Kitchen', '--slug', 'kitchen'])
      .status,
  ).toBe(0);
  expect(
    run(root, [
      'create',
      'outcome',
      '--title',
      'Design',
      '--owner',
      '/_projects/kitchen/',
    ]).status,
  ).toBe(0);
  const created = run(root, [
    'create',
    'action',
    '--title',
    'Confirm delivery',
    '--description',
    'Date',
    '--owner',
    '/_projects/kitchen/design/',
    '--state',
    'waiting',
    '--json',
  ]);
  expect(created.status).toBe(0);
  const action = z
    .object({
      result: z.object({ action: z.object({ id: z.string() }).passthrough() }),
    })
    .parse(JSON.parse(created.stdout)).result.action;
  expect(
    run(root, ['create', 'action', '--title', 'Delivery outside']).status,
  ).toBe(0);
  expect(
    run(root, [
      'create',
      'action',
      '--title',
      'Delivery done',
      '--owner',
      '/_projects/kitchen/',
      '--state',
      'completed',
    ]).status,
  ).toBe(0);
  const guide = readFileSync(join(root, '_knowledge/owf/actions.md'), 'utf8');
  const example = guide
    .split('\n')
    .find((line) => line.startsWith('owf list actions --search "delivery"'));
  expect(example).toBeDefined();
  const args = example!.replace('"delivery"', 'delivery').split(' ').slice(1);
  const before = snapshot(root);
  const listed = run(root, args);
  expect(listed.status).toBe(0);
  expect(JSON.parse(listed.stdout)).toEqual({
    ok: true,
    result: { status: 'listed', type: 'actions', root, actions: [action] },
    warnings: [],
  });
  const human = run(
    root,
    args.filter((arg) => arg !== '--json'),
  );
  expect(human.status).toBe(0);
  expect(human.stdout).toContain('Title: Confirm delivery');
  expect(human.stdout).not.toContain('Delivery outside');
  expect(run(root, ['get', 'action', action.id, '--json']).status).toBe(0);
  const empty = run(root, ['list', 'actions', '--search=unmatched', '--json']);
  expect(empty.status).toBe(0);
  expect(JSON.parse(empty.stdout)).toMatchObject({
    ok: true,
    result: { actions: [] },
  });
  const emptyHuman = run(root, ['list', 'actions', '--search=unmatched']);
  expect(emptyHuman.status).toBe(0);
  expect(emptyHuman.stdout.trim()).toBe('No Actions found.');
  const help = run(root, ['list', 'actions', '--help']);
  expect(help.status).toBe(0);
  expect(help.stdout).toContain('--search <text>');
  expect(snapshot(root)).toEqual(before);
  writeFileSync(join(root, 'AGENTS.md'), 'User instructions');
  expect(run(root, ['init']).status).toBe(0);
  expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toBe(
    'User instructions',
  );
}, 30000);
