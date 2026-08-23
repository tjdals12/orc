import { z } from 'zod';

export const CodexOutputSchema = z.discriminatedUnion('kind', [
  z.object({
    provider: z.literal('codex'),
    kind: z.literal('agent_message'),
    text: z.string(),
  }),
  z.object({
    provider: z.literal('codex'),
    kind: z.literal('command_execution'),
    command: z.string(),
  }),
  z.object({
    provider: z.literal('codex'),
    kind: z.literal('command_result'),
    status: z.string(),
    exit_code: z.number().nullable(),
    output_preview: z.string(),
  }),
  z.object({
    provider: z.literal('codex'),
    kind: z.literal('file_change'),
    status: z.string(),
    changes: z.array(z.object({ path: z.string(), kind: z.string() })),
  }),
]);

export const CodexSessionSchema = z.object({
  provider: z.literal('codex'),
  thread_id: z.string(),
  model: z.string(),
});
