import {
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WorkspaceFiles } from '../../application/ports/index.js';
import { WorkspaceError } from '../../domain/workspaces/index.js';

function missing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function create(path: string, content: string, owned: () => void): void {
  const fd = openSync(path, 'wx');
  owned();
  try {
    writeFileSync(fd, content, 'utf8');
  } finally {
    closeSync(fd);
  }
}

export const workspaceFiles: WorkspaceFiles = {
  physicalDirectory(path) {
    try {
      const physical = realpathSync(path);
      if (!statSync(physical).isDirectory()) throw new Error('Not a directory');
      return physical;
    } catch {
      throw new WorkspaceError(
        'INVALID_WORKSPACE',
        `Cannot access directory: ${path}`,
      );
    }
  },
  parent: dirname,
  basename,
  join,
  readReadme(root) {
    const path = join(root, 'README.md');
    try {
      lstatSync(path);
    } catch (error) {
      if (missing(error)) return undefined;
      throw new WorkspaceError('INVALID_WORKSPACE', `Cannot inspect ${path}`);
    }
    try {
      return readFileSync(path, 'utf8');
    } catch {
      throw new WorkspaceError('INVALID_WORKSPACE', `Cannot read ${path}`);
    }
  },
  exists(path) {
    try {
      lstatSync(path);
      return true;
    } catch (error) {
      if (missing(error)) return false;
      throw new WorkspaceError(
        'PATH_CONFLICT',
        `Cannot inspect target: ${path}`,
      );
    }
  },
  createDirectory(path) {
    mkdirSync(path);
  },
  createFile: create,
  reserveFile(path, owned) {
    create(path, '', owned);
  },
  removeFile: unlinkSync,
  removeDirectory: rmdirSync,
  resolveStore(root, location) {
    let directory: string;
    try {
      if (location.startsWith('file:')) directory = fileURLToPath(location);
      else if (isAbsolute(location)) directory = location;
      else if (
        /^[a-z][a-z0-9+.-]*:/iu.test(location) ||
        location.startsWith('//')
      ) {
        throw new WorkspaceError(
          'UNSUPPORTED_STORAGE',
          `Unsupported storage: ${location}`,
        );
      } else directory = resolve(root, location);
      if (!statSync(directory).isDirectory())
        throw new Error('Storage must be a directory');
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      throw new WorkspaceError(
        'STORE_UNAVAILABLE',
        `Cannot access store directory: ${location} (Workspace ${root})`,
      );
    }
    return join(directory, 'owf.sqlite');
  },
};
