import { spawn } from 'node:child_process';
import type { ChildProcess, ChildProcessByStdio } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import util from 'node:util';

import { ProcessGroupRegistry } from '#shared/process-group-registry.js';
import { buildPreview, collapseWhitespace, splitTextLines } from '#shared/text.js';
import { checkCodexCliCompatibility } from '#installation/provider/codex-cli/version-check.js';

import { detectCompletionSignal } from '../completion-signal.js';
import { JsonLinesParseError, parseJsonLines } from '../json-lines.js';
import { PREVIEW_LIMIT, tryDecodeOutputText } from '../output-text.js';
import type { AgentRunResult, RecordAgentOutput, RecordAgentSession } from '../types.js';
import { parseCodexCliEvent } from './contract.js';

type CodexCliProcessExit =
  | { outcome: 'spawn-failed'; message: string }
  | { outcome: 'exited'; code: number | null }
  | { outcome: 'killed'; signal: NodeJS.Signals };

const SIGINT_GRACE_MS = 5000;

function buildCodexCliArgs(options: {
  model: string;
  modelReasoningEffort: string | null;
  cwd: string;
}): string[] {
  const { model, modelReasoningEffort, cwd } = options;
  const args = [
    'exec',
    '--json',
    '--model',
    model,
    '--sandbox',
    'danger-full-access',
    '--cd',
    cwd,
    '--skip-git-repo-check',
    '--config',
    'approval_policy="never"',
    '--config',
    'sandbox_workspace_write.network_access=true',
  ];
  if (modelReasoningEffort !== null) {
    args.push('--config', `model_reasoning_effort=${JSON.stringify(modelReasoningEffort)}`);
  }
  args.push('-');
  return args;
}

function waitForCodexCliSpawn(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const resolveOnSpawn = (): void => {
      child.off('error', rejectOnError);
      resolve();
    };
    const rejectOnError = (error: Error): void => {
      child.off('spawn', resolveOnSpawn);
      reject(error);
    };
    child.once('spawn', resolveOnSpawn);
    child.once('error', rejectOnError);
  });
}

function waitForCodexCliExit(child: ChildProcess): Promise<CodexCliProcessExit> {
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

function writePrompt(target: Writable, prompt: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const rejectOnError = (error: Error): void => {
      target.off('error', rejectOnError);
      reject(error);
    };
    target.once('error', rejectOnError);
    target.end(prompt, () => {
      target.off('error', rejectOnError);
      resolve();
    });
  });
}

