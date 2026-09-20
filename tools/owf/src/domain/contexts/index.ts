import { validateTitle, WorkspaceError } from '../workspaces/index.js';

export type ContextType = 'project' | 'outcome';
export interface ContextInput {
  type: ContextType;
  title: string;
  slug?: string | undefined;
  owner?: string | undefined;
  expectedResult?: string | undefined;
}
export interface ContextMetadata {
  type: string;
  title: string;
  state: string;
  parkingReason?: unknown;
  reviewAfter?: unknown;
  archivedFrom?: unknown;
  expectedResult: string;
}

export function validateSlug(value: string): string {
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value) ||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/u.test(value)
  ) {
    throw new WorkspaceError(
      'INVALID_SLUG',
      'Use a portable lowercase slug (a-z, 0-9, hyphens), excluding device and infrastructure names; supply --slug if needed.',
    );
  }
  return value;
}

export function prepareContext(input: ContextInput) {
  if (
    input.type === 'project' &&
    (input.owner !== undefined || input.expectedResult !== undefined)
  )
    throw new WorkspaceError(
      'INVALID_ARGUMENT',
      'Project does not accept owner or expected result.',
    );
  const title = validateTitle(input.title);
  const slug = validateSlug(
    input.slug ??
      title
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-|-$/gu, ''),
  );
  let expectedResult = title;
  if (input.expectedResult !== undefined) {
    try {
      expectedResult = validateTitle(input.expectedResult);
    } catch {
      throw new WorkspaceError(
        'INVALID_EXPECTED_RESULT',
        'Expected result must be nonempty single-line text.',
      );
    }
  }
  return { type: input.type, title, slug, expectedResult };
}

export function ownerType(segments: string[]): ContextType {
  if (
    segments.length < 2 ||
    segments[0] !== '_projects' ||
    segments.slice(1).some((segment) => segment.startsWith('_'))
  )
    throw new WorkspaceError(
      'INVALID_OWNER',
      'An owner must be a Project or Outcome outside archived/infrastructure paths.',
    );
  return segments.length === 2 ? 'project' : 'outcome';
}

export function validateOwner(
  metadata: ContextMetadata,
  type: ContextType,
): void {
  const invalid = () =>
    new WorkspaceError(
      'INVALID_OWNER',
      'Owner metadata does not match its location or lifecycle profile.',
    );
  try {
    validateTitle(metadata.title);
  } catch {
    throw invalid();
  }
  const terminal = type === 'project' ? 'completed' : 'achieved';
  if (
    metadata.type !== (type === 'project' ? 'OWF Project' : 'OWF Outcome') ||
    !['active', 'parked', terminal, 'abandoned'].includes(metadata.state)
  )
    throw invalid();
  if (metadata.archivedFrom !== undefined) throw invalid();
  if (metadata.state === 'parked') {
    if (
      typeof metadata.parkingReason !== 'string' ||
      !metadata.parkingReason.trim()
    )
      throw invalid();
    if (
      metadata.reviewAfter !== undefined &&
      (typeof metadata.reviewAfter !== 'string' || !metadata.reviewAfter.trim())
    )
      throw invalid();
  } else if (
    metadata.parkingReason !== undefined ||
    metadata.reviewAfter !== undefined
  )
    throw invalid();
  if (type === 'outcome' && !metadata.expectedResult.trim()) throw invalid();
}
