import { z } from 'zod';

export const GrokAgentSchema = z.strictObject({
  provider: z.literal('grok'),
  model: z.string().min(1),
  options: z
    .strictObject({
      reasoning_effort: z.string().min(1).optional(),
      max_turns: z.int().positive().optional(),
    })
    .optional(),
});
