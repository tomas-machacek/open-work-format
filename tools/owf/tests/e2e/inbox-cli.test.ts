import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type {
  InboxResult,
  ListInboxResult,
  ConsumeInboxResult,
} from '../../src/application/inbox/index.js';
import { cleanup, temporaryDirectory } from '../support/workspace.js';

const cli = resolve('dist/bootstrap/cli.js');
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(cleanup));
function workspace() {
  const root = temporaryDirectory();
  roots.push(root);
  run(root, ['init', '--json']);
  return root;
}
function execute(root: string, args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}
function run<T>(root: string, args: string[]): T {
  const output = execute(root, args);
  expect(output.status, output.stdout + output.stderr).toBe(0);
  const value = JSON.parse(output.stdout) as T & { ok: boolean };
  expect(value.ok).toBe(true);
  return value;
}

test('built CLI captures, lists, clarifies and explicitly consumes input independently of Action creation', () => {
  const root = workspace();
  const child = join(root, 'subdirectory');
  mkdirSync(child);
  const text =
    '  Život\r\nhttps://example.com/?x=1&y=2\n**literal** [URL](x)\t ';
  const item = run<InboxResult>(child, [
    'capture',
    'inbox',
    '--text',
    text,
    '--json',
  ]).result.item;
  expect(item.text).toBe(text);
  expect(
    run<InboxResult>(root, ['get', 'inbox', item.id, '--json']).result.item,
  ).toEqual(item);
  expect(
    run<ListInboxResult>(child, ['list', 'inbox', '--json']).result.items,
  ).toEqual([item]);
  const replacement = text + '\nCompare contracts';
  const updated = run<InboxResult>(root, [
    'set',
    'inbox',
    item.id,
    '--text',
    replacement,
    '--json',
  ]).result.item;
  expect(updated).toEqual({ ...item, text: replacement });
  expect(
    run<InboxResult>(root, [
      'set',
      'inbox',
      item.id,
      '--text',
      replacement,
      '--json',
    ]).result.status,
  ).toBe('unchanged');
  run(root, ['create', 'action', '--title', 'Read new terms', '--json']);
  expect(
    run<ListInboxResult>(root, ['list', 'inbox', '--json']).result.items,
  ).toEqual([updated]);
  const failed = execute(root, [
    'create',
    'action',
    '--title',
    'Compare',
    '--owner',
    '/_projects/missing/',
    '--json',
  ]);
  expect(failed.status).toBe(1);
  expect(
    run<ListInboxResult>(root, ['list', 'inbox', '--json']).result.items,
  ).toEqual([updated]);
  const resolved = run<ConsumeInboxResult>(root, [
    'resolve',
    'inbox',
    item.id,
    '--json',
  ]).result;
  expect(resolved.status).toBe('resolved');
  expect(resolved.id).toBe(item.id);
  expect(
    run<ListInboxResult>(root, ['list', 'inbox', '--json']).result.items,
  ).toEqual([]);
  const discard = run<InboxResult>(root, [
    'capture',
    'inbox',
    '--text',
    'Nothing to keep',
    '--json',
  ]).result.item;
  expect(
    run<ConsumeInboxResult>(root, ['discard', 'inbox', discard.id, '--json'])
      .result.status,
  ).toBe('discarded');
  const missing = execute(root, ['resolve', 'inbox', item.id, '--json']);
  expect(missing.status).toBe(1);
  expect(JSON.parse(missing.stdout)).toMatchObject({
    ok: false,
    error: { code: 'INBOX_NOT_FOUND' },
  });
});

test('built Inbox help, validation, literal flags and human output follow CLI conventions', () => {
  const root = workspace();
  for (const command of [
    'capture',
    'get',
    'list',
    'set',
    'resolve',
    'discard',
  ]) {
    const help = execute(root, [command, 'inbox', '--help']);
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain('inbox');
  }
  expect(execute(root, ['resolve', 'inbox', '--help']).stdout).toContain(
    'ALL intended operations succeeded',
  );
  for (const args of [
    ['capture', 'inbox', '--json'],
    ['capture', 'inbox', '--text', ' \n\t', '--json'],
    ['capture', 'inbox', '--text', 'One', '--text', 'Two', '--json'],
    ['get', 'inbox', 'not-a-uuid', '--json'],
    [
      'capture',
      'inbox',
      '--text',
      'Plain',
      '--url',
      'https://example.com',
      '--json',
    ],
  ]) {
    const invalid = execute(root, args);
    expect(invalid.status).toBe(2);
    expect(JSON.parse(invalid.stdout)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENT' },
    });
  }
  const literalFlag = execute(root, ['capture', 'inbox', '--text=--json']);
  expect(literalFlag.status).toBe(0);
  expect(literalFlag.stdout).toContain('Text:\n--json');
  expect(literalFlag.stdout.startsWith('{')).toBe(false);
  const human = execute(root, ['list', 'inbox']);
  expect(human.status).toBe(0);
  expect(human.stdout).toContain('Captured:');
  expect(human.stdout).toContain('--json');
  const error = execute(root, ['get', 'inbox', 'invalid']);
  expect(error.status).toBe(2);
  expect(error.stdout).toBe('');
  expect(error.stderr).toContain('INVALID_ARGUMENT');
});
