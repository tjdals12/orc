import { spawn } from 'node:child_process';
import type { ChildProcess, ChildProcessByStdio } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import util from 'node:util';

import { checkClaudeCliCompatibility } from '#installation/provider/claude/version-check.js';
import { ProcessGroupRegistry } from '#shared/process-group-registry.js';
import { buildPreview, collapseWhitespace, splitTextLines } from '#shared/text.js';

import { detectCompletionSignal } from '../completion-signal.js';
import { JsonLinesParseError, parseJsonLines } from '../json-lines.js';
import { PREVIEW_LIMIT, tryDecodeOutputText } from '../output-text.js';
import type { AgentRunResult, RecordAgentOutput, RecordAgentSession } from '../types.js';
import { parseClaudeCliEvent } from './cli-contract.js';

type ClaudeCliProcessExit =
  | { outcome: 'spawn-failed'; message: string }
  | { outcome: 'exited'; code: number | null }
  | { outcome: 'killed'; signal: NodeJS.Signals };

type ClaudeCliResult = { subtype: string; isError: boolean; result: string; errors: string[] };

const SIGINT_GRACE_MS = 5000;

function buildClaudeCliArgs(options: {
  model: string;
  effort: string | null;
  maxTurns: number | null;
}): string[] {
  const { model, effort, maxTurns } = options;
  const args = [
    '-p',
    '--verbose',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--model',
    model,
    '--permission-mode',
    'bypassPermissions',
    '--allow-dangerously-skip-permissions',
    '--setting-sources',
    'project',
  ];
  if (effort !== null) {
    args.push('--effort', effort);
  }
  if (maxTurns !== null) {
    args.push('--max-turns', String(maxTurns));
  }
  return args;
}

