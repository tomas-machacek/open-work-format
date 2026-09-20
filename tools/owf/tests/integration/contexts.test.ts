import { afterEach, expect, test } from 'vitest';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import {
  create,
  initialize,
  contextPorts,
} from '../../src/bootstrap/workspaces.js';
import { createContext } from '../../src/application/contexts/index.js';
import { initializeWorkspace } from '../../src/application/workspaces/index.js';
import { cleanup, snapshot, temporaryDirectory } from '../support/workspace.js';

const roots: string[] = [];
function directory(init = true) {
  const root = temporaryDirectory();
  roots.push(root);
  if (init) initialize(root, 'Test');
  return root;
}
function project(root: string) {
  return create(root, { type: 'project', title: 'Kitchen' }).result.path;
}
afterEach(() => {
  roots.splice(0).forEach(cleanup);
});

test('literal documents, immutable indexes/store and newest-first semantic events', () => {
  const root = directory();
  const before = snapshot(root);
  const title = 'Život: [link](url) # <b> &amp; `code` *yes*';
  const first = create(root, { type: 'project', title, slug: 'literal' });
  const readme = readFileSync(join(first.result.path, 'README.md'), 'utf8');
  expect(parse(readme.split('---\n')[1]!)).toEqual({
    type: 'OWF Project',
    title,
    owf: { state: 'active' },
  });
  expect(readme).toMatch(/^# .+\n\n## Status\n\n## Next Steps\n$/mu);
  expect(readFileSync(join(first.result.path, 'index.md'), 'utf8')).toContain(
    '](README.md)',
  );
  expect(readme).toContain('&lt;b\\> &amp;amp;');
  expect(readme).not.toMatch(/storage:|version:|owner:|id:/u);
  const collection = readFileSync(join(root, '_projects', 'index.md'), 'utf8');
  expect(collection).toContain('(literal/)');
  create(root, { type: 'project', title: 'Second' });
  expect(readFileSync(join(root, '_projects', 'index.md'), 'utf8')).toBe(
    collection,
  );
  expect(snapshot(root)['index.md']).toBe(before['index.md']);
  expect(snapshot(root)['_store/owf.sqlite']).toBe(before['_store/owf.sqlite']);
  const log = readFileSync(join(root, 'log.md'), 'utf8');
  expect(log.indexOf('/second/')).toBeLessThan(log.indexOf('/literal/'));
  expect(log.match(/^- Created/gmu)).toHaveLength(2);
});

test('nested inferred owner through supporting notes and literal explicit expected result', () => {
  const root = directory();
  const parent = project(root);
  const child = create(parent, { type: 'outcome', title: 'Approved' }).result;
  const nested = join(child.path, 'notes');
  mkdirSync(nested);
  writeFileSync(join(nested, 'README.md'), '# Ordinary supporting notes\n');
  const explicit = create(nested, {
    type: 'outcome',
    title: 'Detail',
    expectedResult: 'Real [result] & <value>',
  }).result;
  expect(explicit.owner).toBe(child.url);
  expect(readFileSync(join(explicit.path, 'README.md'), 'utf8')).toContain(
    '## Expected Result\n\nReal \\[result\\] &amp; &lt;value\\>\n',
  );
});

test.each(['Život práce', 'literal%20 #name'])(
  'URL decoding happens once for %s',
  (name) => {
    const root = directory();
    const original = project(root);
    renameSync(original, join(root, '_projects', name));
    const owner = `/_projects/${encodeURIComponent(name)}/`;
    expect(
      create(root, { type: 'outcome', title: 'Result', owner }).result.owner,
    ).toBe(owner);
  },
);

test.each([
  ['backticks', '````md\n```\n## Expected Result\nExample only\n````'],
  ['tildes', '   ~~~md\n## Expected Result\nExample only\n   ~~~'],
])(
  'a heading inside %s cannot validate an inferred Outcome owner',
  (_kind, body) => {
    const root = directory();
    const parent = project(root);
    const owner = create(parent, { type: 'outcome', title: 'Owner' }).result
      .path;
    writeFileSync(
      join(owner, 'README.md'),
      `---\ntype: OWF Outcome\ntitle: Owner\nowf:\n  state: active\n---\n# Owner\n\n${body}\n`,
    );
    const before = snapshot(root);
    expect(() => create(owner, { type: 'outcome', title: 'Rejected' })).toThrow(
      expect.objectContaining({ code: 'INVALID_OWNER' }),
    );
    expect(snapshot(root)).toEqual(before);
  },
);

test('real Expected Result after a fenced example retains fenced content until the next real section', () => {
  const text =
    '---\ntype: OWF Outcome\ntitle: Owner\nowf:\n  state: active\n---\n# Owner\n\n~~~md\n## Expected Result\nExample\n~~~\n\n## Expected Result ##\n\nA result\n```md\n## Status\nLiteral content\n```\n\n## Status\nOther section\n';
  expect(contextPorts.contextDocuments.parse(text)?.expectedResult).toBe(
    'A result\n```md\n## Status\nLiteral content\n```',
  );
});

test('an explicit nested owner cannot bypass an invalid ancestor', () => {
  const root = directory();
  const parent = project(root);
  const owner = create(parent, { type: 'outcome', title: 'Owner' }).result.url;
  const readme = join(parent, 'README.md');
  writeFileSync(
    readme,
    readFileSync(readme, 'utf8').replace('state: active', 'state: achieved'),
  );
  const before = snapshot(root);
  expect(() =>
    create(root, { type: 'outcome', title: 'Rejected', owner }),
  ).toThrow(expect.objectContaining({ code: 'INVALID_OWNER' }));
  expect(snapshot(root)).toEqual(before);
});

test('owner lookup and project creation stay within the nearest Workspace', () => {
  const outer = directory();
  const parent = project(outer);
  const inner = directory();
  const nested = join(parent, 'nested-workspace');
  renameSync(inner, nested);
  const before = snapshot(outer);
  expect(() => create(nested, { type: 'outcome', title: 'Rejected' })).toThrow(
    expect.objectContaining({ code: 'OWNER_REQUIRED' }),
  );
  expect(() =>
    create(nested, {
      type: 'outcome',
      title: 'Rejected',
      owner: '/_projects/kitchen/',
    }),
  ).toThrow(expect.objectContaining({ code: 'INVALID_OWNER' }));
  expect(snapshot(outer)).toEqual(before);
  const created = create(nested, { type: 'project', title: 'Inner' }).result;
  expect(created.root).toBe(nested);
  expect(created.path).toBe(join(nested, '_projects', 'inner'));
});

test.each([
  'https://example.com/',
  '//host/path/',
  '/_projects/../',
  '/_projects/%2e%2e/',
  '/_projects/a%2Fb/',
  '/_projects/a%5Cb/',
  '/_projects/a/?x/',
  '/_projects/a/#x/',
  '/_projects/%zz/',
  'C:\\work\\',
  '/_projects/a',
])('invalid URL %s rejected before I/O', (owner) => {
  expect(() =>
    createContext(
      'does-not-exist',
      { type: 'outcome', title: 'Result', owner },
      contextPorts,
    ),
  ).toThrow(expect.objectContaining({ code: 'INVALID_ARGUMENT' }));
});

test.each([
  '/',
  '/unrelated/',
  '/_projects/kitchen/missing/',
  '/_projects/_archive/kitchen/',
])('invalid owner %s never writes', (owner) => {
  const root = directory();
  project(root);
  const before = snapshot(root);
  expect(() =>
    create(root, { type: 'outcome', title: 'Result', owner }),
  ).toThrow(expect.objectContaining({ code: 'INVALID_OWNER' }));
  expect(snapshot(root)).toEqual(before);
});

test('malformed nearest owner cannot silently fall back; missing indexes do not affect ownership', () => {
  const root = directory();
  const parent = project(root);
  unlinkSync(join(parent, 'index.md'));
  const child = create(parent, { type: 'outcome', title: 'Child' }).result.path;
  writeFileSync(
    join(child, 'README.md'),
    '---\ntype: OWF Outcome\ntitle: Broken\nowf:\n  state: active\n---\n# Broken\n',
  );
  const before = snapshot(root);
  expect(() => create(child, { type: 'outcome', title: 'Rejected' })).toThrow(
    expect.objectContaining({ code: 'INVALID_OWNER' }),
  );
  expect(snapshot(root)).toEqual(before);
});

test.each(['empty', 'file', 'case', 'dangling'])(
  'target %s is a collision',
  (kind) => {
    const root = directory();
    project(root);
    const target = join(
      root,
      '_projects',
      kind === 'case' ? 'Result' : 'result',
    );
    if (kind === 'file') writeFileSync(target, 'keep');
    else if (kind === 'dangling')
      symlinkSync(join(root, 'absent'), target, 'junction');
    else mkdirSync(target);
    expect(() => create(root, { type: 'project', title: 'Result' })).toThrow(
      expect.objectContaining({ code: 'PATH_CONFLICT' }),
    );
    expect(readdirSync(join(root, '_projects'))).toContain(
      kind === 'case' ? 'Result' : 'result',
    );
  },
);

test('external junction owners and linked project collection are rejected without external writes', () => {
  const external = directory();
  const externalProject = project(external);
  const before = snapshot(external);
  const root = directory();
  mkdirSync(join(root, '_projects'));
  symlinkSync(externalProject, join(root, '_projects', 'outside'), 'junction');
  expect(() =>
    create(root, {
      type: 'outcome',
      title: 'No',
      owner: '/_projects/outside/',
    }),
  ).toThrow(expect.objectContaining({ code: 'INVALID_OWNER' }));
  const other = directory();
  symlinkSync(
    join(external, '_projects'),
    join(other, '_projects'),
    'junction',
  );
  expect(() => create(other, { type: 'project', title: 'No' })).toThrow();
  expect(snapshot(external)).toEqual(before);
});

test.each(['README.md', 'index.md'])(
  'caught %s write failure rolls back only owned artifacts',
  (failed) => {
    const root = directory();
    const before = snapshot(root);
    const ports = {
      ...contextPorts,
      files: {
        ...contextPorts.files,
        createFile(path: string, content: string, owned: () => void) {
          contextPorts.files.createFile(path, content, owned);
          if (path === join(root, '_projects', 'result', failed))
            throw new Error('Injected write failure');
        },
      },
    };
    expect(() =>
      createContext(root, { type: 'project', title: 'Result' }, ports),
    ).toThrow('Injected write failure');
    expect(snapshot(root)).toEqual(before);
    expect(existsSync(join(root, '_projects'))).toBe(false);
  },
);

test('cleanup failure reports leftovers and preserves unowned files', () => {
  const root = directory();
  const parent = project(root);
  const index = readFileSync(join(parent, 'index.md'), 'utf8');
  const ports = {
    ...contextPorts,
    files: {
      ...contextPorts.files,
      createFile(path: string, content: string, owned: () => void) {
        contextPorts.files.createFile(path, content, owned);
        writeFileSync(join(parent, 'result', 'foreign'), 'keep');
        throw new Error('Injected failure');
      },
    },
  };
  expect(() =>
    createContext(parent, { type: 'outcome', title: 'Result' }, ports),
  ).toThrow(`manually inspect: ${join(parent, 'result')}`);
  expect(readFileSync(join(parent, 'result', 'foreign'), 'utf8')).toBe('keep');
  expect(readFileSync(join(parent, 'index.md'), 'utf8')).toBe(index);
});

test.each(['missing', 'malformed', 'directory'])(
  'log %s keeps usable created object',
  (kind) => {
    const root = directory();
    const log = join(root, 'log.md');
    if (kind === 'missing' || kind === 'directory') unlinkSync(log);
    if (kind === 'directory') mkdirSync(log);
    if (kind === 'malformed') writeFileSync(log, '# not a log\nKeep me');
    const result = createContext(
      root,
      { type: 'project', title: 'Result' },
      contextPorts,
    );
    expect(existsSync(join(result.result.path, 'README.md'))).toBe(true);
    expect(result.warnings).toHaveLength(kind === 'missing' ? 0 : 1);
    if (kind !== 'missing')
      expect(result.warnings[0]?.code).toBe('LOG_WRITE_FAILED');
    if (kind === 'malformed')
      expect(readFileSync(log, 'utf8')).toBe('# not a log\nKeep me');
  },
);

test.each(['edited', 'missing'])(
  'creation preserves %s guidance; repeat init does not backfill missing guidance',
  (kind) => {
    const root = directory();
    const guide = join(root, 'AGENTS.md');
    if (kind === 'missing') unlinkSync(guide);
    else writeFileSync(guide, 'User instructions');
    const before = snapshot(root);
    if (kind === 'missing') {
      initialize(root, 'Ignored');
      expect(snapshot(root)).toEqual(before);
    }
    project(root);
    expect(snapshot(root)['AGENTS.md']).toBe(before['AGENTS.md']);
  },
);

test('existing guide blocks fresh init and guide write failure rolls back', () => {
  const root = directory(false);
  writeFileSync(join(root, 'AGENTS.md'), 'Keep');
  const before = snapshot(root);
  expect(() => initialize(root)).toThrow(
    expect.objectContaining({ code: 'PATH_CONFLICT' }),
  );
  expect(snapshot(root)).toEqual(before);
  const other = directory(false);
  expect(() =>
    initializeWorkspace(other, 'Test', {
      ...contextPorts,
      files: {
        ...contextPorts.files,
        createFile(path, content, owned) {
          contextPorts.files.createFile(path, content, owned);
          if (path.endsWith('AGENTS.md')) throw new Error('Guide failed');
        },
      },
    }),
  ).toThrow('Guide failed');
  expect(snapshot(other)).toEqual({});
});
