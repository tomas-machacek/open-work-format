import {
  actionStates,
  type ActionState,
  type ActionProjection,
  type Action,
  editAction,
  validateCompletion,
  projectAction,
} from '../actions/index.js';
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

export interface ViewMember {
  id: string;
  title: string;
  state: ActionState;
  blocked: boolean;
  position: number;
}
export interface EvaluatedViewColumn {
  id: string;
  title: string;
  members: ViewMember[];
}

export interface ViewPlacement {
  view_id: string;
  action_id: string;
  column_id: string;
}

export interface ViewOrder extends ViewPlacement {
  rank: number;
}

// Deletion uses stored organization only, without evaluating definitions or routing.
export function removeActionOrganization(
  id: string,
  placements: readonly ViewPlacement[],
  order: readonly ViewOrder[],
): { placements: ViewPlacement[]; order: ViewOrder[] } {
  const affected = order.filter((row) => row.action_id === id);
  const remaining = order.filter((row) => row.action_id !== id);
  return {
    placements: placements.filter((row) => row.action_id !== id),
    order: remaining.map((row) =>
      affected.some(
        (removed) =>
          removed.view_id === row.view_id &&
          removed.column_id === row.column_id,
      )
        ? {
            ...row,
            rank:
              1 +
              remaining.filter(
                (other) =>
                  other.view_id === row.view_id &&
                  other.column_id === row.column_id &&
                  other.rank < row.rank,
              ).length,
          }
        : row,
    ),
  };
}

export function viewInstanceId(value: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      value,
    )
  )
    throw new WorkspaceError(
      'INVALID_ARGUMENT',
      'Supply a stored View instance UUID v4, not a title or definition path.',
    );
  return value;
}

export function validatePosition(position: number, maximum: number): number {
  if (!Number.isSafeInteger(position) || position < 1 || position > maximum)
    throw new WorkspaceError(
      'INVALID_ARGUMENT',
      `Position must be an integer from 1 through ${maximum}.`,
    );
  return position;
}

// Dense ranks are internal current order, never historical placement or Action data.
export function recordViewOrder(
  viewId: string,
  columns: readonly EvaluatedViewColumn[],
): ViewOrder[] {
  return columns.flatMap((column) =>
    column.members.map((member, index) => ({
      view_id: viewId,
      column_id: column.id,
      action_id: member.id,
      rank: index + 1,
    })),
  );
}

export function insertViewMember(
  columns: EvaluatedViewColumn[],
  actionId: string,
  columnId: string,
  position?: number,
): number {
  const target = columns.find((column) => column.id === columnId)!;
  const member = target.members.find((member) => member.id === actionId)!;
  const remaining = target.members.filter((member) => member.id !== actionId);
  const resolved = validatePosition(
    position ?? remaining.length + 1,
    remaining.length + 1,
  );
  remaining.splice(resolved - 1, 0, member);
  target.members = remaining.map((member, index) => ({
    ...member,
    position: index + 1,
  }));
  return resolved;
}

export function acceptsAction(
  column: ViewColumn,
  action: ActionProjection,
): boolean {
  return column.type === 'blocked'
    ? action.blocking.blocked &&
        !['completed', 'cancelled'].includes(action.state)
    : column.status.includes(action.state) &&
        (!action.blocking.blocked || column.include_blocked);
}

export function placementColumn(
  definition: ViewDefinition,
  placement: ViewPlacement,
): ViewColumn {
  const column = definition.columns.find(
    (column) => column.id === placement.column_id,
  );
  if (!column)
    throw new WorkspaceError(
      'INVALID_VIEW_PLACEMENT',
      `View instance ${placement.view_id}, Action ${placement.action_id}: referenced column ${placement.column_id} no longer exists. Restore its stable ID in the definition.`,
    );
  return column;
}

