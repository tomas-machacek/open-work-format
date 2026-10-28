import { z } from 'zod';
export const moveActionOptions = z.object({
  position: z
    .string()
    .regex(/^[0-9]+$/u)
    .transform(Number)
    .refine(
      (value) => Number.isSafeInteger(value) && value > 0,
      'Position must be a positive safe decimal integer.',
    )
    .optional(),
  view: z.string(),
  column: z.string(),
  reason: z.string().optional(),
  waitingFor: z.string().optional(),
  json: z.boolean().optional(),
});
export const createViewOptions = z.object({
  title: z.string(),
  definition: z.string(),
  json: z.boolean().optional(),
});
export const ownersResponse = z.object({
  owners: z.array(
    z.object({
      url: z.string(),
      type: z.enum(['workspace', 'project', 'outcome']),
      title: z.string(),
      hierarchy: z.string(),
    }),
  ),
});
export type AvailableOwner = z.infer<typeof ownersResponse>['owners'][number];
export const boardQuery = z
  .object({
    search: z
      .string()
      .refine((value) => value.trim().length > 0)
      .optional(),
    owner: z.string().optional(),
    recursive: z.enum(['true', 'false']).optional(),
  })
  .strict()
  .refine((value) => value.recursive !== 'true' || value.owner !== undefined)
  .transform((value) => ({
    ...(value.search === undefined ? {} : { search: value.search }),
    ...(value.owner === undefined ? {} : { owner: value.owner }),
    ...(value.recursive === undefined
      ? {}
      : { recursive: value.recursive === 'true' }),
  }));
export type BoardQuery = z.infer<typeof boardQuery>;
export const listActionsOptions = z.object({
  search: z.string().optional(),
  state: z.array(z.string()).optional(),
  owner: z.string().optional(),
  recursive: z.boolean().optional(),
  json: z.boolean().optional(),
});
export const setActionOptions = z.object({
  manualBlock: z.string().optional(),
  clearManualBlock: z.boolean().optional(),
  addDependency: z.array(z.string()).optional(),
  removeDependency: z.array(z.string()).optional(),
  state: z.string().optional(),
  waitingFor: z.string().optional(),
  clearWaitingFor: z.boolean().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  clearDescription: z.boolean().optional(),
  owner: z.string().optional(),
  json: z.boolean().optional(),
});
export const initOptions = z.object({
  title: z.string().optional(),
  json: z.boolean().optional(),
});
export const createOptions = z.object({
  title: z.string(),
  slug: z.string().optional(),
  owner: z.string().optional(),
  expectedResult: z.string().optional(),
  json: z.boolean().optional(),
});
export const createActionOptions = z.object({
  title: z.string(),
  state: z.string().optional(),
  waitingFor: z.string().optional(),
  owner: z.string().optional(),
  description: z.string().optional(),
  json: z.boolean().optional(),
});

const actionRecord = z.object({
  id: z.string(),
  title: z.string(),
  state: z.enum(['open', 'in_progress', 'waiting', 'completed', 'cancelled']),
  owner: z.object({ url: z.string() }),
  description: z.string().optional(),
  waiting_for: z.string().optional(),
  manual_block: z.string().optional(),
  depends_on: z.array(z.string()),
  blocking: z.object({
    blocked: z.boolean(),
    manual: z.boolean(),
    unresolved_dependencies: z.array(z.string()),
    dependencies: z.array(
      z.object({
        uri: z.string(),
        title: z.string(),
        state: z.enum([
          'open',
          'in_progress',
          'waiting',
          'completed',
          'cancelled',
        ]),
        satisfied: z.boolean(),
      }),
    ),
  }),
  created_at: z.string(),
  updated_at: z.string(),
});
export const boardAction = actionRecord.refine(
  (action) => {
    const { blocking } = action;
    const uris = blocking.dependencies.map((target) => target.uri);
    const unresolved = blocking.dependencies
      .filter((target) => !target.satisfied)
      .map((target) => target.uri);
    const sameSet = (a: string[], b: string[]) =>
      a.length === b.length &&
      new Set(a).size === a.length &&
      a.every((uri) => b.includes(uri));
    return (
      sameSet(action.depends_on, uris) &&
      sameSet(unresolved, blocking.unresolved_dependencies) &&
      blocking.manual === (action.manual_block !== undefined) &&
      blocking.blocked === (blocking.manual || unresolved.length > 0)
    );
  },
  { message: 'Invalid blocking projection.' },
);
export const boardResponse = z.object({
  workspace: z.object({ root: z.string() }),
  actions: z.array(boardAction),
});
export const boardError = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type BoardResponse = z.infer<typeof boardResponse>;
export type BoardAction = z.infer<typeof boardAction>;

const viewInstance = z.object({
  id: z.string(),
  title: z.string(),
  definition: z.object({ url: z.string(), id: z.string().optional() }),
  created_at: z.string(),
});
export const viewsResponse = z.object({ views: z.array(viewInstance) });
export type StoredView = z.infer<typeof viewInstance>;
export const viewResponse = z.object({
  workspace: z.object({ root: z.string() }),
  view: viewInstance,
  columns: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      members: z.array(boardAction),
    }),
  ),
});
export type ViewResponse = z.infer<typeof viewResponse>;

export const createActionRequest = z
  .object({
    title: z.string(),
    description: z.string().optional(),
    owner: z.string(),
    state: z.string(),
    waitingFor: z.string().optional(),
  })
  .strict();
export const createActionResponse = z.object({ action: boardAction });
export type CreateActionRequest = z.infer<typeof createActionRequest>;
export const updateActionStateRequest = z
  .object({
    state: actionRecord.shape.state,
    expected: z
      .object({
        state: actionRecord.shape.state,
        updated_at: z.iso.datetime(),
        waiting_for: z.string().optional(),
      })
      .strict()
      .refine(
        (value) =>
          value.waiting_for === undefined ||
          (value.state === 'waiting' && value.waiting_for.trim().length > 0),
      ),
  })
  .strict();
export const updateActionStateResponse = z.object({
  status: z.enum(['updated', 'unchanged']),
  action: boardAction,
});
export type UpdateActionStateRequest = z.infer<typeof updateActionStateRequest>;

export const editActionRequest = z
  .object({
    expected: actionRecord
      .pick({
        title: true,
        description: true,
        owner: true,
        state: true,
        waiting_for: true,
        updated_at: true,
      })
      .extend({ updated_at: z.iso.datetime() })
      .strict(),
    title: z.string().optional(),
    description: z.string().optional(),
    clearDescription: z.literal(true).optional(),
    owner: z.string().optional(),
    waitingFor: z.string().optional(),
    clearWaitingFor: z.literal(true).optional(),
    manualBlock: z.string().optional(),
    clearManualBlock: z.literal(true).optional(),
    addDependency: z.array(z.string()).optional(),
    removeDependency: z.array(z.string()).optional(),
  })
  .strict()
  .refine((value) =>
    [
      value.title,
      value.description,
      value.owner,
      value.waitingFor,
      value.clearDescription,
      value.clearWaitingFor,
      value.manualBlock,
      value.clearManualBlock,
      ...(value.addDependency ?? []),
      ...(value.removeDependency ?? []),
    ].some((field) => field !== undefined),
  )
  .refine(
    (value) => !(value.description !== undefined && value.clearDescription),
  )
  .refine((value) => !(value.waitingFor !== undefined && value.clearWaitingFor))
  .refine(
    (value) => !(value.manualBlock !== undefined && value.clearManualBlock),
  );
export const editActionResponse = updateActionStateResponse;
export type EditActionRequest = z.infer<typeof editActionRequest>;
