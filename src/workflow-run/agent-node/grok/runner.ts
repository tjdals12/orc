import { spawn } from 'node:child_process';
import type { ChildProcess, ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import util from 'node:util';

import { ProcessGroupRegistry } from '#shared/process-group-registry.js';
import { buildPreview, collapseWhitespace } from '#shared/text.js';
import { checkGrokCliCompatibility } from '#installation/provider/grok/version-check.js';

import { detectCompletionSignal } from '../completion-signal.js';
import { PREVIEW_LIMIT } from '../output-text.js';
import type { AgentRunResult, RecordAgentOutput, RecordAgentSession } from '../types.js';
import { parseGrokEvent } from './contract.js';
import { GrokOutputParseError, parseGrokOutput } from './output.js';

type GrokProcessExit =
  | { outcome: 'spawn-failed'; message: string }
  | { outcome: 'exited'; code: number | null }
  | { outcome: 'killed'; signal: NodeJS.Signals };

function buildGrokArgs(options: {
  model: string;
  reasoningEffort: string | null;
  maxTurns: number | null;
  prompt: string;
  cwd: string;
}): string[] {
  const { model, reasoningEffort, maxTurns, prompt, cwd } = options;
  const args = [
    '--no-auto-update',
    '--cwd',
    cwd,
    '--model',
    model,
    '--permission-mode',
    'bypassPermissions',
    '--sandbox',
    'off',
    '--no-plan',
    '--output-format',
    'streaming-json',
  ];
  if (reasoningEffort !== null) {
    args.push('--reasoning-effort', reasoningEffort);
  }
  if (maxTurns !== null) {
    args.push('--max-turns', String(maxTurns));
  }
  args.push('-p', prompt);
  return args;
}

function waitForGrokExit(child: ChildProcess): Promise<GrokProcessExit> {
  return new Promise((resolve) => {
    child.once('error', (error) => {
      resolve({ outcome: 'spawn-failed', message: error.message });
    });
    child.once('close', (code, signal) => {
      if (signal !== null) {
        resolve({ outcome: 'killed', signal });
        return;
      }
      resolve({ outcome: 'exited', code });
    });
  });
}

function buildToolResultPreview(rawOutput: unknown): string {
  const serialized = JSON.stringify(rawOutput) ?? '';
  return buildPreview(collapseWhitespace(serialized), PREVIEW_LIMIT);
}

async function collectStderr(source: AsyncIterable<Buffer>): Promise<string> {
  const decoder = new StringDecoder();
  let output = '';
  for await (const chunk of source) {
    output += decoder.write(chunk);
  }
  output += decoder.end();
  return output;
}

export async function runGrokNode(options: {
  model: string;
  reasoningEffort: string | null;
  maxTurns: number | null;
  prompt: string;
  cwd: string;
  completionSignal: string | null;
  recordOutput: RecordAgentOutput;
  recordSession: RecordAgentSession;
  abortSignal: AbortSignal;
}): Promise<AgentRunResult> {
  const {
    model,
    reasoningEffort,
    maxTurns,
    prompt,
    cwd,
    completionSignal,
    recordOutput,
    recordSession,
    abortSignal,
  } = options;

  const compatibility = await checkGrokCliCompatibility();
  if (compatibility.status === 'not-found') {
    const agentRunResult: AgentRunResult = {
      outcome: 'failed',
      reason: 'Grok CLI was not found. Install Grok Build before running this node.',
    };
    return agentRunResult;
  }
  if (compatibility.status === 'too-old') {
    const agentRunResult: AgentRunResult = {
      outcome: 'failed',
      reason: 'Grok CLI is too old. Run "grok update --stable" before running this node.',
    };
    return agentRunResult;
  }
  if (compatibility.status === 'unsupported-major') {
    const agentRunResult: AgentRunResult = {
      outcome: 'failed',
      reason: 'Grok CLI has an unsupported major version. Update orc before running this node.',
    };
    return agentRunResult;
  }
  if (compatibility.status === 'check-failed') {
    const agentRunResult: AgentRunResult = {
      outcome: 'failed',
      reason: 'Could not check Grok CLI compatibility. Run "grok version --json" and try again.',
    };
    return agentRunResult;
  }

  let child: ChildProcessByStdio<null, Readable, Readable>;
  try {
    child = spawn('grok', buildGrokArgs({ model, reasoningEffort, maxTurns, prompt, cwd }), {
      cwd,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : util.inspect(error);
    const agentRunResult: AgentRunResult = {
      outcome: 'failed',
      reason: `Failed to spawn Grok: ${message}`,
    };
    return agentRunResult;
  }

  ProcessGroupRegistry.register(child);
  const stopOnAbort = (): void => {
    ProcessGroupRegistry.stop(child);
  };
  abortSignal.addEventListener('abort', stopOnAbort, { once: true });

  const toolNameById = new Map<string, string>();
  let proseText = '';
  let terminalStopReason: string | null = null;
  let errorMessage: string | null = null;
  let hasInvalidEvent = false;

  try {
    const exitReported = waitForGrokExit(child);
    const stderrCollected = collectStderr(child.stderr);
    const events = parseGrokOutput(child.stdout);

    for await (const value of events) {
      const parsedEvent = parseGrokEvent(value);
      if (parsedEvent.outcome === 'invalid') {
        hasInvalidEvent = true;
      }
      if (parsedEvent.outcome === 'recognized') {
        const { event } = parsedEvent;
        if (event.type === 'text') {
          proseText += event.data;
          await recordOutput({ provider: 'grok', kind: 'text', text: event.data });
        }
        if (event.type === 'tool_call') {
          toolNameById.set(event.toolCallId, event.toolName);
          await recordOutput({
            provider: 'grok',
            kind: 'tool_call',
            tool_name: event.toolName,
            tool_kind: event.kind,
            status: event.status,
          });
        }
        if (event.type === 'tool_call_update') {
          const toolName = toolNameById.get(event.toolCallId) ?? 'unknown';
          await recordOutput({
            provider: 'grok',
            kind: 'tool_call_update',
            tool_name: toolName,
            status: event.status,
            output_preview: buildToolResultPreview(event.rawOutput),
          });
        }
        if (event.type === 'end') {
          terminalStopReason = event.stopReason;
          await recordSession({ provider: 'grok', session_id: event.sessionId, model });
        }
        if (event.type === 'error') {
          errorMessage = event.message;
        }
      }
    }

    const [exit, stderr] = await Promise.all([exitReported, stderrCollected]);

    if (exit.outcome === 'spawn-failed') {
      const agentRunResult: AgentRunResult = {
        outcome: 'failed',
        reason: `Failed to spawn Grok: ${exit.message}`,
      };
      return agentRunResult;
    }
    if (exit.outcome === 'killed') {
      if (abortSignal.aborted) {
        const agentRunResult: AgentRunResult = {
          outcome: 'failed',
          reason: 'Aborted by cancellation',
        };
        return agentRunResult;
      }
      const agentRunResult: AgentRunResult = {
        outcome: 'failed',
        reason: `Grok was killed by ${exit.signal}`,
      };
      return agentRunResult;
    }
    if (hasInvalidEvent) {
      const agentRunResult: AgentRunResult = {
        outcome: 'failed',
        reason: 'Grok returned an unsupported stream event',
      };
      return agentRunResult;
    }
    if (errorMessage !== null) {
      const agentRunResult: AgentRunResult = { outcome: 'failed', reason: errorMessage };
      return agentRunResult;
    }
    if (exit.code !== 0) {
      const detail = stderr.length === 0 ? '' : `: ${stderr}`;
      const agentRunResult: AgentRunResult = {
        outcome: 'failed',
        reason: `Grok exited with code ${exit.code}${detail}`,
      };
      return agentRunResult;
    }
    if (terminalStopReason === null) {
      const agentRunResult: AgentRunResult = {
        outcome: 'failed',
        reason: 'Grok ended without a terminal event',
      };
      return agentRunResult;
    }
    if (terminalStopReason !== 'end_turn') {
      const agentRunResult: AgentRunResult = {
        outcome: 'failed',
        reason: `Grok stopped with ${terminalStopReason}`,
      };
      return agentRunResult;
    }

    const signalDetected =
      completionSignal !== null && detectCompletionSignal(proseText, completionSignal);
    const agentRunResult: AgentRunResult = { outcome: 'succeeded', signalDetected };
    return agentRunResult;
  } catch (error) {
    ProcessGroupRegistry.stop(child);
    if (abortSignal.aborted) {
      const agentRunResult: AgentRunResult = {
        outcome: 'failed',
        reason: 'Aborted by cancellation',
      };
      return agentRunResult;
    }
    if (error instanceof GrokOutputParseError) {
      const agentRunResult: AgentRunResult = { outcome: 'failed', reason: error.message };
      return agentRunResult;
    }
    const detail = error instanceof Error ? error.message : util.inspect(error);
    const agentRunResult: AgentRunResult = {
      outcome: 'failed',
      reason: `Grok failed: ${detail}`,
    };
    return agentRunResult;
  } finally {
    abortSignal.removeEventListener('abort', stopOnAbort);
  }
}
