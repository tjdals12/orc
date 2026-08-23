import { z } from 'zod';

export const CodexAgentSchema = z.strictObject({
  provider: z.literal('codex'),
  model: z.string().min(1),
  options: z
    .strictObject({
      model_reasoning_effort: z.string().min(1).optional(),
    })
    .optional(),
});
