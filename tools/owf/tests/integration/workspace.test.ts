import { afterEach, expect, test } from 'vitest';
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  unlinkSync,
  symlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  initialize,
  create,
  createAction,
  getAction,
  workspacePorts,
} from '../../src/bootstrap/workspaces.js';
import { initializeWorkspace } from '../../src/application/workspaces/index.js';
import { workspaceDocuments } from '../../src/infrastructure/markdown/index.js';
import { cleanup, snapshot, temporaryDirectory } from '../support/workspace.js';

const roots: string[] = [];
function directory() {
  const root = temporaryDirectory();
  roots.push(root);
  return root;
}
afterEach(() => {
  roots.splice(0).forEach(cleanup);
});

test('literal title round trip, single H1, deterministic dated log, unrelated content preserved', () => {
  const root = directory();
  const title = 'Život: [link](url) # <b> &amp; `code` *yes*';
  writeFileSync(join(root, 'keep.txt'), 'keep');
  initializeWorkspace(root, title, {
    ...workspacePorts,
    today: () => '2026-09-16',
  });
  const text = readFileSync(join(root, 'README.md'), 'utf8');
  expect(workspaceDocuments.parse(text, root)?.title).toBe(title);
  expect(text.match(/^# /gmu)).toHaveLength(1);
  expect(text).toContain('&lt;b\\> &amp;amp;');
  expect(readFileSync(join(root, 'log.md'), 'utf8')).toContain(
    '## 2026-09-16\n\n- Initialized Workspace',
  );
  expect(readFileSync(join(root, 'keep.txt'), 'utf8')).toBe('keep');
});
test.each(['OWF Project', 'OWF Outcome'])(
  '%s descendant README does not hide root',
  (type) => {
    const root = directory();
    initialize(root, 'Root');
    const child = join(root, 'child');
    mkdirSync(child);
    writeFileSync(join(child, 'README.md'), `---\ntype: ${type}\n---\n`);
    expect(initialize(child).root).toBe(root);
  },
);
test.each([
  ['---\ntype: [broken\n---', 'INVALID_WORKSPACE'],
  ['---\ntype: OWF Workspace\n---', 'INVALID_WORKSPACE'],
  ['---\ntype: A\ntype: B\n---', 'INVALID_WORKSPACE'],
  ['---\ntype: !custom value\n---', 'INVALID_WORKSPACE'],
  ['---\ntype: OWF Workspace\ntitle: [broken\n---', 'INVALID_WORKSPACE'],
  ['---\ntype: OWF Project\ntype: OWF Workspace\n---', 'INVALID_WORKSPACE'],
])('ambiguous descendant frontmatter stops discovery', (text, code) => {
  const root = directory();
  initialize(root, 'Root');
  const child = join(root, 'child');
  mkdirSync(child);
  writeFileSync(join(child, 'README.md'), text);
  const before = snapshot(root);
  for (const operation of [
    () => initialize(child),
    () =>
      create(child, {
        type: 'outcome',
        title: 'Rejected',
        owner: '/_projects/absent/',
      }),
    () => createAction(child, { title: 'Rejected', owner: '/' }),
    () => getAction(child, '00000000-0000-4000-8000-000000000000'),
  ]) {
    expect(operation).toThrow(expect.objectContaining({ code }));
    expect(snapshot(root)).toEqual(before);
  }
});
test('unreadable README is not skipped (directory in place of file)', () => {
  const root = directory();
  mkdirSync(join(root, 'README.md'));
  expect(() => initialize(root)).toThrow(
    expect.objectContaining({ code: 'INVALID_WORKSPACE' }),
  );
});
test.each(['index.md', 'log.md', '_store'])(
  'preflight collision preserves %s',
  (target) => {
    const root = directory();
    writeFileSync(join(root, target), 'ordinary');
    const before = snapshot(root);
    expect(() => initialize(root)).toThrow(
      expect.objectContaining({ code: 'PATH_CONFLICT' }),
    );
    expect(snapshot(root)).toEqual(before);
  },
);
test('empty store directory and directory symlink are collisions; physical start follows junction', () => {
  const root = directory();
  mkdirSync(join(root, '_store'));
  expect(() => initialize(root)).toThrow(
    expect.objectContaining({ code: 'PATH_CONFLICT' }),
  );
  const other = directory();
  const target = directory();
  symlinkSync(target, join(other, '_store'), 'junction');
  expect(() => initialize(other)).toThrow(
    expect.objectContaining({ code: 'PATH_CONFLICT' }),
  );
  const links = directory();
  symlinkSync(target, join(links, 'alias'), 'junction');
  expect(initialize(join(links, 'alias'), 'Physical').root).toBe(target);
});
test.each([
  ['version: "0.1"', 'version: "9"', 'UNSUPPORTED_PROFILE'],
  ['url: ./_store/', 'url: https://example.com/store/', 'UNSUPPORTED_STORAGE'],
  ['version: "0.1"', 'version: "0.1"\n  state: open', 'INVALID_WORKSPACE'],
])(
  'reject unsupported or invalid workspace metadata',
  (before, after, code) => {
    const root = directory();
    initialize(root, 'Root');
    const path = join(root, 'README.md');
    writeFileSync(path, readFileSync(path, 'utf8').replace(before, after));
    const saved = snapshot(root);
    expect(() => initialize(root)).toThrow(expect.objectContaining({ code }));
    expect(snapshot(root)).toEqual(saved);
  },
);
test.each(['missing', 'garbage', 'unrecognized', 'version'])(
  'reject %s store without replacement',
  (kind) => {
    const root = directory();
    const result = initialize(root, 'Root');
    if (kind === 'missing') unlinkSync(result.store);
    if (kind === 'garbage') writeFileSync(result.store, 'not sqlite');
    if (kind === 'unrecognized' || kind === 'version') {
      const db = new DatabaseSync(result.store);
      try {
        db.prepare('UPDATE owf_metadata SET value = ? WHERE key = ?').run(
          '9',
          kind === 'version' ? 'schema_version' : 'format',
        );
      } finally {
        db.close();
      }
    }
    const before = snapshot(root);
    const code =
      kind === 'missing'
        ? 'STORE_UNAVAILABLE'
        : kind === 'version'
          ? 'UNSUPPORTED_STORE_VERSION'
          : 'INVALID_STORE';
    expect(() => initialize(root)).toThrow(expect.objectContaining({ code }));
    expect(snapshot(root)).toEqual(before);
  },
);
test('external local directory resolves from workspace rather than descendant', () => {
  const external = directory();
  const externalStore = initialize(external, 'External').store;
  const root = directory();
  initialize(root, 'Root');
  const path = join(root, 'README.md');
  writeFileSync(
    path,
    readFileSync(path, 'utf8').replace(
      './_store/',
      join(external, '_store').replaceAll('\\', '/'),
    ),
  );
  const child = join(root, 'child');
  mkdirSync(child);
  expect(initialize(child).store).toBe(externalStore);
});

test.each(['my store', 'Život', 'literal%20 #store'])(
  'encoded relative storage URL resolves %s from workspace root',
  (name) => {
    const root = directory();
    initialize(root, 'Root');
    renameSync(join(root, '_store'), join(root, name));
    const readme = join(root, 'README.md');
    writeFileSync(
      readme,
      readFileSync(readme, 'utf8').replace(
        './_store/',
        `./${encodeURIComponent(name)}/`,
      ),
    );
    const child = join(root, 'child');
    mkdirSync(child);
    const before = snapshot(root);
    expect(initialize(child).store).toBe(join(root, name, 'owf.sqlite'));
    expect(snapshot(root)).toEqual(before);
  },
);
