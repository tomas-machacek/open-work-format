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
  warnings?: { code: 'GUIDANCE_PRESERVED'; message: string }[];
}

export function discoverWorkspaceMetadata(
  start: string,
  ports: Pick<WorkspacePorts, 'files' | 'documents'>,
) {
  const { files, documents } = ports;
  let root = files.physicalDirectory(start);
  for (;;) {
    const text = files.readReadme(root);
    const metadata =
      text === undefined
        ? undefined
        : documents.parse(text, files.join(root, 'README.md'));
    if (metadata) {
      validateMetadata(metadata);
      return { root, metadata };
    }
    const parent = files.parent(root);
    if (root === parent) return undefined;
    root = parent;
  }
}

export function discoverWorkspace(
  start: string,
  ports: WorkspacePorts,
): WorkspaceResult | undefined {
  const workspace = discoverWorkspaceMetadata(start, ports);
  if (!workspace) return undefined;
  const { root, metadata } = workspace;
  const path = ports.files.resolveStore(root, metadata.storageUrl);
  ports.store.validate(path);
  return {
    status: 'already_initialized',
    root,
    title: metadata.title,
    store: path,
  };
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
  const paths = ['README.md', 'index.md', 'log.md', 'AGENTS.md', '_store'].map(
    (name) => files.join(root, name),
  );
  for (const path of paths) {
    if (files.exists(path))
      throw new WorkspaceError('PATH_CONFLICT', `Existing entry: ${path}`);
  }
  const storeDirectory = files.join(root, '_store');
  const storePath = files.join(storeDirectory, 'owf.sqlite');
  let content: ReturnType<WorkspacePorts['documents']['render']>;
  try {
    content = documents.render(title, ports.today());
  } catch (error) {
    throw initializationFailure(error, []);
  }
  const directories = ['_knowledge', '_knowledge/owf'].filter((name) => {
    const path = files.join(root, name);
    const kind = files.entryKind(path);
    if (kind !== undefined && kind !== 'directory')
      throw new WorkspaceError('PATH_CONFLICT', `Existing entry: ${path}`);
    return kind === undefined;
  });
  const warnings: NonNullable<WorkspaceResult['warnings']> = [];
  const guides = content.guides.filter(({ path: name }) => {
    const path = files.join(root, name);
    const kind = files.entryKind(path);
    if (kind === undefined) return true;
    if (kind !== 'file')
      throw new WorkspaceError('PATH_CONFLICT', `Existing entry: ${path}`);
    warnings.push({
      code: 'GUIDANCE_PRESERVED',
      message: `Preserved existing ${name}; it was not generated or refreshed. Check retained content and add navigation links manually where needed.`,
    });
    return false;
  });
  const owned: { path: string; directory: boolean }[] = [];
  const write = (name: string, content: string) => {
    const path = files.join(root, name);
    files.createFile(path, content, () =>
      owned.push({ path, directory: false }),
    );
  };
  try {
    files.createDirectory(storeDirectory);
    owned.push({ path: storeDirectory, directory: true });
    files.reserveFile(storePath, () =>
      owned.push({ path: storePath, directory: false }),
    );
    store.initializeReserved(storePath);
    for (const name of directories) {
      const path = files.join(root, name);
      files.createDirectory(path);
      owned.push({ path, directory: true });
    }
    for (const guide of guides) write(guide.path, guide.content);
    write('index.md', content.index);
    write('log.md', content.log);
    write('AGENTS.md', content.agents);
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
    throw initializationFailure(error, remaining);
  }
  return {
    status: 'initialized',
    root,
    title,
    store: storePath,
    ...(warnings.length ? { warnings } : {}),
  };
}

function initializationFailure(error: unknown, remaining: string[]) {
  const detail = error instanceof Error ? error.message : String(error);
  return new WorkspaceError(
    'INITIALIZATION_FAILED',
    `${detail}${remaining.length ? `; cleanup failed; manually inspect: ${remaining.join(', ')}` : '; created artifacts removed.'}`,
  );
}
