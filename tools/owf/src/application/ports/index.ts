import type { WorkspaceMetadata } from '../../domain/workspaces/index.js';
import type {
  MarkdownObjectReference,
  ViewDefinition,
  ViewInstance,
  ViewPlacement,
  ViewOrder,
} from '../../domain/views/index.js';

export interface ViewRepository {
  delete(path: string, id: string, time: string): { id: string; title: string };
  create(
    path: string,
    view: ViewInstance,
    initialOrder?: (actions: ActionProjection[]) => ViewOrder[],
  ): void;
  get(path: string, id: string): ViewInstance | undefined;
  list(path: string): ViewInstance[];
  // Actions, prerequisite projections, placements and order share one read snapshot.
  evaluation(path: string, viewId: string): ViewEvaluationSnapshot;
}
export interface ViewPorts extends WorkspacePorts {
  views: ViewRepository;
  definitions: {
    load(root: string, reference: MarkdownObjectReference): ViewDefinition;
  };
  newId(): string;
  now(): string;
}
import type {
  Action,
  ActionState,
  ActionProjection,
} from '../../domain/actions/index.js';

export interface ActionRepository {
  delete(
    path: string,
    id: string,
    time: string,
    validate: (target: Action, actions: Action[]) => void,
    cleanup: (organization: ViewOrganization) => ViewOrganization,
  ): { id: string; title: string };
  create(
    path: string,
    action: Action,
    organizationChange?: ViewOrganizationChange,
  ): void;
  get(path: string, id: string): ActionProjection | undefined;
  list(
    path: string,
    filter?: { owner?: string; recursive?: boolean; states?: ActionState[] },
  ): ActionProjection[];
  update(
    path: string,
    id: string,
    // Runs once on a validated record inside the write transaction; do not mutate current.
    change: (
      current: Action,
      target: (id: string) => Action | undefined,
      snapshot: ViewWriteSnapshot,
    ) => Action,
    organizationChange?: ViewOrganizationChange,
    eventTime?: string,
  ): { action: ActionProjection; changed: boolean };
}
export interface ActionPorts extends ContextPorts {
  actions: ActionRepository;
  definitions: ViewPorts['definitions'];
  newId(): string;
  now(): string;
}
export interface ViewOrganization {
  placements: ViewPlacement[];
  order: ViewOrder[];
}
export interface ViewEvaluationSnapshot extends ViewOrganization {
  actions: ActionProjection[];
}
export type ViewOrganizationChange = (
  snapshot: ViewWriteSnapshot,
  after: ActionProjection[],
) => ViewOrganization;
export interface ViewWriteSnapshot extends ViewOrganization {
  actions: ActionProjection[];
  views: ViewInstance[];
}
export interface ViewMovePorts extends ViewPorts {
  actions: ActionRepository;
}
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

export interface OwnerDiscoveryFiles {
  children(root: string, segments: string[]): string[];
}
export interface OwnerDiscoveryPorts extends ContextPorts {
  ownerFiles: OwnerDiscoveryFiles;
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
