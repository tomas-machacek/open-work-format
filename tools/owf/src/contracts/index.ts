import { z } from 'zod';
export const initOptions = z.object({
  title: z.string().optional(),
  json: z.boolean().optional(),
});
