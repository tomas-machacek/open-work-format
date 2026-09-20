import { spawnSync } from 'node:child_process';
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
  for (const line of guide.split('\n')) {
    if (line.startsWith('cd ')) {
      cwd = join(root, line.slice(3));
      continue;
    }
    if (!line.startsWith('owf ')) continue;
    const args = [...line.slice(4).matchAll(/"([^"]*)"|(\S+)/gu)].map(
      (match) => match[1] ?? match[2] ?? '',
    );
    const result = run(cwd, args);
    expect(result.status, result.stderr).toBe(0);
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