// Invalid known placements are ignored logically; reads never persist cleanup.
export function evaluateView(
  definition: ViewDefinition,
  actions: readonly ActionProjection[],
  placements: readonly ViewPlacement[] = [],
  order: readonly ViewOrder[] = [],
): EvaluatedViewColumn[] {
  const byId = new Map(actions.map((action) => [action.id, action]));
  const retained = new Map<string, ViewColumn>();
  for (const placement of placements) {
    const column = placementColumn(definition, placement);
    const action = byId.get(placement.action_id);
    if (!action || retained.has(placement.action_id))
      throw new WorkspaceError(
        'INVALID_VIEW_PLACEMENT',
        `Invalid or duplicate placement for Action ${placement.action_id}.`,
      );
    // Remember ineligible placements too, so duplicates cannot escape validation.
    retained.set(placement.action_id, column);
  }
  const ordered = new Map<string, ViewOrder>();
  const ranks = new Set<string>();
  for (const entry of order) {
    placementColumn(definition, entry);
    const key = JSON.stringify([entry.column_id, entry.rank]);
    if (
      !byId.has(entry.action_id) ||
      ordered.has(entry.action_id) ||
      ranks.has(key) ||
      !Number.isSafeInteger(entry.rank) ||
      entry.rank < 1
    )
      throw new WorkspaceError(
        'INVALID_VIEW_ORDER',
        `Invalid or contradictory order for Action ${entry.action_id}.`,
      );
    ordered.set(entry.action_id, entry);
    ranks.add(key);
  }
  const columns = definition.columns.map(({ id, title }) => ({
    id,
    title,
    members: [] as ViewMember[],
  }));
  const special = definition.columns.find(
    (column) => column.type === 'blocked',
  );
  for (const action of actions) {
    const blocked = action.blocking.blocked;
    const eligible = definition.columns.filter(
      (column) => column.type === 'status' && acceptsAction(column, action),
    );
    const stored = retained.get(action.id);
    const target =
      stored && acceptsAction(stored, action)
        ? stored
        : blocked &&
            !['completed', 'cancelled'].includes(action.state) &&
            special
          ? special
          : (eligible.find(
              (column) => column.id === definition.defaults[action.state],
            ) ?? eligible[0]);
    if (target)
      columns
        .find((column) => column.id === target.id)!
        .members.push({
          id: action.id,
          title: action.title,
          state: action.state,
          blocked,
          position: 0,
        });
  }
  for (const column of columns) {
    const rank = (id: string) => {
      const entry = ordered.get(id);
      return entry?.column_id === column.id ? entry.rank : Infinity;
    };
    column.members.sort(
      (a, b) =>
        rank(a.id) - rank(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    column.members.forEach((member, index) => {
      member.position = index + 1;
    });
  }
  return columns;
}

export interface MoveActionInput {
  view: string;
  column: string;
  position?: number | undefined;
  reason?: string | undefined;
  waitingFor?: string | undefined;
}

export function moveViewAction(
  definition: ViewDefinition,
  actions: readonly ActionProjection[],
  placements: readonly ViewPlacement[],
  current: ActionProjection,
  input: MoveActionInput,
  time: string,
  order: readonly ViewOrder[] = [],
): {
  action: Action;
  source: string | null;
  sourcePosition: number | null;
  changed: boolean;
} {
  const destination = definition.columns.find(
    (column) => column.id === input.column,
  );
  if (!destination)
    throw new WorkspaceError(
      'INVALID_ARGUMENT',
      `Unknown destination column: ${input.column}.`,
    );
  const evaluated = evaluateView(definition, actions, placements, order);
  const sourcePosition =
    evaluated
      .flatMap((column) => column.members)
      .find((member) => member.id === current.id)?.position ?? null;
  const source =
    evaluated.find((column) =>
      column.members.some((member) => member.id === current.id),
    )?.id ?? null;
  if (
    input.reason !== undefined &&
    (destination.type !== 'blocked' ||
      !input.reason.trim() ||
      input.waitingFor !== undefined)
  )
    throw new WorkspaceError(
      'INVALID_ARGUMENT',
      '--reason requires entry into Blocked and nonblank text; it cannot be combined with --waiting-for.',
    );
  if (
    input.waitingFor !== undefined &&
    (destination.type !== 'status' ||
      destination.default_status !== 'waiting' ||
      !input.waitingFor.trim())
  )
    throw new WorkspaceError(
      'INVALID_ARGUMENT',
      '--waiting-for requires an ordinary destination defaulting to waiting and nonblank text.',
    );
  if (source === destination.id) {
    if (input.reason !== undefined || input.waitingFor !== undefined)
      throw new WorkspaceError(
        'INVALID_ARGUMENT',
        'Same-column moves cannot edit reasons. Use set action.',
      );
    const position =
      input.position === undefined
        ? sourcePosition!
        : validatePosition(
            input.position,
            evaluated.find((column) => column.id === source)!.members.length,
          );
    return {
      action: current,
      source,
      sourcePosition,
      changed: position !== sourcePosition,
    };
  }
  const sourceColumn = definition.columns.find(
    (column) => column.id === source,
  );
  if (
    sourceColumn?.type === 'blocked' &&
    current.blocking.unresolved_dependencies.length
  )
    throw new WorkspaceError(
      'INVALID_ARGUMENT',
      'Cannot leave Blocked while prerequisite Actions remain unresolved.',
    );
  let action: Action;
  if (destination.type === 'blocked') {
    const reason = input.reason ?? current.manual_block;
    if (reason === undefined || !reason.trim())
      throw new WorkspaceError(
        'INVALID_ARGUMENT',
        'Entering Blocked requires a nonblank --reason or an existing manual reason.',
      );
    action = editAction(current, { manualBlock: reason }, time);
  } else {
    action = editAction(
      current,
      {
        state: destination.default_status,
        waitingFor: input.waitingFor,
        ...(sourceColumn?.type === 'blocked' ? { clearManualBlock: true } : {}),
      },
      time,
    );
  }
  // Completion uses current prerequisite facts, including an unresolved self-edge.
  // The proposed state cannot satisfy its own prerequisite to authorize entry.
  validateCompletion(
    current,
    projectAction(action, (id) =>
      actions.find((candidate) => candidate.id === id),
    ),
  );
  const projected = projectAction(action, (id) =>
    id === action.id
      ? action
      : actions.find((candidate) => candidate.id === id),
  );
  const candidatePlacements = placements
    .filter((placement) => placement.action_id !== action.id)
    .concat({
      view_id: input.view,
      action_id: action.id,
      column_id: destination.id,
    });
  const final = evaluateView(
    definition,
    actions.map((candidate) =>
      candidate.id === action.id ? projected : candidate,
    ),
    candidatePlacements,
  );
  if (
    !acceptsAction(destination, projected) ||
    !final
      .find((column) => column.id === destination.id)
      ?.members.some((member) => member.id === action.id)
  )
    throw new WorkspaceError(
      'INVALID_ARGUMENT',
      'The resulting Action is not eligible for the destination column.',
    );
  // Dependent membership may also change. Resolve the final upper bound during
  // reconciliation, after every Action has its resulting blocking projection.
  if (input.position !== undefined)
    validatePosition(input.position, Number.MAX_SAFE_INTEGER);
  return { action, source, sourcePosition, changed: true };
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
