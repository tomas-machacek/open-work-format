import { afterEach, expect, test } from 'vitest';
import { existsSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { initializeWorkspace } from '../../src/application/workspaces/index.js';
import { workspacePorts } from '../../src/bootstrap/workspaces.js';
import { cleanup, temporaryDirectory } from '../support/workspace.js';

const roots: string[] = [];
afterEach(() => {
  roots.splice(0).forEach(cleanup);
});
test.each(['store', 'write'])(
  'clean up owned artifacts after %s failure',
  (failure) => {
    const root = temporaryDirectory();
    roots.push(root);
    writeFileSync(join(root, 'keep.txt'), 'original');
    const ports = {
      ...workspacePorts,
      store: {
        ...workspacePorts.store,
        initializeReserved:
          failure === 'store'
            ? () => {
                throw new Error('Injected store failure');
              }
            : (path: string) => workspacePorts.store.initializeReserved(path),
      },
      files: {
        ...workspacePorts.files,
        createFile: (path: string, content: string, owned: () => void) => {
          workspacePorts.files.createFile(path, content, owned);
          if (failure === 'write') throw new Error('Injected write failure');
        },
      },
    };
    expect(() => initializeWorkspace(root, 'Test', ports)).toThrow('Injected');
    expect(readdirSync(root)).toEqual(['keep.txt']);
  },
);
test('report remaining paths when cleanup fails; preserve unowned concurrent file', () => {
  const root = temporaryDirectory();
  roots.push(root);
  const ports = {
    ...workspacePorts,
    store: {
      ...workspacePorts.store,
      initializeReserved: () => {
        writeFileSync(join(root, '_store', 'foreign'), 'keep');
        throw new Error('Injected failure');
      },
    },
  };
  expect(() => initializeWorkspace(root, 'Test', ports)).toThrow(
    `manually inspect: ${join(root, '_store')}`,
  );
  expect(existsSync(join(root, '_store', 'foreign'))).toBe(true);
  expect(existsSync(join(root, 'README.md'))).toBe(false);
});
