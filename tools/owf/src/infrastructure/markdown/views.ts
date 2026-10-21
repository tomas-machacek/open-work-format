import { readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, sep, isAbsolute, basename } from 'node:path';
import { parseDocument, visit } from 'yaml';
import {
  validateViewDefinition,
  type MarkdownObjectReference,
  type ViewDefinition,
} from '../../domain/views/index.js';
import { WorkspaceError } from '../../domain/workspaces/index.js';

function headings(lines: string[]): string[] {
  const result: string[] = [];
  let fence: { marker: string; length: number } | undefined;
  let comment = false;
  let rawBlock: string | undefined;
  let previous = '';
  for (const raw of lines) {
    let line = raw;
    if (rawBlock) {
      if (line.toLowerCase().includes(`</${rawBlock}>`)) rawBlock = undefined;
      continue;
    }
    if (fence) {
      const closing = /^ {0,3}(`+|~+)[ \t]*$/u.exec(line)?.[1];
      if (closing?.[0] === fence.marker && closing.length >= fence.length)
        fence = undefined;
      continue;
    }
    if (comment) {
      const end = line.indexOf('-->');
      if (end < 0) continue;
      line = line.slice(end + 3);
      comment = false;
    }
    line = line.replace(/<!--.*?-->/gu, '');
    const start = line.indexOf('<!--');
    if (start >= 0) {
      line = line.slice(0, start);
      comment = true;
    }
    const rawOpening = /^ {0,3}<(pre|script|style|textarea)(?:\s|>|$)/iu
      .exec(line)?.[1]
      ?.toLowerCase();
    if (rawOpening) {
      if (!line.toLowerCase().includes(`</${rawOpening}>`))
        rawBlock = rawOpening;
      previous = '';
      continue;
    }
    const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (
      opening &&
      !(opening[1]!.startsWith('`') && opening[2]!.includes('`'))
    ) {
      fence = { marker: opening[1]![0]!, length: opening[1]!.length };
      previous = '';
      continue;
    }
    const atx = /^ {0,3}#(?:[ \t]+(.*)|[ \t]*)$/u.exec(line);
    if (atx) result.push((atx[1] ?? '').replace(/[ \t]+#+[ \t]*$/u, '').trim());
    else if (/^ {0,3}=+[ \t]*$/u.test(line) && previous) result.push(previous);
    previous =
      !atx && !/^(?: {4}|\t| {0,3}[>#])/u.test(line) ? line.trim() : '';
  }
  return result;
}

function normalizedTitle(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/\\([\p{P}\p{S}])/gu, '$1')
    .replace(/[*_`]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLocaleLowerCase();
}

export const viewDefinitions = {
  load(root: string, reference: MarkdownObjectReference): ViewDefinition {
    const invalidReference = (message: string) =>
      new WorkspaceError(
        'INVALID_VIEW_REFERENCE',
        `${reference.url}: ${message}`,
      );
    const invalidDefinition = (message: string) =>
      new WorkspaceError(
        'INVALID_VIEW_DEFINITION',
        `${reference.url}: ${message}`,
      );
    let parts: string[];
    try {
      if (
        !reference.url.startsWith('/_views/') ||
        /[\\?#\s]/u.test(reference.url)
      )
        throw invalidReference(
          'Expected a Workspace-rooted definition URL under /_views/.',
        );
      parts = reference.url
        .slice(1)
        .split('/')
        .map((part) => {
          const decoded = decodeURIComponent(part);
          if (
            !decoded ||
            decoded === '.' ||
            decoded === '..' ||
            /[/\\:<>"|?*]/u.test(decoded) ||
            /[. ]$/u.test(decoded) ||
            [...decoded].some(
              (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
            )
          )
            throw invalidReference('Invalid URL path segment.');
          return decoded;
        });
      if (
        !parts.at(-1)!.endsWith('.md') ||
        parts.at(-1)!.toLowerCase() === 'index.md'
      )
        throw invalidReference(
          'Expected a Markdown definition, not a navigation index.',
        );
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      throw invalidReference('Invalid URL encoding.');
    }
    let content: string;
    try {
      const realRoot = realpathSync(root);
      const target = realpathSync(join(root, ...parts));
      const inside = relative(join(realRoot, '_views'), target);
      if (
        !inside ||
        isAbsolute(inside) ||
        inside === '..' ||
        inside.startsWith(`..${sep}`)
      )
        throw invalidReference(
          'Definition target is outside the Workspace _views directory.',
        );
      if (
        basename(target).toLowerCase() === 'index.md' ||
        !target.endsWith('.md') ||
        !statSync(target).isFile()
      )
        throw invalidReference('Target is not a regular Markdown definition.');
      content = new TextDecoder('utf-8', { fatal: true }).decode(
        readFileSync(target),
      );
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      throw invalidDefinition(
        `Cannot read definition: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const lines = content.replace(/^\uFEFF/u, '').split(/\r?\n/u);
    const end = lines.findIndex(
      (line, index) => index > 0 && (line === '---' || line === '...'),
    );
    if (lines[0] !== '---' || end < 0)
      throw invalidDefinition('A YAML frontmatter envelope is required.');
    let definition: ViewDefinition;
    try {
      const document = parseDocument(lines.slice(1, end).join('\n'), {
        uniqueKeys: true,
      });
      if (document.errors.length || document.warnings.length)
        throw new Error('Malformed or ambiguous YAML.');
      visit(document, {
        Node(_key, node) {
          if (
            'tag' in node &&
            node.tag &&
            !node.tag.startsWith('tag:yaml.org,2002:')
          )
            throw new Error('Custom YAML tags are forbidden.');
        },
      });
      definition = validateViewDefinition(
        document.toJS({ maxAliasCount: 100 }),
      );
    } catch (error) {
      throw invalidDefinition(
        error instanceof Error ? error.message : String(error),
      );
    }
    const h1 = headings(lines.slice(end + 1));
    if (
      h1.length !== 1 ||
      normalizedTitle(h1[0]!) !== normalizedTitle(definition.title)
    )
      throw invalidDefinition(
        'Exactly one document H1 corresponding to title is required.',
      );
    if (reference.id !== undefined && reference.id !== definition.id)
      throw invalidReference(
        'Stored definition ID does not match the document owf.id.',
      );
    return definition;
  },
};
