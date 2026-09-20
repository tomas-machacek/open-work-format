import {
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  openSync,
  closeSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { join, relative, sep, isAbsolute } from 'node:path';
import type { ContextFiles } from '../../application/ports/index.js';
import { WorkspaceError } from '../../domain/workspaces/index.js';

function missing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
function segments(root: string, path: string): string[] {
  const value = relative(root, path);
  if (isAbsolute(value) || value === '..' || value.startsWith(`..${sep}`))
    throw new WorkspaceError(
      'INVALID_OWNER',
      'Owner is outside the Workspace.',
    );
  return value ? value.split(sep) : [];
}
function directory(root: string, parts: string[]): string {
  let path = root;
  try {
    for (const part of parts) {
      path = join(path, part);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw new Error(
          'Owner paths must use physical directories, not links.',
        );
      segments(root, realpathSync(path));
    }
    return path;
  } catch (error) {
    throw new WorkspaceError(
      'INVALID_OWNER',
      `Cannot use directory ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export const contextFiles: ContextFiles = {
  decodeOwner(url) {
    const invalid = () =>
      new WorkspaceError(
        'INVALID_ARGUMENT',
        'Owner must be a Workspace-rooted directory URL, with no dot segments, encoded separators, query or fragment.',
      );
    if (
      !url.startsWith('/') ||
      !url.endsWith('/') ||
      url.startsWith('//') ||
      /[\\?#]/u.test(url) ||
      [...url].some((char) => char.charCodeAt(0) <= 32)
    )
      throw invalid();
    if (url === '/') return [];
    try {
      return url
        .slice(1, -1)
        .split('/')
        .map((part) => {
          const decoded = decodeURIComponent(part);
          if (
            !decoded ||
            decoded === '.' ||
            decoded === '..' ||
            /[/\\]/u.test(decoded) ||
            [...decoded].some(
              (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
            ) ||
            /[:<>"|?*]/u.test(decoded) ||
            /[. ]$/u.test(decoded)
          )
            throw invalid();
          return decoded;
        });
    } catch {
      throw invalid();
    }
  },
  segments,
  directory,
  url: (parts) =>
    parts.length
      ? `/${parts.map((part) => encodeURIComponent(part)).join('/')}/`
      : '/',
  assertNoCollision(parent, name) {
    try {
      if (
        readdirSync(parent).some(
          (entry) => entry.toLowerCase() === name.toLowerCase(),
        )
      )
        throw new WorkspaceError(
          'PATH_CONFLICT',
          `Existing entry: ${join(parent, name)}`,
        );
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      throw new WorkspaceError(
        'CREATION_FAILED',
        `Cannot inspect directory: ${parent}`,
      );
    }
  },
  readOwner(path) {
    const readme = join(path, 'README.md');
    try {
      let stat;
      try {
        stat = lstatSync(readme);
      } catch (error) {
        if (missing(error)) return undefined;
        throw error;
      }
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error('README must be a regular file.');
      return readFileSync(readme, 'utf8');
    } catch {
      throw new WorkspaceError(
        'INVALID_OWNER',
        `Cannot read owner metadata: ${readme}`,
      );
    }
  },
  appendEvent(root, event) {
    const path = join(root, 'log.md');
    const entry = `- Created ${event.type} [${event.url}](<${event.url}>).\n`;
    let exists = true;
    try {
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error('Log must be a regular file.');
    } catch (error) {
      if (missing(error)) exists = false;
      else throw error;
    }
    if (!exists) {
      const fd = openSync(path, 'wx');
      try {
        try {
          writeFileSync(fd, `# Log\n\n## ${event.date}\n\n${entry}`, 'utf8');
        } finally {
          closeSync(fd);
        }
      } catch (error) {
        try {
          unlinkSync(path);
        } catch {
          throw new Error(
            `Log creation failed; cleanup failed; manually inspect: ${path}`,
            { cause: error },
          );
        }
        throw error;
      }
      return;
    }
    // Reject lossy decoding before replacing any historical bytes.
    const text = new TextDecoder('utf-8', {
      fatal: true,
      ignoreBOM: true,
    }).decode(readFileSync(path));
    const heading = /^# Log\r?\n/u.exec(text);
    if (!heading) throw new Error('Malformed log heading.');
    let dated = false;
    for (const line of text.slice(heading[0].length).split(/\r?\n/u)) {
      if (!line.trim()) continue;
      if (/^## \d{4}-\d{2}-\d{2}$/u.test(line)) {
        dated = true;
        continue;
      }
      if (!dated || !/^- .+/u.test(line))
        throw new Error('Malformed log content.');
    }
    const firstDate = /\n## (\d{4}-\d{2}-\d{2})\r?\n/u.exec(text);
    const offset =
      firstDate?.[1] === event.date
        ? firstDate.index + firstDate[0].length
        : heading[0].length;
    const addition =
      firstDate?.[1] === event.date
        ? `\n${entry}`
        : `\n## ${event.date}\n\n${entry}`;
    // Retain existing text verbatim and insert the new semantic event newest first.
    const temporary = join(root, '.owf-log.tmp');
    const fd = openSync(temporary, 'wx');
    try {
      try {
        writeFileSync(
          fd,
          text.slice(0, offset) + addition + text.slice(offset),
          'utf8',
        );
      } finally {
        closeSync(fd);
      }
      renameSync(temporary, path);
    } catch (error) {
      try {
        unlinkSync(temporary);
      } catch {
        throw new Error(
          `Log update failed; cleanup failed; manually inspect: ${temporary}`,
          { cause: error },
        );
      }
      throw error;
    }
  },
};
