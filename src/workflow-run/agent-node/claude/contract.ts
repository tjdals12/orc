import { z } from 'zod';

export const ClaudeOutputSchema = z.discriminatedUnion('kind', [
  z.object({
    provider: z.literal('claude'),
    kind: z.literal('text'),
    text: z.string(),
  }),
  z.object({
    provider: z.literal('claude'),
    kind: z.literal('tool_use'),
    tool_name: z.string(),
    input_preview: z.string(),
  }),
  z.object({
    provider: z.literal('claude'),
    kind: z.literal('tool_result'),
    tool_name: z.string(),
    is_error: z.boolean(),
    result_preview: z.string(),
  }),
]);

export const ClaudeSessionSchema = z.object({
  provider: z.literal('claude'),
  session_id: z.string(),
  model: z.string(),
});
