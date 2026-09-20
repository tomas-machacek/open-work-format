import { parseDocument, stringify } from 'yaml';
import { z } from 'zod';
import type { ContextDocuments } from '../../application/ports/index.js';
import { WorkspaceError } from '../../domain/workspaces/index.js';
import { literal } from './literal.js';

const schema = z.object({
  type: z.string(),
  title: z.string(),
  owf: z.object({ state: z.string() }).passthrough(),
});

function expectedResult(lines: string[]): string {
  let fence: { marker: string; length: number } | undefined;
  let collecting = false;
  const result: string[] = [];
  for (const line of lines) {
    if (fence) {
      const closing = /^ {0,3}(`+|~+)[ \t]*$/u.exec(line)?.[1];
      if (closing?.[0] === fence.marker && closing.length >= fence.length)
        fence = undefined;
      if (collecting) result.push(line);
      continue;
    }
    const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (
      opening &&
      !(opening[1]!.startsWith('`') && opening[2]!.includes('`'))
    ) {
      fence = { marker: opening[1]![0]!, length: opening[1]!.length };
      if (collecting) result.push(line);
      continue;
    }
    const heading = /^ {0,3}(#{1,2})(?:[ \t]+(.*)|[ \t]*)$/u.exec(line);
    if (heading) {
      if (collecting) break;
      const title = (heading[2] ?? '').replace(/[ \t]+#+[ \t]*$/u, '').trim();
      collecting = heading[1] === '##' && title === 'Expected Result';
    } else if (collecting) result.push(line);
  }
  return result.join('\n').trim();
}

export const contextDocuments: ContextDocuments = {
  parse(content) {
    const invalid = () =>
      new WorkspaceError(
        'INVALID_OWNER',
        'Invalid owner frontmatter or profile metadata.',
      );
    const lines = content.replace(/^\uFEFF/u, '').split(/\r?\n/u);
    const end = lines.findIndex(
      (line, index) => index > 0 && (line === '---' || line === '...'),
    );
    if (lines[0] !== '---') return undefined;
    if (end < 0) throw invalid();
    const document = parseDocument(lines.slice(1, end).join('\n'), {
      uniqueKeys: true,
    });
    if (document.errors.length || document.warnings.length) throw invalid();
    let value: unknown;
    try {
      value = document.toJS({ maxAliasCount: 100 });
    } catch {
      throw invalid();
    }
    if (typeof value !== 'object' || value === null || !('type' in value))
      throw invalid();
    if (value.type !== 'OWF Project' && value.type !== 'OWF Outcome')
      return undefined;
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw invalid();
    const metadata = parsed.data;
    return {
      type: metadata.type,
      title: metadata.title,
      state: metadata.owf.state,
      parkingReason: metadata.owf.parking_reason,
      reviewAfter: metadata.owf.review_after,
      archivedFrom: metadata.owf.archived_from,
      expectedResult: expectedResult(lines.slice(end + 1)),
    };
  },
  render(type, title, expectedResult) {
    const metadata = {
      type: type === 'project' ? 'OWF Project' : 'OWF Outcome',
      title,
      owf: { state: 'active' },
    };
    return {
      readme: `---\n${stringify(metadata)}---\n\n# ${literal(title)}\n\n${type === 'outcome' ? `## Expected Result\n\n${literal(expectedResult)}\n\n` : ''}## Status\n\n## Next Steps\n`,
      index: `# Index\n\n- [${literal(title)}](README.md)\n`,
    };
  },
  collectionIndex: (slug, title) =>
    `# Index\n\n- [${literal(title)}](${slug}/)\n`,
};
