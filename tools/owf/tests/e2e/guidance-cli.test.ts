import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { auditWorkspaceGuidance } from '../support/guidance.js';
import { cleanup, snapshot, temporaryDirectory } from '../support/workspace.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(cleanup));

test('built package without source checkout generates offline guidance using its own installed version', () => {
  const base = temporaryDirectory();
  roots.push(base);
  const installed = join(base, 'installed');
  const root = join(base, 'workspace');
  mkdirSync(installed);
  mkdirSync(root);
  cpSync(resolve('dist'), join(installed, 'dist'), { recursive: true });
  // Dependency packages are shared; no source, templates or repository docs are
  // available in the installed package. Its changed version proves provenance.
  symlinkSync(
    resolve('node_modules'),
    join(installed, 'node_modules'),
    'junction',
  );
  const installedVersion = '29.0.0-installed-test';
  writeFileSync(
    join(installed, 'package.json'),
    JSON.stringify({ type: 'module', version: installedVersion }),
  );
  const cli = join(installed, 'dist/bootstrap/cli.js');
  const run = (args: string[]) =>
    spawnSync(process.execPath, [cli, ...args], {
      cwd: root,
      encoding: 'utf8',
    });
  expect(run(['--version']).stdout.trim()).toBe(installedVersion);
  const init = run(['init', '--json']);
  expect(init.status, init.stdout + init.stderr).toBe(0);
  auditWorkspaceGuidance(root, installedVersion);
  expect(readFileSync(join(root, 'AGENTS.md')).byteLength).toBeLessThanOrEqual(
    4096,
  );
});

test.each([false, true])(
  'built init reports retained Knowledge navigation without claiming generation (json=%s)',
  (json) => {
    const root = temporaryDirectory();
    roots.push(root);
    mkdirSync(join(root, '_knowledge/empty'), { recursive: true });
    writeFileSync(join(root, '_knowledge/index.md'), '# User index\n');
    const before = snapshot(root);
    const result = spawnSync(
      process.execPath,
      [resolve('dist/bootstrap/cli.js'), 'init', ...(json ? ['--json'] : [])],
      { cwd: root, encoding: 'utf8' },
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    if (json)
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: true,
        result: { warnings: [{ code: 'GUIDANCE_PRESERVED' }] },
      });
    else
      expect(result.stderr).toContain(
        'GUIDANCE_PRESERVED: Preserved existing _knowledge/index.md',
      );
    expect(result.stdout + result.stderr).toContain(
      'add navigation links manually',
    );
    const after = snapshot(root);
    for (const [name, bytes] of Object.entries(before))
      expect(after[name]).toBe(bytes);
  },
);
