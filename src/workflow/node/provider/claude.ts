import { z } from 'zod';

export const ClaudeAgentSchema = z.strictObject({
  provider: z.literal('claude'),
  model: z.string().min(1),
  options: z
    .strictObject({
      effort: z.string().min(1).optional(),
      max_turns: z.int().positive().optional(),
    })
    .optional(),
});
