import { Codex } from '@openai/codex-sdk';
import type { ModelReasoningEffort } from '@openai/codex-sdk';

import { spawnSync } from 'node:child_process';
import util from 'node:util';

import { buildPreview, collapseWhitespace, splitTextLines } from '#shared/text.js';

import { detectCompletionSignal } from '../completion-signal.js';
import { PREVIEW_LIMIT } from '../output-text.js';
import type { AgentRunResult, RecordAgentOutput, RecordAgentSession } from '../types.js';

const SIGINT_GRACE_MS = 5000;

function collectCodexCliChildPids(): number[] {
  const result = spawnSync('pgrep', ['-P', String(process.pid), '-f', 'bin/codex exec']);
  if (result.status !== 0) return [];
  const lines = result.stdout.toString().split('\n');
  const pids = lines.filter((line) => line.length > 0).map(Number);
  return pids;
}

function tryInterruptCodexCli(): void {
  const cliPids = collectCodexCliChildPids();
  for (const pid of cliPids) {
    try {
      process.kill(pid, 'SIGINT');
    } catch {
      continue;
    }
  }
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

  const proseLines: string[] = [];

  const sdkAbortController = new AbortController();
  let sigintGraceTimer: NodeJS.Timeout | null = null;
  const interruptOnAbort = (): void => {
    tryInterruptCodexCli();
    sigintGraceTimer = setTimeout(() => {
      sdkAbortController.abort();
    }, SIGINT_GRACE_MS);
    sigintGraceTimer.unref();
  };
  abortSignal.addEventListener('abort', interruptOnAbort, { once: true });

  try {
    const codex = new Codex();
    const thread = codex.startThread({
      workingDirectory: cwd,
      sandboxMode: 'danger-full-access',
      approvalPolicy: 'never',
      networkAccessEnabled: true,
      skipGitRepoCheck: true,
      model,
      ...(modelReasoningEffort === null
        ? {}
        : { modelReasoningEffort: modelReasoningEffort as ModelReasoningEffort }),
    });

    const { events } = await thread.runStreamed(prompt, { signal: sdkAbortController.signal });

    let turnFailure: string | null = null;
    let turnCompleted = false;
    for await (const event of events) {
      if (event.type === 'thread.started') {
        await recordSession({
          provider: 'codex',
          thread_id: event.thread_id,
          model,
        });
      }
      if (event.type === 'item.started' && event.item.type === 'command_execution') {
        await recordOutput({
          provider: 'codex',
          kind: 'command_execution',
          command: buildPreview(collapseWhitespace(event.item.command), PREVIEW_LIMIT),
        });
      }
      if (event.type === 'item.completed') {
        const item = event.item;
        if (item.type === 'agent_message') {
          for (const line of splitTextLines(item.text)) {
            proseLines.push(line);
            await recordOutput({ provider: 'codex', kind: 'agent_message', text: line });
          }
        }
        if (item.type === 'command_execution') {
          await recordOutput({
            provider: 'codex',
            kind: 'command_result',
            status: item.status,
            exit_code: item.exit_code ?? null,
            output_preview: buildPreview(collapseWhitespace(item.aggregated_output), PREVIEW_LIMIT),
          });
        }
        if (item.type === 'file_change') {
          await recordOutput({
            provider: 'codex',
            kind: 'file_change',
            status: item.status,
            changes: item.changes.map((change) => ({ path: change.path, kind: change.kind })),
          });
        }
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

    if (turnFailure !== null) {
      const agentRunResult: AgentRunResult = { outcome: 'failed', reason: turnFailure };
      return agentRunResult;
    }
    if (!turnCompleted) {
      const agentRunResult: AgentRunResult = {
        outcome: 'failed',
        reason: 'The agent stream ended without completing its turn',
      };
      return agentRunResult;
    }

    const proseText = proseLines.join('\n');
    const signalDetected =
      completionSignal !== null && detectCompletionSignal(proseText, completionSignal);
    const agentRunResult: AgentRunResult = { outcome: 'succeeded', signalDetected };
    return agentRunResult;
  } catch (e) {
    if (abortSignal.aborted) {
      const agentRunResult: AgentRunResult = {
        outcome: 'failed',
        reason: 'Aborted by cancellation',
      };
      return agentRunResult;
    }

    const detail = e instanceof Error ? e.message : util.inspect(e);
    const agentRunResult: AgentRunResult = {
      outcome: 'failed',
      reason: `The agent failed: ${detail}`,
    };
    return agentRunResult;
  } finally {
    abortSignal.removeEventListener('abort', interruptOnAbort);
    if (sigintGraceTimer !== null) clearTimeout(sigintGraceTimer);
  }
}
