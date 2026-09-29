import { ownerType } from '../../domain/contexts/index.js';
import { isSelectableActionOwner } from '../../domain/actions/index.js';
import { WorkspaceError } from '../../domain/workspaces/index.js';
import type { OwnerDiscoveryPorts } from '../ports/index.js';
import { discoverWorkspaceMetadata } from '../workspaces/index.js';

export interface AvailableOwner {
  url: string;
  type: 'workspace' | 'project' | 'outcome';
  title: string;
  hierarchy: string;
}

export function listOwners(start: string, ports: OwnerDiscoveryPorts) {
  try {
    const { contexts, contextDocuments, ownerFiles } = ports;
    // Discovery reads Markdown only, including a regular (non-link) root README.
    const workspace = discoverWorkspaceMetadata(start, {
      ...ports,
      files: { ...ports.files, readReadme: (path) => contexts.readOwner(path) },
    });
    if (!workspace) throw new Error('Enter an initialized Workspace first.');
    const {
      root,
      metadata: { title },
    } = workspace;
    const owners: AvailableOwner[] = [];
    function visit(parent: string[], titles: string[]) {
      for (const name of ownerFiles.children(root, parent)) {
        if (name.startsWith('_')) continue;
        const parts = [...parent, name];
        const path = contexts.directory(root, parts);
        const text = contexts.readOwner(path);
        const metadata =
          text === undefined ? undefined : contextDocuments.parse(text);
        // Ordinary folders do not establish an OWF containment chain.
        if (!metadata) continue;
        const type = ownerType(parts);
        if (!isSelectableActionOwner(metadata, type)) continue;
        const url = contexts.url(parts);
        contexts.decodeOwner(url);
        owners.push({
          url,
          type,
          title: metadata.title,
          hierarchy: titles.join(' / '),
        });
        visit(parts, [...titles, metadata.title]);
      }
    }
    visit(['_projects'], [title]);
    const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    owners.sort(
      (a, b) =>
        compare(a.title.toLowerCase(), b.title.toLowerCase()) ||
        compare(a.url, b.url),
    );
    return {
      root,
      owners: [
        { url: '/', type: 'workspace' as const, title, hierarchy: 'Workspace' },
        ...owners,
      ],
    };
  } catch (error) {
    throw new WorkspaceError(
      'OWNER_DISCOVERY_FAILED',
      `Unable to read owners: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
