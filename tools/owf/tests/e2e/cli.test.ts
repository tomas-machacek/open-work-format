import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
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
  const before = snapshot(root);
  const child = join(root, 'child');
  mkdirSync(child);
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
