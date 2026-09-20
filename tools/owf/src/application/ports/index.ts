import type { WorkspaceMetadata } from '../../domain/workspaces/index.js';
import type {
  ContextMetadata,
  ContextType,
} from '../../domain/contexts/index.js';

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
  ): { readme: string; index: string; log: string; agents: string };
}

export interface ContextFiles {
  decodeOwner(url: string): string[];
  segments(root: string, path: string): string[];
  directory(root: string, segments: string[]): string;
  url(segments: string[]): string;
  assertNoCollision(parent: string, name: string): void;
  readOwner(path: string): string | undefined;
  appendEvent(
    root: string,
    event: { date: string; type: ContextType; url: string },
  ): void;
}

export interface ContextDocuments {
  parse(content: string): ContextMetadata | undefined;
  render(
    type: ContextType,
    title: string,
    expectedResult: string,
  ): { readme: string; index: string };
  collectionIndex(slug: string, title: string): string;
}

export interface ContextPorts extends WorkspacePorts {
  contexts: ContextFiles;
  contextDocuments: ContextDocuments;
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