function buildCommandResultPreview(aggregatedOutput: unknown): string {
  const output = tryDecodeOutputText(aggregatedOutput);
  if (output !== null) {
    return buildPreview(collapseWhitespace(output), PREVIEW_LIMIT);
  }

  const serialized = JSON.stringify(aggregatedOutput) ?? '';
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

export async function runCodexNode(options: {
  model: string;
  modelReasoningEffort: string | null;
  prompt: string;
  cwd: string;
  completionSignal: string | null;
  recordOutput: RecordAgentOutput;
  recordSession: RecordAgentSession;
  abortSignal: AbortSignal;
}): Promise<AgentRunResult> {
  const {
    model,
    modelReasoningEffort,
    prompt,
    cwd,
    completionSignal,
    recordOutput,
    recordSession,
    abortSignal,
  } = options;

  const compatibility = await checkCodexCliCompatibility();
  if (abortSignal.aborted) {
    return { outcome: 'failed', reason: 'Aborted by cancellation' };
  }
  if (compatibility.status === 'not-found') {
    return {
      outcome: 'failed',
      reason: 'Codex CLI was not found. Install Codex before running this node.',
    };
  }
  if (compatibility.status === 'too-old') {
    return {
      outcome: 'failed',
      reason: 'Codex CLI is too old. Update Codex to a supported version before running this node.',
    };
  }
  if (compatibility.status === 'unsupported-major') {
    return {
      outcome: 'failed',
      reason: 'Codex CLI has an unsupported major version. Update orc before running this node.',
    };
  }
  if (compatibility.status === 'check-failed') {
    return {
      outcome: 'failed',
      reason: 'Could not check Codex CLI compatibility. Run "codex --version" and try again.',
    };
  }

  let child: ChildProcessByStdio<Writable, Readable, Readable>;
  try {
    child = spawn('codex', buildCodexCliArgs({ model, modelReasoningEffort, cwd }), {
      cwd,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : util.inspect(error);
    return { outcome: 'failed', reason: `Failed to spawn Codex: ${detail}` };
  }

  let stopRequested = false;
  let sigintGraceTimer: NodeJS.Timeout | null = null;
  const stopCodexCli = (): void => {
    if (stopRequested) return;
    stopRequested = true;

    try {
      child.kill('SIGINT');
    } catch {
      return;
    }

    sigintGraceTimer = setTimeout(() => {
      ProcessGroupRegistry.stop(child);
    }, SIGINT_GRACE_MS);
    sigintGraceTimer.unref();
  };
  ProcessGroupRegistry.register(child);
  abortSignal.addEventListener('abort', stopCodexCli, { once: true });

  const exitReported = waitForCodexCliExit(child);
  const stderrCollected = collectStderr(child.stderr);
  const proseLines: string[] = [];
  let turnCompleted = false;
  let turnFailure: string | null = null;
  let invalidEvent: { type: string | null } | null = null;

  try {
    await waitForCodexCliSpawn(child);
    await writePrompt(child.stdin, prompt);

    const events = parseJsonLines(child.stdout);

    for await (const value of events) {
      const parsedEvent = parseCodexCliEvent(value);
      if (parsedEvent.outcome === 'invalid' && invalidEvent === null) {
        invalidEvent = { type: parsedEvent.eventType };
      }
      if (parsedEvent.outcome !== 'recognized') continue;

      const { event } = parsedEvent;
      if (event.type === 'thread.started') {
        await recordSession({ provider: 'codex', thread_id: event.thread_id, model });
      }
      if (event.type === 'item.started') {
        await recordOutput({
          provider: 'codex',
          kind: 'command_execution',
          command: buildPreview(collapseWhitespace(event.item.command), PREVIEW_LIMIT),
        });
      }
      if (event.type === 'item.completed' && event.item.type === 'agent_message') {
        const lines = splitTextLines(event.item.text);
        for (const line of lines) {
          proseLines.push(line);
          await recordOutput({ provider: 'codex', kind: 'agent_message', text: line });
        }
      }
      if (event.type === 'item.completed' && event.item.type === 'command_execution') {
        await recordOutput({
          provider: 'codex',
          kind: 'command_result',
          status: event.item.status,
          exit_code: event.item.exit_code ?? null,
          output_preview: buildCommandResultPreview(event.item.aggregated_output),
        });
      }
      if (event.type === 'item.completed' && event.item.type === 'file_change') {
        await recordOutput({
          provider: 'codex',
          kind: 'file_change',
          status: event.item.status,
          changes: event.item.changes.map((change) => ({ path: change.path, kind: change.kind })),
        });
      }
      if (event.type === 'turn.completed') {
        turnCompleted = true;
      }
      if (event.type === 'turn.failed') {
        turnFailure = event.error.message;
      }
      if (event.type === 'error') {
        turnFailure = event.message;
      }
    }

    const [exit, stderr] = await Promise.all([exitReported, stderrCollected]);
    if (exit.outcome === 'spawn-failed') {
      return { outcome: 'failed', reason: `Failed to spawn Codex: ${exit.message}` };
    }
    if (abortSignal.aborted) {
      return { outcome: 'failed', reason: 'Aborted by cancellation' };
    }
    if (exit.outcome === 'killed') {
      return { outcome: 'failed', reason: `Codex was killed by ${exit.signal}` };
    }
    if (invalidEvent !== null) {
      const eventName = invalidEvent.type ?? 'stream';
      return { outcome: 'failed', reason: `Codex returned an invalid ${eventName} event` };
    }
    if (turnFailure !== null) {
      return { outcome: 'failed', reason: turnFailure };
    }
    if (exit.code !== 0) {
      const detail = stderr.length === 0 ? '' : `: ${stderr}`;
      return { outcome: 'failed', reason: `Codex exited with code ${exit.code}${detail}` };
    }
    if (!turnCompleted) {
      return { outcome: 'failed', reason: 'The agent stream ended without completing its turn' };
    }

    const proseText = proseLines.join('\n');
    const signalDetected =
      completionSignal !== null && detectCompletionSignal(proseText, completionSignal);
    return { outcome: 'succeeded', signalDetected };
  } catch (error) {
    stopCodexCli();
    await Promise.allSettled([exitReported, stderrCollected]);
    if (abortSignal.aborted) {
      return { outcome: 'failed', reason: 'Aborted by cancellation' };
    }
    if (error instanceof JsonLinesParseError) {
      return { outcome: 'failed', reason: 'Codex returned invalid JSON' };
    }
    const detail = error instanceof Error ? error.message : util.inspect(error);
    return { outcome: 'failed', reason: `Codex failed: ${detail}` };
  } finally {
    abortSignal.removeEventListener('abort', stopCodexCli);
    if (sigintGraceTimer !== null) clearTimeout(sigintGraceTimer);
  }
}
