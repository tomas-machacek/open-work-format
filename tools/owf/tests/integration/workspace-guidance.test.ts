import { afterEach, expect, test } from 'vitest';
import {
  mkdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { initialize, workspacePorts } from '../../src/bootstrap/workspaces.js';
import { initializeWorkspace } from '../../src/application/workspaces/index.js';
import { auditWorkspaceGuidance } from '../support/guidance.js';
import { cleanup, snapshot, temporaryDirectory } from '../support/workspace.js';

const metadata: unknown = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);
if (
  typeof metadata !== 'object' ||
  metadata === null ||
  !('version' in metadata) ||
  typeof metadata.version !== 'string'
)
  throw new Error('Invalid package metadata');
const version = metadata.version;
const roots: string[] = [];
function directory() {
  const root = temporaryDirectory();
  roots.push(root);
  return root;
}
afterEach(() => roots.splice(0).forEach(cleanup));

test('fresh initialized guidance has bounded entry point, Knowledge roles, installed version and reachable parsed links', () => {
  const root = directory();
  initialize(root, 'Guidance');
  auditWorkspaceGuidance(root, version);
  // An external URL and code examples are not local navigation. Exercise both
  // Workspace-rooted and encoded relative destinations, plus reference links.
  const topic = join(root, '_knowledge/owf/actions.md');
  writeFileSync(join(root, '_knowledge/owf/Život # %.md'), 'User reference');
  writeFileSync(
    topic,
    readFileSync(topic, 'utf8') +
      '\n[Root](/index.md)\n[Encoded](%C5%BDivot%20%23%20%25.md)\n[Reference][ref]\n\n[ref]: views.md\n\n[Online](https://example.invalid/absent.md)\n\n```md\n[Example](absent.md)\n```\n',
  );
  auditWorkspaceGuidance(root, version);
});

test.each([
  [
    'oversize UTF-8 entry point',
    'AGENTS.md',
    (text: string) =>
      text + 'ž'.repeat(Math.floor((4096 - Buffer.byteLength(text)) / 2) + 1),
    /exceeds 4096/u,
  ],
  [
    'entry frontmatter',
    'AGENTS.md',
    (text: string) => '---\ntype: Wrong\n---\n' + text,
    /match/u,
  ],
  [
    'broken topic link',
    '_knowledge/owf/actions.md',
    (text: string) => text.replace('(deletion.md)', '(absent.md)'),
    /broken local link/u,
  ],
  [
    'wrong Knowledge role',
    '_knowledge/owf/actions.md',
    (text: string) => text.replace('OWF Knowledge Document', 'OWF Project'),
    /actions.md/u,
  ],
  [
    'wrong producer version',
    '_knowledge/owf/actions.md',
    (text: string) =>
      text.replace(`OWF tool ${version}.`, 'OWF tool incorrect.'),
    /tool version/u,
  ],
  [
    'Concept index',
    '_knowledge/owf/index.md',
    (text: string) => '---\ntype: OWF Knowledge Document\n---\n' + text,
    /index.md/u,
  ],
  [
    'orphaned topic',
    '_knowledge/owf/index.md',
    (text: string) => text.replace(/^.*\[Actions\].*\n/mu, ''),
    /unreachable/u,
  ],
] as const)('guidance gate rejects %s', (_label, path, corrupt, message) => {
  const root = directory();
  initialize(root, 'Gate');
  const file = join(root, path);
  const original = readFileSync(file);
  writeFileSync(file, corrupt(original.toString('utf8')));
  // Remove the cross-topic links as well to create a real navigation orphan.
  if (_label === 'orphaned topic') {
    for (const name of ['AGENTS.md', '_knowledge/owf/workspace.md']) {
      const other = join(root, name);
      writeFileSync(
        other,
        readFileSync(other, 'utf8').replace(
          /\[Actions\]\([^)]*\)/gu,
          'Actions',
        ),
      );
    }
  }
  expect(() => auditWorkspaceGuidance(root, version)).toThrow(message);
});

test('repeat init preserves bytes, empty directories, edits and missing topics without backfill', () => {
  const root = directory();
  initialize(root, 'Original');
  writeFileSync(join(root, 'AGENTS.md'), Buffer.from([0xff, 0x00, 0xfe]));
  writeFileSync(join(root, '_knowledge/owf/actions.md'), '# User guide\n');
  unlinkSync(join(root, '_knowledge/owf/views.md'));
  mkdirSync(join(root, '_knowledge/empty'));
  const before = snapshot(root);
  expect(initialize(join(root, '_knowledge'), 'Different').status).toBe(
    'already_initialized',
  );
  expect(snapshot(root)).toEqual(before);
});

test('fresh init preserves existing Knowledge bytes/indexes/empty directories and identifies retained guidance', () => {
  const root = directory();
  mkdirSync(join(root, '_knowledge/owf/empty'), { recursive: true });
  for (const name of [
    '_knowledge/index.md',
    '_knowledge/owf/index.md',
    '_knowledge/owf/actions.md',
  ])
    writeFileSync(join(root, name), Buffer.from([0xff, 0xfe, 0x00, 0x61]));
  const before = snapshot(root);
  const result = initialize(root, 'Around user files');
  expect(result.warnings).toHaveLength(3);
  expect(
    result.warnings?.every(
      (warning) =>
        warning.code === 'GUIDANCE_PRESERVED' &&
        warning.message.includes('not generated or refreshed') &&
        warning.message.includes('manually'),
    ),
  ).toBe(true);
  const after = snapshot(root);
  for (const [name, bytes] of Object.entries(before))
    expect(after[name]).toBe(bytes);
  expect(readFileSync(join(root, '_knowledge/owf/views.md'), 'utf8')).toContain(
    'OWF Knowledge Document',
  );
});

test.each(['_knowledge', '_knowledge/owf', '_knowledge/owf/actions.md'])(
  'unsafe Knowledge collision at %s fails without writes',
  (name) => {
    const root = directory();
    const target = join(root, name);
    if (name.includes('/'))
      mkdirSync(join(root, name.slice(0, name.lastIndexOf('/'))), {
        recursive: true,
      });
    if (name.endsWith('.md')) mkdirSync(target);
    else writeFileSync(target, 'User file');
    const before = snapshot(root);
    expect(() => initialize(root)).toThrow(
      expect.objectContaining({ code: 'PATH_CONFLICT' }),
    );
    expect(snapshot(root)).toEqual(before);
  },
);

test('linked Knowledge directory is rejected without writing through it', () => {
  const root = directory();
  const outside = directory();
  symlinkSync(outside, join(root, '_knowledge'), 'junction');
  expect(() => initialize(root)).toThrow(
    expect.objectContaining({ code: 'PATH_CONFLICT' }),
  );
  expect(snapshot(outside)).toEqual({});
});

test('mid-guide write failure removes only owned artifacts, retaining pre-existing files and empty directories', () => {
  const root = directory();
  mkdirSync(join(root, '_knowledge/empty'), { recursive: true });
  writeFileSync(join(root, '_knowledge/index.md'), 'User index');
  const before = snapshot(root);
  expect(() =>
    initializeWorkspace(root, 'Failure', {
      ...workspacePorts,
      files: {
        ...workspacePorts.files,
        createFile(path, content, owned) {
          workspacePorts.files.createFile(path, content, owned);
          if (path.endsWith('actions.md'))
            throw new Error('Injected topic write failure');
        },
      },
    }),
  ).toThrow('Injected topic write failure');
  expect(snapshot(root)).toEqual(before);
});
