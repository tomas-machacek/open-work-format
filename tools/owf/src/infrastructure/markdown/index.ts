import { isMap, isScalar, parseDocument, stringify } from 'yaml';
import { z } from 'zod';
import type { WorkspaceDocuments } from '../../application/ports/index.js';
import { WorkspaceError } from '../../domain/workspaces/index.js';
import { workspaceGuide } from './agents.js';
import { literal } from './literal.js';
export { contextDocuments } from './contexts.js';

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

export const workspaceDocuments: WorkspaceDocuments = {
  parse(content, path) {
    const lines = content.replace(/^\uFEFF/u, '').split(/\r?\n/u);
    if (lines[0] !== '---') return undefined;
    const end = lines.findIndex(
      (line, index) => index > 0 && (line === '---' || line === '...'),
    );
    const invalid = () =>
      new WorkspaceError('INVALID_WORKSPACE', `Invalid frontmatter: ${path}`);
    const document = parseDocument(
      lines.slice(1, end < 0 ? undefined : end).join('\n'),
      {
        uniqueKeys: true,
      },
    );
    // A clearly declared work context is not a Workspace, even if its other
    // metadata is damaged. Owner validation belongs to the selected use case.
    // Ambiguous declarations and actual Workspaces still fail closed below.
    if (isMap(document.contents)) {
      const declarations = document.contents.items.filter(
        (pair) => isScalar(pair.key) && pair.key.value === 'type',
      );
      const type =
        declarations.length === 1 ? declarations[0]?.value : undefined;
      if (
        isScalar(type) &&
        !type.tag &&
        (type.value === 'OWF Project' || type.value === 'OWF Outcome')
      )
        return undefined;
    }
    if (end < 0) throw invalid();
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
      agents: workspaceGuide,
      readme: `---\n${stringify(metadata)}---\n\n# ${literal(title)}\n`,
      index: '# Index\n\n- [Workspace](README.md)\n- [Event log](log.md)\n',
      log: `# Log\n\n## ${date}\n\n- Initialized Workspace ${literal(title)}.\n`,
    };
  },
};
