import {
  validateMetadata,
  validateTitle,
  WorkspaceError,
} from '../../domain/workspaces/index.js';
import type { WorkspacePorts } from '../ports/index.js';

export { WorkspaceError } from '../../domain/workspaces/index.js';
export interface WorkspaceResult {
  status: 'initialized' | 'already_initialized';
  root: string;
  title: string;
  store: string;
}

export function discoverWorkspace(
  start: string,
  ports: WorkspacePorts,
): WorkspaceResult | undefined {
  const { files, documents, store } = ports;
  let root = files.physicalDirectory(start);
  for (;;) {
    const text = files.readReadme(root);
    const metadata =
      text === undefined
        ? undefined
        : documents.parse(text, files.join(root, 'README.md'));
    if (metadata) {
      validateMetadata(metadata);
      const path = files.resolveStore(root, metadata.storageUrl);
      store.validate(path);
      return {
        status: 'already_initialized',
        root,
        title: metadata.title,
        store: path,
      };
    }
    const parent = files.parent(root);
    if (root === parent) return undefined;
    root = parent;
  }
}

export function initializeWorkspace(
  start: string,
  title: string | undefined,
  ports: WorkspacePorts,
): WorkspaceResult {
  if (title !== undefined) title = validateTitle(title);
  const existing = discoverWorkspace(start, ports);
  if (existing) return existing;
  const { files, documents, store } = ports;
  const root = files.physicalDirectory(start);
  title = validateTitle(title ?? files.basename(root));
  const paths = ['README.md', 'index.md', 'log.md', '_store'].map((name) =>
    files.join(root, name),
  );
  for (const path of paths) {
    if (files.exists(path))
      throw new WorkspaceError('PATH_CONFLICT', `Existing entry: ${path}`);
  }
  const storeDirectory = files.join(root, '_store');
  const storePath = files.join(storeDirectory, 'owf.sqlite');
  const owned: { path: string; directory: boolean }[] = [];
  const write = (name: string, content: string) => {
    const path = files.join(root, name);
    files.createFile(path, content, () =>
      owned.push({ path, directory: false }),
    );
  };
  try {
    const content = documents.render(title, ports.today());
    files.createDirectory(storeDirectory);
    owned.push({ path: storeDirectory, directory: true });
    files.reserveFile(storePath, () =>
      owned.push({ path: storePath, directory: false }),
    );
    store.initializeReserved(storePath);
    write('index.md', content.index);
    write('log.md', content.log);
    write('README.md', content.readme);
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
    const detail = error instanceof Error ? error.message : String(error);
    throw new WorkspaceError(
      'INITIALIZATION_FAILED',
      `${detail}${remaining.length ? `; cleanup failed; manually inspect: ${remaining.join(', ')}` : '; created artifacts removed.'}`,
    );
  }
  return { status: 'initialized', root, title, store: storePath };
}