function waitForClaudeCliSpawn(child: ChildProcess): Promise<void> {
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

function waitForClaudeCliExit(child: ChildProcess): Promise<ClaudeCliProcessExit> {
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
  const input = JSON.stringify({
    type: 'user',
    message: { role: 'user', content: prompt },
    parent_tool_use_id: null,
    shouldQuery: true,
    origin: { kind: 'human' },
  });

  return new Promise((resolve, reject) => {
    const rejectOnError = (error: Error): void => {
      target.off('error', rejectOnError);
      reject(error);
    };
    target.once('error', rejectOnError);
    target.end(`${input}\n`, () => {
      target.off('error', rejectOnError);
      resolve();
    });
  });
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

function buildToolInputPreview(input: unknown): string {
  const serialized = JSON.stringify(input) ?? '';
  return buildPreview(serialized, PREVIEW_LIMIT);
}

function isTextContentBlock(value: unknown): value is { type: 'text'; text: string } {
  if (value === null || typeof value !== 'object') return false;

  const record = value as Record<string, unknown>;
  return record.type === 'text' && typeof record.text === 'string';
}

function buildToolResultPreview(content: unknown): string {
  if (content === undefined) return '';
  const output = tryDecodeOutputText(content);
  if (output !== null) {
    return buildPreview(collapseWhitespace(output), PREVIEW_LIMIT);
  }
  if (Array.isArray(content)) {
    const texts = content.flatMap((block) => (isTextContentBlock(block) ? [block.text] : []));
    return buildPreview(collapseWhitespace(texts.join(' ')), PREVIEW_LIMIT);
  }

  const serialized = JSON.stringify(content) ?? '';
  return buildPreview(collapseWhitespace(serialized), PREVIEW_LIMIT);
}

function buildFailureReason(result: ClaudeCliResult): string {
  if (result.subtype === 'success') return result.result;

  const joined = result.errors.join('; ');
  if (joined.length > 0) return joined;

  return `The agent failed (${result.subtype})`;
}

export async function runClaudeNode(options: {
  model: string;
  effort: string | null;
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
    effort,
    maxTurns,
    prompt,
    cwd,
    completionSignal,
    recordOutput,
    recordSession,
    abortSignal,
  } = options;

  const compatibility = await checkClaudeCliCompatibility();
  if (abortSignal.aborted) return { outcome: 'failed', reason: 'Aborted by cancellation' };
  if (compatibility.status === 'not-found') {
    return {
      outcome: 'failed',
      reason: 'Claude CLI was not found. Install Claude Code before running this node.',
    };
  }
  if (compatibility.status === 'too-old') {
    return {
      outcome: 'failed',
      reason:
        'Claude CLI is too old. Update Claude Code to a supported version before running this node.',
    };
  }
  if (compatibility.status === 'unsupported-major') {
    return {
      outcome: 'failed',
      reason: 'Claude CLI has an unsupported major version. Update orc before running this node.',
    };
  }
  if (compatibility.status === 'check-failed') {
    return {
      outcome: 'failed',
      reason: 'Could not check Claude CLI compatibility. Run "claude --version" and try again.',
    };
  }

  let child: ChildProcessByStdio<Writable, Readable, Readable>;
  try {
    child = spawn('claude', buildClaudeCliArgs({ model, effort, maxTurns }), {
      cwd,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : util.inspect(error);
    return { outcome: 'failed', reason: `Failed to spawn Claude: ${detail}` };
  }

  let stopRequested = false;
  let sigintGraceTimer: NodeJS.Timeout | null = null;
  const stopClaudeCli = (): void => {
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
  abortSignal.addEventListener('abort', stopClaudeCli, { once: true });

  const exitReported = waitForClaudeCliExit(child);
  const stderrCollected = collectStderr(child.stderr);
  const toolNameById = new Map<string, string>();
  const proseLines: string[] = [];
  let resultMessage: ClaudeCliResult | null = null;
  let invalidEvent: { type: string | null } | null = null;

  const recordText = async (text: string): Promise<void> => {
    const lines = splitTextLines(text);

    for (const line of lines) {
      proseLines.push(line);
      await recordOutput({ provider: 'claude', kind: 'text', text: line });
    }
  };

  try {
    await waitForClaudeCliSpawn(child);
    await writePrompt(child.stdin, prompt);

    const events = parseJsonLines(child.stdout);

    for await (const value of events) {
      const parsedEvent = parseClaudeCliEvent(value);
      if (parsedEvent.outcome === 'invalid' && invalidEvent === null) {
        invalidEvent = { type: parsedEvent.eventType };
      }
      if (parsedEvent.outcome === 'recognized') {
        const { event } = parsedEvent;
        if (event.type === 'system_init') {
          await recordSession({
            provider: 'claude',
            session_id: event.sessionId,
            model: event.model,
          });
        }
        if (event.type === 'assistant') {
          for (const block of event.content) {
            if (block.type === 'text') {
              await recordText(block.text);
            }
            if (block.type === 'tool_use') {
              toolNameById.set(block.id, block.name);
              await recordOutput({
                provider: 'claude',
                kind: 'tool_use',
                tool_name: block.name,
                input_preview: buildToolInputPreview(block.input),
              });
            }
          }
        }
        if (event.type === 'user') {
          for (const block of event.content) {
            const toolName = toolNameById.get(block.toolUseId) ?? 'unknown';
            await recordOutput({
              provider: 'claude',
              kind: 'tool_result',
              tool_name: toolName,
              is_error: block.isError,
              result_preview: buildToolResultPreview(block.content),
            });
          }
        }
        if (event.type === 'result') {
          resultMessage = {
            subtype: event.subtype,
            isError: event.isError,
            result: event.result,
            errors: event.errors,
          };
        }
      }
    }

    const [exit, stderr] = await Promise.all([exitReported, stderrCollected]);
    if (exit.outcome === 'spawn-failed') {
      return { outcome: 'failed', reason: `Failed to spawn Claude: ${exit.message}` };
    }
    if (abortSignal.aborted) return { outcome: 'failed', reason: 'Aborted by cancellation' };
    if (exit.outcome === 'killed') {
      return { outcome: 'failed', reason: `Claude was killed by ${exit.signal}` };
    }
    if (invalidEvent !== null) {
      const eventName = invalidEvent.type ?? 'stream';
      return { outcome: 'failed', reason: `Claude returned an invalid ${eventName} event` };
    }
    if (resultMessage !== null && (resultMessage.subtype !== 'success' || resultMessage.isError)) {
      return { outcome: 'failed', reason: buildFailureReason(resultMessage) };
    }
    if (exit.code !== 0) {
      const detail = stderr.length === 0 ? '' : `: ${stderr}`;
      return { outcome: 'failed', reason: `Claude exited with code ${exit.code}${detail}` };
    }
    if (resultMessage === null) {
      return { outcome: 'failed', reason: 'The agent stream ended without a result' };
    }
    if (resultMessage.subtype === 'success') {
      const proseText = proseLines.join('\n');
      const signalDetected =
        completionSignal !== null && detectCompletionSignal(proseText, completionSignal);
      return { outcome: 'succeeded', signalDetected };
    }

    return { outcome: 'failed', reason: buildFailureReason(resultMessage) };
  } catch (error) {
    stopClaudeCli();
    await Promise.allSettled([exitReported, stderrCollected]);
    if (abortSignal.aborted) return { outcome: 'failed', reason: 'Aborted by cancellation' };
    if (error instanceof JsonLinesParseError) {
      return { outcome: 'failed', reason: 'Claude returned invalid JSON' };
    }
    const detail = error instanceof Error ? error.message : util.inspect(error);
    return { outcome: 'failed', reason: `Claude failed: ${detail}` };
  } finally {
    abortSignal.removeEventListener('abort', stopClaudeCli);
    if (sigintGraceTimer !== null) clearTimeout(sigintGraceTimer);
  }
}
