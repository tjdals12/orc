import { z } from 'zod';

const CodexEventTypeSchema = z.object({ type: z.string() });

const CodexThreadStartedEventSchema = z.object({
  type: z.literal('thread.started'),
  thread_id: z.string(),
});

const CodexItemStartedSchema = z.object({
  type: z.literal('item.started'),
  item: z.object({ type: z.string() }),
});

const CodexCommandExecutionStartedEventSchema = z.object({
  type: z.literal('item.started'),
  item: z.object({
    type: z.literal('command_execution'),
    command: z.string(),
  }),
});

const CodexItemCompletedSchema = z.object({
  type: z.literal('item.completed'),
  item: z.object({ type: z.string() }),
});

const CodexAgentMessageCompletedEventSchema = z.object({
  type: z.literal('item.completed'),
  item: z.object({
    type: z.literal('agent_message'),
    text: z.string(),
  }),
});

const CodexCommandExecutionCompletedEventSchema = z.object({
  type: z.literal('item.completed'),
  item: z.object({
    type: z.literal('command_execution'),
    status: z.string(),
    exit_code: z.number().nullable().optional(),
    aggregated_output: z.unknown().optional(),
  }),
});

const CodexFileChangeCompletedEventSchema = z.object({
  type: z.literal('item.completed'),
  item: z.object({
    type: z.literal('file_change'),
    status: z.string(),
    changes: z.array(z.object({ path: z.string(), kind: z.string() })),
  }),
});

const CodexTurnCompletedEventSchema = z.object({ type: z.literal('turn.completed') });

const CodexTurnFailedEventSchema = z.object({
  type: z.literal('turn.failed'),
  error: z.object({ message: z.string() }),
});

const CodexErrorEventSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
});

type CodexCliEvent =
  | z.infer<typeof CodexThreadStartedEventSchema>
  | z.infer<typeof CodexCommandExecutionStartedEventSchema>
  | z.infer<typeof CodexAgentMessageCompletedEventSchema>
  | z.infer<typeof CodexCommandExecutionCompletedEventSchema>
  | z.infer<typeof CodexFileChangeCompletedEventSchema>
  | z.infer<typeof CodexTurnCompletedEventSchema>
  | z.infer<typeof CodexTurnFailedEventSchema>
  | z.infer<typeof CodexErrorEventSchema>;

export type CodexCliEventParseResult =
  | { outcome: 'recognized'; event: CodexCliEvent }
  | { outcome: 'unknown' }
  | { outcome: 'invalid'; eventType: string | null };

export function parseCodexCliEvent(value: unknown): CodexCliEventParseResult {
  const eventType = CodexEventTypeSchema.safeParse(value);
  if (eventType.error) {
    return { outcome: 'invalid', eventType: null };
  }

  const invalidEvent: CodexCliEventParseResult = {
    outcome: 'invalid',
    eventType: eventType.data.type,
  };

  switch (eventType.data.type) {
    case 'thread.started': {
      const event = CodexThreadStartedEventSchema.safeParse(value);
      return event.error ? invalidEvent : { outcome: 'recognized', event: event.data };
    }
    case 'item.started': {
      const item = CodexItemStartedSchema.safeParse(value);
      if (item.error) return invalidEvent;
      if (item.data.item.type !== 'command_execution') return { outcome: 'unknown' };

      const event = CodexCommandExecutionStartedEventSchema.safeParse(value);
      return event.error ? invalidEvent : { outcome: 'recognized', event: event.data };
    }
    case 'item.completed': {
      const item = CodexItemCompletedSchema.safeParse(value);
      if (item.error) return invalidEvent;
      if (item.data.item.type === 'agent_message') {
        const event = CodexAgentMessageCompletedEventSchema.safeParse(value);
        return event.error ? invalidEvent : { outcome: 'recognized', event: event.data };
      }
      if (item.data.item.type === 'command_execution') {
        const event = CodexCommandExecutionCompletedEventSchema.safeParse(value);
        return event.error ? invalidEvent : { outcome: 'recognized', event: event.data };
      }
      if (item.data.item.type === 'file_change') {
        const event = CodexFileChangeCompletedEventSchema.safeParse(value);
        return event.error ? invalidEvent : { outcome: 'recognized', event: event.data };
      }
      return { outcome: 'unknown' };
    }
    case 'turn.completed': {
      const event = CodexTurnCompletedEventSchema.safeParse(value);
      return event.error ? invalidEvent : { outcome: 'recognized', event: event.data };
    }
    case 'turn.failed': {
      const event = CodexTurnFailedEventSchema.safeParse(value);
      return event.error ? invalidEvent : { outcome: 'recognized', event: event.data };
    }
    case 'error': {
      const event = CodexErrorEventSchema.safeParse(value);
      return event.error ? invalidEvent : { outcome: 'recognized', event: event.data };
    }
    default:
      return { outcome: 'unknown' };
  }
}
