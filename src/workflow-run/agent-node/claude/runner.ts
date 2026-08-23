import { query } from '@anthropic-ai/claude-agent-sdk';
import type { EffortLevel, SDKResultMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

import util from 'node:util';

import { buildPreview, collapseWhitespace, splitTextLines } from '#shared/text.js';

import { detectCompletionSignal } from '../completion-signal.js';
import { PREVIEW_LIMIT } from '../output-text.js';
import type { AgentRunResult, RecordAgentOutput, RecordAgentSession } from '../types.js';

type UserContentBlock = Exclude<SDKUserMessage['message']['content'], string>[number];
type ToolResultContent = Extract<UserContentBlock, { type: 'tool_result' }>['content'];

function buildToolInputPreview(input: unknown): string {
  const serialized = JSON.stringify(input) ?? '';
  const preview = buildPreview(serialized, PREVIEW_LIMIT);
  return preview;
}

function buildToolResultPreview(content: ToolResultContent): string {
  if (content === undefined) {
    return '';
  }
  if (typeof content === 'string') {
    const preview = buildPreview(collapseWhitespace(content), PREVIEW_LIMIT);
    return preview;
  }

  const texts = content.filter((block) => block.type === 'text').map((block) => block.text);
  const preview = buildPreview(collapseWhitespace(texts.join(' ')), PREVIEW_LIMIT);
  return preview;
}

function buildFailureReason(result: SDKResultMessage): string {
  if (result.subtype === 'success') {
    return result.result;
  }

  const joined = result.errors.join('; ');
  if (joined.length > 0) {
    return joined;
  }

  const reason = `The agent failed (${result.subtype})`;
  return reason;
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

  const abortController = new AbortController();
  const abortQuery = (): void => {
    abortController.abort();
  };
  abortSignal.addEventListener('abort', abortQuery, { once: true });

  const toolNameByUseId = new Map<string, string>();
  const proseLines: string[] = [];

  const recordText = async (text: string): Promise<void> => {
    for (const line of splitTextLines(text)) {
      proseLines.push(line);
      await recordOutput({ provider: 'claude', kind: 'text', text: line });
    }
  };

  try {
    const response = query({
      prompt,
      options: {
        cwd,
        abortController,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        systemPrompt: { type: 'preset', preset: 'claude_code' },
        settingSources: ['project'],
        model,
        ...(effort === null ? {} : { effort: effort as EffortLevel }),
        ...(maxTurns === null ? {} : { maxTurns }),
      },
    });

    let resultMessage: SDKResultMessage | null = null;
    for await (const message of response) {
      if (message.type === 'system' && message.subtype === 'init') {
        await recordSession({
          provider: 'claude',
          session_id: message.session_id,
          model: message.model,
        });
      }
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            await recordText(block.text);
          }
          if (block.type === 'tool_use') {
            toolNameByUseId.set(block.id, block.name);
            await recordOutput({
              provider: 'claude',
              kind: 'tool_use',
              tool_name: block.name,
              input_preview: buildToolInputPreview(block.input),
            });
          }
        }
      }
      if (message.type === 'user' && typeof message.message.content !== 'string') {
        for (const block of message.message.content) {
          if (block.type !== 'tool_result') continue;
          const toolName = toolNameByUseId.get(block.tool_use_id) ?? 'unknown';
          await recordOutput({
            provider: 'claude',
            kind: 'tool_result',
            tool_name: toolName,
            is_error: block.is_error ?? false,
            result_preview: buildToolResultPreview(block.content),
          });
        }
      }
      if (message.type === 'result') {
        resultMessage = message;
      }
    }

    if (resultMessage === null) {
      const agentRunResult: AgentRunResult = {
        outcome: 'failed',
        reason: 'The agent stream ended without a result',
      };
      return agentRunResult;
    }
    if (resultMessage.subtype === 'success' && !resultMessage.is_error) {
      const proseText = proseLines.join('\n');
      const signalDetected =
        completionSignal !== null && detectCompletionSignal(proseText, completionSignal);
      const agentRunResult: AgentRunResult = { outcome: 'succeeded', signalDetected };
      return agentRunResult;
    }

    const agentRunResult: AgentRunResult = {
      outcome: 'failed',
      reason: buildFailureReason(resultMessage),
    };
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
    abortSignal.removeEventListener('abort', abortQuery);
  }
}
