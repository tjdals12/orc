import type { AgentOutput, AgentSession } from './provider.js';

export type RecordAgentOutput = (output: AgentOutput) => Promise<void>;

export type RecordAgentSession = (session: AgentSession) => Promise<void>;

export type AgentRunResult =
  { outcome: 'succeeded'; signalDetected: boolean } | { outcome: 'failed'; reason: string };
