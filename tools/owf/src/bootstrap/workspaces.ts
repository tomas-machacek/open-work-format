import {
  newActionId,
  currentTimestamp,
} from '../infrastructure/runtime/index.js';
import {
  createView as createViewUseCase,
  getView as getViewUseCase,
  listViews as listViewsUseCase,
  showView as showViewUseCase,
  displayView as displayViewUseCase,
  type CreateViewInput,
} from '../application/views/index.js';
import { viewRepository } from '../infrastructure/sqlite/index.js';
import { viewDefinitions } from '../infrastructure/markdown/index.js';
import type { ViewPorts } from '../application/ports/index.js';
import { actionRepository } from '../infrastructure/sqlite/index.js';
import {
  createAction as createActionUseCase,
  getAction as getActionUseCase,
  listActions as listActionsUseCase,
  setAction as setActionUseCase,
  type SetActionInput,
  type ExpectedActionSnapshot,
  type ListActionsInput,
  type ActionInput,
} from '../application/actions/index.js';
import type { ActionPorts } from '../application/ports/index.js';
import { initializeWorkspace } from '../application/workspaces/index.js';
import {
  workspaceFiles,
  contextFiles,
  ownerFiles,
} from '../infrastructure/configuration/index.js';
import { listOwners as listOwnersUseCase } from '../application/owners/index.js';
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
export const viewPorts: ViewPorts = {
  ...workspacePorts,
  views: viewRepository,
  definitions: viewDefinitions,
  newId: newActionId,
  now: currentTimestamp,
};
export const createView = (root: string, input: CreateViewInput) =>
  createViewUseCase(root, input, viewPorts);
export const getView = (root: string, id: string) =>
  getViewUseCase(root, id, viewPorts);
export const listViews = (root: string) => listViewsUseCase(root, viewPorts);
export const showView = (root: string, id: string) =>
  showViewUseCase(root, id, { ...viewPorts, actions: actionRepository });
export const displayView = (root: string, id: string) =>
  displayViewUseCase(root, id, { ...viewPorts, actions: actionRepository });
export const contextPorts: ContextPorts = {
  ...workspacePorts,
  contexts: contextFiles,
  contextDocuments,
};
export const create = (root: string, input: ContextInput) =>
  createContext(root, input, contextPorts);
export const listOwners = (root: string) =>
  listOwnersUseCase(root, { ...contextPorts, ownerFiles });

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
export const setAction = (
  root: string,
  identifier: string,
  input: SetActionInput,
  expected?: ExpectedActionSnapshot,
) => setActionUseCase(root, identifier, input, actionPorts, expected);
