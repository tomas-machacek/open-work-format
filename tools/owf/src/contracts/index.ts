import { z } from 'zod';
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
  owner: z.string().optional(),
  description: z.string().optional(),
  json: z.boolean().optional(),
});
