import { initializeWorkspace } from '../application/workspaces/index.js';
import {
  workspaceFiles,
  contextFiles,
} from '../infrastructure/configuration/index.js';
import {
  workspaceDocuments,
  contextDocuments,
} from '../infrastructure/markdown/index.js';
import { workspaceStore } from '../infrastructure/sqlite/index.js';
import type { WorkspacePorts } from '../application/ports/index.js';
import {
  createContext,
  type ContextInput,
} from '../application/contexts/index.js';
import type { ContextPorts } from '../application/ports/index.js';

export const workspacePorts: WorkspacePorts = {
  files: workspaceFiles,
  documents: workspaceDocuments,
  store: workspaceStore,
  today: () => new Date().toISOString().slice(0, 10),
};
export const initialize = (root: string, title?: string) =>
  initializeWorkspace(root, title, workspacePorts);
export const contextPorts: ContextPorts = {
  ...workspacePorts,
  contexts: contextFiles,
  contextDocuments,
};
export const create = (root: string, input: ContextInput) =>
  createContext(root, input, contextPorts);
