import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { viewDefinitions } from '../../src/infrastructure/markdown/views.js';

const yaml =
  'type: OWF View Definition\ntitle: Work board\nowf:\n  id: shared-board\n  renderer: kanban\n  columns:\n    - id: todo\n      title: Todo\n      status: open';
const document = `---\n${yaml}\n---\n\n# Work board\n`;
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'owf-view-definitions-'));
  mkdirSync(join(root, '_views'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
function save(content = document, name = 'board.md') {
  writeFileSync(join(root, '_views', name), content);
}
function load(url = '/_views/board.md', id?: string) {
  return viewDefinitions.load(root, {
    url,
    ...(id === undefined ? {} : { id }),
  });
}

describe('current Markdown View definitions', () => {
  it('decodes URL characters once, reads shared edits and checks optional identity', () => {
    mkdirSync(join(root, '_views', 'group'));
    save(document, 'group/work #%25 board.md');
    const url = '/_views/group/work%20%23%2525%20board.md';
    expect(load(url, 'shared-board').columns[0]?.title).toBe('Todo');
    save(
      document.replace('title: Todo', 'title: Ready'),
      'group/work #%25 board.md',
    );
    expect(load(url).columns[0]?.title).toBe('Ready');
    expect(() => load(url, 'other')).toThrow(/ID does not match/u);
    expect(() => load('/_views/missing.md')).toThrow(/missing.md/u);
  });
  it.each([
    ['missing envelope', '# Work board'],
    [
      'duplicate key',
      document.replace(
        'renderer: kanban',
        'renderer: kanban\n  renderer: kanban',
      ),
    ],
    ['malformed YAML', document.replace('status: open', 'status: [open')],
    [
      'custom tag',
      document.replace('title: Work board', 'title: !custom Work board'),
    ],
    [
      'wrong type',
      document.replace('OWF View Definition', 'OWF Knowledge Document'),
    ],
    ['no real H1', `---\n${yaml}\n---\n~~~markdown\n# Work board\n~~~`],
    ['indented code H1', `---\n${yaml}\n---\n    # Work board`],
    ['HTML code H1', `---\n${yaml}\n---\n<pre>\n# Work board\n</pre>`],
    ['HTML block H1', `---\n${yaml}\n---\n<div>\n# Work board\n</div>`],
    ['comment H1', `---\n${yaml}\n---\n<!--\n# Work board\n-->`],
    ['two H1s', `${document}\n# Work board`],
    ['unrelated H1', document.replace('# Work board', '# Another thing')],
  ])('rejects %s with a definition URL', (_name, content) => {
    save(content);
    expect(() => load()).toThrow(/\/_views\/board.md/u);
  });
  it('accepts Markdown title formatting and setext H1 without exact text equality', () => {
    save(document.replace('# Work board', '**Work** board\n=========='));
    expect(load().title).toBe('Work board');
  });
  it('accepts the complete text of a multiline setext H1', () => {
    save(document.replace('# Work board', 'Work\nboard\n==='));
    expect(load().title).toBe('Work board');
  });
  it('recognizes a real H1 after an HTML block ends at a blank line', () => {
    save(
      document.replace(
        '# Work board',
        '<div>\n# Example\n</div>\n\n# Work board',
      ),
    );
    expect(load().title).toBe('Work board');
  });
  it.each([
    '/elsewhere.md',
    'https://example.com/_views/x.md',
    '//host/_views/x.md',
    '/_views/../x.md',
    '/_views/%2e%2e/x.md',
    '/_views/a%2fb.md',
    '/_views/a%5cb.md',
    '/_views/x.md?query',
    '/_views/x.md#fragment',
    '/_views/x%.md',
    '/_views/x.md:stream',
    '/_views/x.md.',
  ])('rejects unsafe or reserved reference %s', (url) => {
    expect(() => load(url)).toThrow(
      expect.objectContaining({ code: 'INVALID_VIEW_REFERENCE' }),
    );
  });
  it.each([
    '/_views/index.md',
    '/_views/group/index.md',
    '/_views/group/../board.md',
    '/_views/group/%2e%2e/board.md',
  ])(
    'rejects reserved or traversal URL %s even when its target exists',
    (url) => {
      mkdirSync(join(root, '_views', 'group'));
      save();
      save(document, 'index.md');
      save(document, 'group/index.md');
      expect(load().title).toBe('Work board');
      expect(() => load(url)).toThrow(
        expect.objectContaining({ code: 'INVALID_VIEW_REFERENCE' }),
      );
    },
  );
  it('rejects physical directory links outside _views, including outside the Workspace', () => {
    const elsewhere = join(root, 'elsewhere');
    mkdirSync(elsewhere);
    writeFileSync(join(elsewhere, 'board.md'), document);
    symlinkSync(elsewhere, join(root, '_views', 'linked'), 'junction');
    expect(() => load('/_views/linked/board.md')).toThrow(/outside/u);
    const outside = mkdtempSync(join(tmpdir(), 'owf-view-outside-'));
    try {
      writeFileSync(join(outside, 'board.md'), document);
      symlinkSync(outside, join(root, '_views', 'external'), 'junction');
      expect(() => load('/_views/external/board.md')).toThrow(/outside/u);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
