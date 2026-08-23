import type { WorkflowRunEventType } from '#database/schema.js';
import { z } from 'zod';

import { AgentSessionSchema, type AgentSession } from './agent-node/provider.js';
import { loopVerdictKinds } from './types.js';

const NodeFailedEventSchema = z.object({ reason: z.string() });
type NodeFailedEvent = z.infer<typeof NodeFailedEventSchema>;

export function parseNodeFailedEventData(data: string | null): NodeFailedEvent {
  const parsed: unknown = data === null ? null : JSON.parse(data);
  const result = NodeFailedEventSchema.safeParse(parsed);
  if (result.error) {
    throw new Error(`Broken node_failed event data.\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

const RunFailedEventSchema = z.object({ reason: z.string() });
type RunFailedEvent = z.infer<typeof RunFailedEventSchema>;

function parseRunFailedEventData(data: string): RunFailedEvent {
  const parsed: unknown = JSON.parse(data);
  const result = RunFailedEventSchema.safeParse(parsed);
  if (result.error) {
    throw new Error(`Broken run_failed event data.\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

const DecisionRejectedEventSchema = z.object({ reason: z.string() });
type DecisionRejectedEvent = z.infer<typeof DecisionRejectedEventSchema>;

function parseDecisionRejectedEventData(data: string): DecisionRejectedEvent {
  const parsed: unknown = JSON.parse(data);
  const result = DecisionRejectedEventSchema.safeParse(parsed);
  if (result.error) {
    throw new Error(`Broken decision_rejected event data.\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

const HookStartedEventSchema = z.object({ file: z.string() });
type HookStartedEvent = z.infer<typeof HookStartedEventSchema>;

export function parseHookStartedEventData(data: string | null): HookStartedEvent {
  const parsed: unknown = data === null ? null : JSON.parse(data);
  const result = HookStartedEventSchema.safeParse(parsed);
  if (result.error) {
    throw new Error(`Broken hook_started event data.\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

const IterationStartedEventSchema = z.object({
  iteration: z.number(),
  max_iterations: z.number(),
});
type IterationStartedEvent = z.infer<typeof IterationStartedEventSchema>;

function parseIterationStartedEventData(data: string | null): IterationStartedEvent {
  const parsed: unknown = data === null ? null : JSON.parse(data);
  const result = IterationStartedEventSchema.safeParse(parsed);
  if (result.error) {
    throw new Error(`Broken iteration_started event data.\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

const IterationCompletedEventSchema = z.object({
  iteration: z.number(),
  verdict: z.enum(loopVerdictKinds),
});
type IterationCompletedEvent = z.infer<typeof IterationCompletedEventSchema>;

function parseIterationCompletedEventData(data: string | null): IterationCompletedEvent {
  const parsed: unknown = data === null ? null : JSON.parse(data);
  const result = IterationCompletedEventSchema.safeParse(parsed);
  if (result.error) {
    throw new Error(`Broken iteration_completed event data.\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

function parseAgentSessionStartedEventData(data: string | null): AgentSession {
  const parsed: unknown = data === null ? null : JSON.parse(data);
  const result = AgentSessionSchema.safeParse(parsed);
  if (result.error) {
    throw new Error(`Broken agent_session_started event data.\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export function parseEventDetail(type: WorkflowRunEventType, data: string | null): string | null {
  if (type === 'node_failed') {
    const { reason } = parseNodeFailedEventData(data);
    return reason;
  }
  if (type === 'run_failed' && data !== null) {
    const { reason } = parseRunFailedEventData(data);
    return reason;
  }
  if (type === 'decision_rejected' && data !== null) {
    const { reason } = parseDecisionRejectedEventData(data);
    return reason;
  }
  if (type === 'hook_started') {
    const { file } = parseHookStartedEventData(data);
    return file;
  }
  if (type === 'iteration_started') {
    const iterationEvent = parseIterationStartedEventData(data);
    const detail = `${iterationEvent.iteration} (max: ${iterationEvent.max_iterations})`;
    return detail;
  }
  if (type === 'iteration_completed') {
    const iterationEvent = parseIterationCompletedEventData(data);
    const detail = `${iterationEvent.iteration} · ${iterationEvent.verdict}`;
    return detail;
  }
  if (type === 'agent_session_started') {
    const session = parseAgentSessionStartedEventData(data);
    if (session.provider === 'claude') {
      const detail = `${session.provider} · ${session.model} · ${session.session_id}`;
      return detail;
    }
    if (session.provider === 'codex') {
      const detail = `${session.provider} · ${session.model} · ${session.thread_id}`;
      return detail;
    }

    session satisfies never;
  }
  return null;
}
