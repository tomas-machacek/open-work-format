import { initializeWorkspace } from '../application/workspaces/index.js';
import { workspaceFiles } from '../infrastructure/configuration/index.js';
import { workspaceDocuments } from '../infrastructure/markdown/index.js';
import { workspaceStore } from '../infrastructure/sqlite/index.js';
import type { WorkspacePorts } from '../application/ports/index.js';

export const workspacePorts: WorkspacePorts = {
  files: workspaceFiles,
  documents: workspaceDocuments,
  store: workspaceStore,
  today: () => new Date().toISOString().slice(0, 10),
};
export const initialize = (root: string, title?: string) =>
  initializeWorkspace(root, title, workspacePorts);
