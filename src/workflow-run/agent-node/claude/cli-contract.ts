import { z } from 'zod';

const EventEnvelopeSchema = z.object({
  type: z.string(),
});

const SystemInitSchema = z.object({
  type: z.literal('system'),
  subtype: z.literal('init'),
  session_id: z.string(),
  model: z.string(),
});

const AssistantEnvelopeSchema = z.object({
  type: z.literal('assistant'),
  message: z.object({
    content: z.array(z.unknown()),
  }),
});

const AssistantTextBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

const AssistantToolUseBlockSchema = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.unknown(),
});

const UserEnvelopeSchema = z.object({
  type: z.literal('user'),
  message: z.object({
    content: z.union([z.string(), z.array(z.unknown())]),
  }),
});

const ToolResultBlockSchema = z.object({
  type: z.literal('tool_result'),
  tool_use_id: z.string(),
  content: z.unknown().optional(),
  is_error: z.boolean().optional(),
});

const ResultSchema = z.object({
  type: z.literal('result'),
  subtype: z.string(),
  is_error: z.boolean(),
  result: z.string(),
  errors: z.array(z.string()).optional(),
});

type ClaudeCliAssistantContent =
  { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown };

export type ClaudeCliEvent =
  | { type: 'system_init'; sessionId: string; model: string }
  | { type: 'assistant'; content: ClaudeCliAssistantContent[] }
  | {
      type: 'user';
      content: { toolUseId: string; content: unknown; isError: boolean }[];
    }
  | { type: 'result'; subtype: string; isError: boolean; result: string; errors: string[] };

export type ParsedClaudeCliEvent =
  | { outcome: 'recognized'; event: ClaudeCliEvent }
  | { outcome: 'ignored' }
  | { outcome: 'invalid'; eventType: string | null };

function parseAssistantContent(
  value: unknown[],
): { outcome: 'recognized'; content: ClaudeCliAssistantContent[] } | { outcome: 'invalid' } {
  const content: ClaudeCliAssistantContent[] = [];
  for (const block of value) {
    const eventType = EventEnvelopeSchema.safeParse(block);
    if (!eventType.error) {
      if (eventType.data.type === 'text') {
        const result = AssistantTextBlockSchema.safeParse(block);
        if (result.error) return { outcome: 'invalid' };
        content.push({ type: 'text', text: result.data.text });
      }
      if (eventType.data.type === 'tool_use') {
        const result = AssistantToolUseBlockSchema.safeParse(block);
        if (result.error) return { outcome: 'invalid' };
        content.push({
          type: 'tool_use',
          id: result.data.id,
          name: result.data.name,
          input: result.data.input,
        });
      }
    }
  }

  return { outcome: 'recognized', content };
}

function parseToolResults(
  value: unknown[],
):
  | { outcome: 'recognized'; content: { toolUseId: string; content: unknown; isError: boolean }[] }
  | { outcome: 'invalid' } {
  const content: { toolUseId: string; content: unknown; isError: boolean }[] = [];
  for (const block of value) {
    const eventType = EventEnvelopeSchema.safeParse(block);
    if (!eventType.error && eventType.data.type === 'tool_result') {
      const result = ToolResultBlockSchema.safeParse(block);
      if (result.error) return { outcome: 'invalid' };
      content.push({
        toolUseId: result.data.tool_use_id,
        content: result.data.content,
        isError: result.data.is_error ?? false,
      });
    }
  }

  return { outcome: 'recognized', content };
}

export function parseClaudeCliEvent(value: unknown): ParsedClaudeCliEvent {
  const envelope = EventEnvelopeSchema.safeParse(value);
  if (envelope.error) return { outcome: 'invalid', eventType: null };

  switch (envelope.data.type) {
    case 'system': {
      if (
        value === null ||
        typeof value !== 'object' ||
        !('subtype' in value) ||
        value.subtype !== 'init'
      ) {
        return { outcome: 'ignored' };
      }

      const result = SystemInitSchema.safeParse(value);
      if (result.error) return { outcome: 'invalid', eventType: 'system' };
      return {
        outcome: 'recognized',
        event: {
          type: 'system_init',
          sessionId: result.data.session_id,
          model: result.data.model,
        },
      };
    }
    case 'assistant': {
      const result = AssistantEnvelopeSchema.safeParse(value);
      if (result.error) return { outcome: 'invalid', eventType: 'assistant' };

      const content = parseAssistantContent(result.data.message.content);
      if (content.outcome === 'invalid') return { outcome: 'invalid', eventType: 'assistant' };
      return { outcome: 'recognized', event: { type: 'assistant', content: content.content } };
    }
    case 'user': {
      const result = UserEnvelopeSchema.safeParse(value);
      if (result.error) return { outcome: 'invalid', eventType: 'user' };
      if (typeof result.data.message.content === 'string') return { outcome: 'ignored' };

      const content = parseToolResults(result.data.message.content);
      if (content.outcome === 'invalid') return { outcome: 'invalid', eventType: 'user' };
      return { outcome: 'recognized', event: { type: 'user', content: content.content } };
    }
    case 'result': {
      const result = ResultSchema.safeParse(value);
      if (result.error) return { outcome: 'invalid', eventType: 'result' };
      return {
        outcome: 'recognized',
        event: {
          type: 'result',
          subtype: result.data.subtype,
          isError: result.data.is_error,
          result: result.data.result,
          errors: result.data.errors ?? [],
        },
      };
    }
    default:
      return { outcome: 'ignored' };
  }
}
