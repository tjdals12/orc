import { z } from 'zod';

import { AgentOutputSchema, type AgentOutput } from './agent-node/provider.js';

const BashOutputLogDataSchema = z.object({
  stream: z.enum(['stdout', 'stderr']),
  text: z.string(),
});
type BashOutputLogData = z.infer<typeof BashOutputLogDataSchema>;

export function parseBashOutputLogData(data: string): BashOutputLogData {
  const parsed: unknown = JSON.parse(data);
  const result = BashOutputLogDataSchema.safeParse(parsed);
  if (result.error) {
    throw new Error(`Broken bash_output log data.\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export function parseAgentOutputLogData(data: string): AgentOutput {
  const parsed: unknown = JSON.parse(data);
  const result = AgentOutputSchema.safeParse(parsed);
  if (result.error) {
    throw new Error(`Broken agent_output log data.\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
