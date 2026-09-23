import {
  newActionId,
  currentTimestamp,
} from '../infrastructure/runtime/index.js';
import { actionRepository } from '../infrastructure/sqlite/index.js';
import {
  createAction as createActionUseCase,
  getAction as getActionUseCase,
  listActions as listActionsUseCase,
  type ListActionsInput,
  type ActionInput,
} from '../application/actions/index.js';
import type { ActionPorts } from '../application/ports/index.js';
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

export const actionPorts: ActionPorts = {
  ...contextPorts,
  actions: actionRepository,
  newId: newActionId,
  now: currentTimestamp,
};
export const createAction = (root: string, input: ActionInput) =>
  createActionUseCase(root, input, actionPorts);
export const getAction = (root: string, identifier: string) =>
  getActionUseCase(root, identifier, actionPorts);
export const listActions = (root: string, input: ListActionsInput = {}) =>
  listActionsUseCase(root, input, actionPorts);
