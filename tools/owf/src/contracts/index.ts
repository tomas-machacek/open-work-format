import { z } from 'zod';
export const listActionsOptions = z.object({
  state: z.array(z.string()).optional(),
  owner: z.string().optional(),
  recursive: z.boolean().optional(),
  json: z.boolean().optional(),
});
export const setActionOptions = z.object({
  state: z.string(),
  waitingFor: z.string().optional(),
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

export const boardAction = z.object({
  id: z.string(),
  title: z.string(),
  state: z.enum(['open', 'in_progress', 'waiting', 'completed', 'cancelled']),
  owner: z.object({ url: z.string() }),
  description: z.string().optional(),
  waiting_for: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export const boardResponse = z.object({
  workspace: z.object({ root: z.string() }),
  actions: z.array(boardAction),
});
export const boardError = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type BoardResponse = z.infer<typeof boardResponse>;
export type BoardAction = z.infer<typeof boardAction>;

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
    state: boardAction.shape.state,
    expected: z
      .object({
        state: boardAction.shape.state,
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
