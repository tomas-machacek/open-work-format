import type { WorkspaceMetadata } from '../../domain/workspaces/index.js';

export interface WorkspaceFiles {
  physicalDirectory(path: string): string;
  parent(path: string): string;
  basename(path: string): string;
  join(root: string, name: string): string;
  readReadme(root: string): string | undefined;
  exists(path: string): boolean;
  createDirectory(path: string): void;
  createFile(path: string, content: string, owned: () => void): void;
  reserveFile(path: string, owned: () => void): void;
  removeFile(path: string): void;
  removeDirectory(path: string): void;
  resolveStore(root: string, location: string): string;
}

export interface WorkspaceDocuments {
  parse(content: string, path: string): WorkspaceMetadata | undefined;
  render(
    title: string,
    date: string,
  ): { readme: string; index: string; log: string };
}

export interface WorkspaceStore {
  initializeReserved(path: string): void;
  validate(path: string): void;
}

export interface WorkspacePorts {
  files: WorkspaceFiles;
  documents: WorkspaceDocuments;
  store: WorkspaceStore;
  today(): string;
}
