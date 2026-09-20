import { parseDocument, stringify } from 'yaml';
import { z } from 'zod';
import type { WorkspaceDocuments } from '../../application/ports/index.js';
import { WorkspaceError } from '../../domain/workspaces/index.js';

const metadataSchema = z.object({
  type: z.literal('OWF Workspace'),
  title: z.string(),
  owf: z
    .object({
      version: z.string(),
      storage: z.object({ operational: z.object({ url: z.string() }) }),
    })
    .passthrough(),
});

function literal(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+.!|>~<&]/gu, (character) =>
    character === '&' ? '&amp;' : character === '<' ? '&lt;' : `\\${character}`,
  );
}

export const workspaceDocuments: WorkspaceDocuments = {
  parse(content, path) {
    const lines = content.replace(/^\uFEFF/u, '').split(/\r?\n/u);
    if (lines[0] !== '---') return undefined;
    const end = lines.findIndex(
      (line, index) => index > 0 && (line === '---' || line === '...'),
    );
    const invalid = () =>
      new WorkspaceError('INVALID_WORKSPACE', `Invalid frontmatter: ${path}`);
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
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      throw invalid();
    if (!('type' in value) || value.type !== 'OWF Workspace') return undefined;
    const parsed = metadataSchema.safeParse(value);
    if (!parsed.success) throw invalid();
    return {
      title: parsed.data.title,
      version: parsed.data.owf.version,
      storageUrl: parsed.data.owf.storage.operational.url,
      hasState: 'state' in parsed.data.owf,
    };
  },
  render(title, date) {
    const metadata = {
      type: 'OWF Workspace',
      title,
      owf: { version: '0.1', storage: { operational: { url: './_store/' } } },
    };
    return {
      readme: `---\n${stringify(metadata)}---\n\n# ${literal(title)}\n`,
      index: '# Index\n\n- [Workspace](README.md)\n- [Event log](log.md)\n',
      log: `# Log\n\n## ${date}\n\n- Initialized Workspace ${literal(title)}.\n`,
    };
  },
};
