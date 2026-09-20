import { afterEach, expect, test, vi } from 'vitest';
import {
  writeFileSync,
  readFileSync,
  existsSync,
  unlinkSync,
  renameSync,
} from 'node:fs';
import { join } from 'node:path';
import { create, initialize } from '../../src/bootstrap/workspaces.js';
import { cleanup, temporaryDirectory } from '../support/workspace.js';

vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>();
  return {
    ...original,
    writeFileSync: vi.fn(original.writeFileSync),
    renameSync: vi.fn(original.renameSync),
  };
});
const original = await vi.importActual<typeof import('node:fs')>('node:fs');
const roots: string[] = [];
afterEach(() => {
  vi.mocked(writeFileSync).mockImplementation(original.writeFileSync);
  vi.mocked(renameSync).mockImplementation(original.renameSync);
  roots.splice(0).forEach(cleanup);
});

test('invalid UTF-8 log bytes are preserved with a warning after successful creation', () => {
  const root = temporaryDirectory();
  roots.push(root);
  initialize(root, 'Work');
  const log = join(root, 'log.md');
  const history = Buffer.concat([
    Buffer.from('# Log\n\n## 2026-09-19\n\n- History '),
    Buffer.from([0xff]),
    Buffer.from('\n'),
  ]);
  writeFileSync(log, history);
  const result = create(root, { type: 'project', title: 'Created' });
  expect(result.warnings).toHaveLength(1);
  expect(result.warnings[0]?.code).toBe('LOG_WRITE_FAILED');
  expect(readFileSync(log)).toEqual(history);
  expect(existsSync(join(result.result.path, 'README.md'))).toBe(true);
  expect(existsSync(join(root, '.owf-log.tmp'))).toBe(false);
});

test('failed log replacement preserves history and removes the completed temporary file', () => {
  const root = temporaryDirectory();
  roots.push(root);
  initialize(root, 'Work');
  const log = join(root, 'log.md');
  const history = readFileSync(log);
  vi.mocked(renameSync).mockImplementation(() => {
    throw new Error('Injected rename failure');
  });
  const result = create(root, { type: 'project', title: 'Created' });
  expect(result.warnings).toHaveLength(1);
  expect(result.warnings[0]?.code).toBe('LOG_WRITE_FAILED');
  expect(result.warnings[0]?.message).toContain('Injected rename failure');
  expect(readFileSync(log)).toEqual(history);
  expect(existsSync(join(result.result.path, 'README.md'))).toBe(true);
  expect(existsSync(join(root, '.owf-log.tmp'))).toBe(false);
});

test.each([true, false])(
  'partial log write preserves history or removes newly owned log (existing=%s)',
  (existing) => {
    const root = temporaryDirectory();
    roots.push(root);
    initialize(root, 'Work');
    const log = join(root, 'log.md');
    const history = readFileSync(log, 'utf8');
    if (!existing) unlinkSync(log);
    vi.mocked(writeFileSync).mockImplementation((path, data, options) => {
      if (typeof data === 'string' && data.startsWith('# Log')) {
        original.writeFileSync(path, data.slice(0, 12), options);
        throw new Error('Injected partial log write');
      }
      original.writeFileSync(path, data, options);
    });
    const result = create(root, { type: 'project', title: 'Created' });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe('LOG_WRITE_FAILED');
    expect(result.warnings[0]?.message).toContain('Injected partial log write');
    expect(existsSync(join(result.result.path, 'README.md'))).toBe(true);
    if (existing) expect(readFileSync(log, 'utf8')).toBe(history);
    else expect(existsSync(log)).toBe(false);
    expect(existsSync(join(root, '.owf-log.tmp'))).toBe(false);
  },
);

test('foreign temporary log file is preserved and reported as warning', () => {
  const root = temporaryDirectory();
  roots.push(root);
  initialize(root, 'Work');
  const log = join(root, 'log.md');
  const history = readFileSync(log, 'utf8');
  writeFileSync(join(root, '.owf-log.tmp'), 'Foreign');
  expect(
    create(root, { type: 'project', title: 'Created' }).warnings[0]?.code,
  ).toBe('LOG_WRITE_FAILED');
  expect(readFileSync(log, 'utf8')).toBe(history);
  expect(readFileSync(join(root, '.owf-log.tmp'), 'utf8')).toBe('Foreign');
});
