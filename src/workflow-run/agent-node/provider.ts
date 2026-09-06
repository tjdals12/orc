import { z } from 'zod';

import { ClaudeOutputSchema, ClaudeSessionSchema } from './claude/contract.js';
import { CodexOutputSchema, CodexSessionSchema } from './codex/contract.js';
import { GrokOutputSchema, GrokSessionSchema } from './grok/contract.js';

export const AgentOutputSchema = z.union([ClaudeOutputSchema, CodexOutputSchema, GrokOutputSchema]);

export type AgentOutput = z.infer<typeof AgentOutputSchema>;

export const AgentSessionSchema = z.union([
  ClaudeSessionSchema,
  CodexSessionSchema,
  GrokSessionSchema,
]);

export type AgentSession = z.infer<typeof AgentSessionSchema>;
