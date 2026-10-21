import { actionStates, type ActionState } from '../actions/index.js';
import { validateTitle, WorkspaceError } from '../workspaces/index.js';

export type ViewState = ActionState;
export interface MarkdownObjectReference {
  url: string;
  id?: string;
}
export interface ViewInstance {
  id: string;
  title: string;
  definition: MarkdownObjectReference;
  created_at: string;
}
export type ViewColumn =
  | {
      id: string;
      title: string;
      type: 'status';
      status: ViewState[];
      default_status: ViewState;
      include_blocked: boolean;
    }
  | { id: string; title: string; type: 'blocked' };
export interface ViewDefinition {
  title: string;
  id?: string;
  purpose?: string;
  renderer: 'kanban';
  columns: ViewColumn[];
  defaults: Partial<Record<ViewState, string>>;
}

function invalid(field: string): never {
  throw new WorkspaceError(
    'INVALID_VIEW_DEFINITION',
    `Invalid View definition field: ${field}.`,
  );
}
function object(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    invalid(field);
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) invalid(field);
  return value;
}
function title(value: unknown, field: string): string {
  const result = text(value, field);
  try {
    return validateTitle(result);
  } catch {
    return invalid(field);
  }
}
function keys(
  value: Record<string, unknown>,
  allowed: string[],
  field: string,
): void {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) invalid(`${field}.${key}`);
}
function state(value: unknown, field: string): ViewState {
  if (!actionStates.some((candidate) => candidate === value)) invalid(field);
  return value as ViewState;
}

export function validateViewDefinition(metadata: unknown): ViewDefinition {
  const document = object(metadata, 'document');
  if (document.type !== 'OWF View Definition') invalid('type');
  const config = object(document.owf, 'owf');
  keys(config, ['id', 'purpose', 'renderer', 'columns', 'defaults'], 'owf');
  if (config.renderer !== 'kanban') invalid('owf.renderer');
  if (!Array.isArray(config.columns)) invalid('owf.columns');
  const ids = new Set<string>();
  let blocked = false;
  const columns: ViewColumn[] = config.columns.map(
    (value: unknown, index: number) => {
      const field = `owf.columns[${index}]`;
      const column = object(value, field);
      const id = text(column.id, `${field}.id`);
      if (ids.has(id)) invalid(`${field}.id (duplicate ${id})`);
      ids.add(id);
      const name = title(column.title, `${field}.title`);
      if (column.type === 'blocked') {
        keys(column, ['id', 'title', 'type'], field);
        if (blocked) invalid(`${field}.type (second blocked column)`);
        blocked = true;
        return { id, title: name, type: 'blocked' };
      }
      keys(
        column,
        ['id', 'title', 'type', 'status', 'default_status', 'include_blocked'],
        field,
      );
      if (column.type !== undefined && column.type !== 'status')
        invalid(`${field}.type`);
      const status = (
        Array.isArray(column.status) ? column.status : [column.status]
      ).map((value: unknown) => state(value, `${field}.status`));
      if (!status.length || new Set(status).size !== status.length)
        invalid(`${field}.status`);
      const defaultStatus =
        'default_status' in column
          ? state(column.default_status, `${field}.default_status`)
          : status[0]!;
      if (!status.includes(defaultStatus)) invalid(`${field}.default_status`);
      if (
        'include_blocked' in column &&
        typeof column.include_blocked !== 'boolean'
      )
        invalid(`${field}.include_blocked`);
      return {
        id,
        title: name,
        type: 'status',
        status,
        default_status: defaultStatus,
        include_blocked: column.include_blocked === true,
      };
    },
  );
  const defaults: Partial<Record<ViewState, string>> = {};
  for (const column of columns)
    if (column.type === 'status')
      for (const value of column.status) defaults[value] ??= column.id;
  if ('defaults' in config)
    for (const [key, value] of Object.entries(
      object(config.defaults, 'owf.defaults'),
    )) {
      const valueState = state(key, `owf.defaults.${key}`);
      const target = columns.find((column) => column.id === value);
      if (
        !target ||
        target.type !== 'status' ||
        !target.status.includes(valueState)
      )
        invalid(`owf.defaults.${key}`);
      defaults[valueState] = target.id;
    }
  return {
    title: title(document.title, 'title'),
    renderer: 'kanban',
    columns,
    defaults,
    ...('id' in config ? { id: text(config.id, 'owf.id') } : {}),
    ...('purpose' in config
      ? { purpose: text(config.purpose, 'owf.purpose') }
      : {}),
  };
}

export function validateViewInstance(value: unknown): ViewInstance {
  try {
    const row = object(value, 'instance');
    keys(row, ['id', 'title', 'definition', 'created_at'], 'instance');
    const id = text(row.id, 'id');
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
        id,
      )
    )
      invalid('id');
    const name = title(row.title, 'title');
    if (name !== row.title) invalid('title');
    const reference = object(row.definition, 'definition');
    keys(reference, ['url', 'id'], 'definition');
    const url = text(reference.url, 'definition.url');
    if (!url.startsWith('/_views/') || /[\\?#\s]/u.test(url))
      invalid('definition.url');
    const parts = url
      .slice(1)
      .split('/')
      .map((part) => decodeURIComponent(part));
    if (
      !parts.at(-1)!.endsWith('.md') ||
      parts.at(-1)!.toLowerCase() === 'index.md'
    )
      invalid('definition.url');
    for (const decoded of parts) {
      if (
        !decoded ||
        decoded === '.' ||
        decoded === '..' ||
        /[/\\:<>"|?*]/u.test(decoded) ||
        /[. ]$/u.test(decoded) ||
        [...decoded].some(
          (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
        )
      )
        invalid('definition.url');
    }
    const created = text(row.created_at, 'created_at');
    // eslint-disable-next-line no-restricted-globals -- Parse supplied data without reading the clock.
    const timestamp = Date.parse(created);
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(created) ||
      !Number.isFinite(timestamp) ||
      // eslint-disable-next-line no-restricted-globals -- Round-trip supplied data to reject impossible calendar dates.
      new Date(timestamp).toISOString().slice(0, 19) !== created.slice(0, 19)
    )
      invalid('created_at');
    return {
      id,
      title: name,
      definition: {
        url,
        ...('id' in reference
          ? { id: text(reference.id, 'definition.id') }
          : {}),
      },
      created_at: created,
    };
  } catch {
    throw new WorkspaceError(
      'VIEW_READ_FAILED',
      'Invalid stored View instance data. Check store integrity.',
    );
  }
}
