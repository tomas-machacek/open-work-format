export type ErrorCode =
  | 'INVALID_ARGUMENT'
  | 'INVALID_TITLE'
  | 'PATH_CONFLICT'
  | 'INVALID_WORKSPACE'
  | 'UNSUPPORTED_PROFILE'
  | 'STORE_UNAVAILABLE'
  | 'INVALID_STORE'
  | 'UNSUPPORTED_STORAGE'
  | 'UNSUPPORTED_STORE_VERSION'
  | 'INITIALIZATION_FAILED';

export class WorkspaceError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WorkspaceError';
  }
}

export function validateTitle(value: string): string {
  if (!value.trim() || /[\r\n\u0085\u2028\u2029]/u.test(value)) {
    throw new WorkspaceError(
      'INVALID_TITLE',
      'Title must be nonempty and contain no line breaks.',
    );
  }
  return value.trim();
}

export interface WorkspaceMetadata {
  title: string;
  version: string;
  storageUrl: string;
  hasState: boolean;
}

export function validateMetadata(metadata: WorkspaceMetadata): void {
  if (metadata.hasState)
    throw new WorkspaceError(
      'INVALID_WORKSPACE',
      'A Workspace cannot have a work state.',
    );
  try {
    validateTitle(metadata.title);
  } catch {
    throw new WorkspaceError(
      'INVALID_WORKSPACE',
      'Workspace title is invalid.',
    );
  }
  if (metadata.version !== '0.1')
    throw new WorkspaceError(
      'UNSUPPORTED_PROFILE',
      `Unsupported profile: ${metadata.version}`,
    );
  if (!metadata.storageUrl.trim())
    throw new WorkspaceError(
      'INVALID_WORKSPACE',
      'Operational storage location is required.',
    );
}
