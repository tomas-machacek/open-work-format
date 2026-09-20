import {
  ownerType,
  prepareContext,
  validateOwner,
  type ContextInput,
} from '../../domain/contexts/index.js';
import { WorkspaceError } from '../../domain/workspaces/index.js';
import type { ContextPorts } from '../ports/index.js';
import { discoverWorkspace } from '../workspaces/index.js';

export type { ContextInput } from '../../domain/contexts/index.js';
export interface CreateResult {
  result: {
    status: 'created';
    type: 'project' | 'outcome';
    title: string;
    root: string;
    url: string;
    path: string;
    owner: string;
  };
  warnings: { code: 'LOG_WRITE_FAILED'; message: string }[];
}

export function createContext(
  start: string,
  input: ContextInput,
  ports: ContextPorts,
): CreateResult {
  const value = prepareContext(input);
  const { files, contexts, contextDocuments: documents } = ports;
  // Syntax validation deliberately precedes discovery and any filesystem access.
  const explicit =
    input.owner === undefined ? undefined : contexts.decodeOwner(input.owner);
  const workspace = discoverWorkspace(start, ports);
  if (!workspace)
    throw new WorkspaceError(
      'WORKSPACE_NOT_FOUND',
      'Enter an initialized Workspace first.',
    );
  const root = workspace.root;
  let owner: string[] = [];
  if (value.type === 'outcome') {
    if (explicit !== undefined) owner = explicit;
    else {
      let candidate = files.physicalDirectory(start);
      while (candidate !== root) {
        const segments = contexts.segments(root, candidate);
        const text = contexts.readOwner(candidate);
        if (text !== undefined && documents.parse(text) !== undefined) {
          // Ordinary documentation is not an owner; malformed claimed owners must fail.
          owner = segments;
          break;
        }
        candidate = files.parent(candidate);
      }
      if (!owner.length)
        throw new WorkspaceError(
          'OWNER_REQUIRED',
          'Supply --owner or enter a Project or Outcome context.',
        );
    }
    ownerType(owner);
    for (let length = 2; length <= owner.length; length++) {
      const segments = owner.slice(0, length);
      const path = contexts.directory(root, segments);
      const text = contexts.readOwner(path);
      if (text === undefined)
        throw new WorkspaceError(
          'INVALID_OWNER',
          `Missing owner README: ${path}`,
        );
      const metadata = documents.parse(text);
      if (!metadata)
        throw new WorkspaceError(
          'INVALID_OWNER',
          `Not a Project or Outcome: ${path}`,
        );
      validateOwner(metadata, ownerType(segments));
    }
  }
  const parentSegments = value.type === 'project' ? ['_projects'] : owner;
  const parent = files.join(root, parentSegments.join('/'));
  const createCollection = value.type === 'project' && !files.exists(parent);
  if (createCollection) contexts.assertNoCollision(root, '_projects');
  else contexts.directory(root, parentSegments);
  if (!createCollection) contexts.assertNoCollision(parent, value.slug);
  const path = files.join(parent, value.slug);
  const url = contexts.url([...parentSegments, value.slug]);
  const content = documents.render(
    value.type,
    value.title,
    value.expectedResult,
  );
  const owned: { path: string; directory: boolean }[] = [];
  const directory = (path: string) => {
    files.createDirectory(path);
    owned.push({ path, directory: true });
  };
  const write = (path: string, content: string) =>
    files.createFile(path, content, () =>
      owned.push({ path, directory: false }),
    );
  try {
    if (createCollection) {
      directory(parent);
      write(
        files.join(parent, 'index.md'),
        documents.collectionIndex(value.slug, value.title),
      );
    }
    directory(path);
    write(files.join(path, 'README.md'), content.readme);
    write(files.join(path, 'index.md'), content.index);
  } catch (error) {
    const remaining: string[] = [];
    for (const artifact of owned.reverse()) {
      try {
        if (artifact.directory) files.removeDirectory(artifact.path);
        else files.removeFile(artifact.path);
      } catch {
        remaining.push(artifact.path);
      }
    }
    throw new WorkspaceError(
      'CREATION_FAILED',
      `${error instanceof Error ? error.message : String(error)}${remaining.length ? `; cleanup failed; manually inspect: ${remaining.join(', ')}` : '; created artifacts removed.'}`,
    );
  }
  const warnings: CreateResult['warnings'] = [];
  try {
    contexts.appendEvent(root, { date: ports.today(), type: value.type, url });
  } catch (error) {
    warnings.push({
      code: 'LOG_WRITE_FAILED',
      message: `Created ${url}, but could not update log.md: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  return {
    result: {
      status: 'created',
      type: value.type,
      title: value.title,
      root,
      url,
      path,
      owner: contexts.url(owner),
    },
    warnings,
  };
}
