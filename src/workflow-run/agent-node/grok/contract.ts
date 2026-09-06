import { z } from 'zod';

export const GrokOutputSchema = z.discriminatedUnion('kind', [
  z.object({
    provider: z.literal('grok'),
    kind: z.literal('text'),
    text: z.string(),
  }),
  z.object({
    provider: z.literal('grok'),
    kind: z.literal('tool_call'),
    tool_name: z.string(),
    tool_kind: z.string(),
    status: z.string(),
  }),
  z.object({
    provider: z.literal('grok'),
    kind: z.literal('tool_call_update'),
    tool_name: z.string(),
    status: z.string(),
    output_preview: z.string(),
  }),
]);

export const GrokSessionSchema = z.object({
  provider: z.literal('grok'),
  session_id: z.string(),
  model: z.string(),
});

const GrokEventTypeSchema = z.object({ type: z.string() });

const GrokTextEventSchema = z.object({
  type: z.literal('text'),
  data: z.string(),
});

const GrokToolCallEventSchema = z.object({
  type: z.literal('tool_call'),
  toolCallId: z.string(),
  toolName: z.string(),
  kind: z.string(),
  status: z.string(),
});

const GrokToolCallUpdateEventSchema = z.object({
  type: z.literal('tool_call_update'),
  toolCallId: z.string(),
  status: z.string().nullable(),
  rawOutput: z.unknown().optional(),
});

const GrokEndEventSchema = z.object({
  type: z.literal('end'),
  stopReason: z.string(),
  sessionId: z.string(),
});

const GrokErrorEventSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
});

type GrokEvent =
  | z.infer<typeof GrokTextEventSchema>
  | z.infer<typeof GrokToolCallEventSchema>
  | z.infer<typeof GrokToolCallUpdateEventSchema>
  | z.infer<typeof GrokEndEventSchema>
  | z.infer<typeof GrokErrorEventSchema>;

type GrokEventParseResult =
  | { outcome: 'recognized'; event: GrokEvent }
  | { outcome: 'unknown' }
  | { outcome: 'invalid'; eventType: string | null };

export function parseGrokEvent(value: unknown): GrokEventParseResult {
  const eventType = GrokEventTypeSchema.safeParse(value);
  if (eventType.error) {
    return { outcome: 'invalid', eventType: null };
  }
  const invalidEvent: GrokEventParseResult = {
    outcome: 'invalid',
    eventType: eventType.data.type,
  };

  switch (eventType.data.type) {
    case 'text': {
      const event = GrokTextEventSchema.safeParse(value);
      return event.error ? invalidEvent : { outcome: 'recognized', event: event.data };
    }
    case 'tool_call': {
      const event = GrokToolCallEventSchema.safeParse(value);
      return event.error ? invalidEvent : { outcome: 'recognized', event: event.data };
    }
    case 'tool_call_update': {
      const event = GrokToolCallUpdateEventSchema.safeParse(value);
      return event.error ? invalidEvent : { outcome: 'recognized', event: event.data };
    }
    case 'end': {
      const event = GrokEndEventSchema.safeParse(value);
      return event.error ? invalidEvent : { outcome: 'recognized', event: event.data };
    }
    case 'error': {
      const event = GrokErrorEventSchema.safeParse(value);
      return event.error ? invalidEvent : { outcome: 'recognized', event: event.data };
    }
    default:
      return { outcome: 'unknown' };
  }
}
