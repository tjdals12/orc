import type { AgentNode } from '#workflow/node/agent-node.js';
import type { LoopCompletion } from '#workflow/node/loop.js';

import { runBashScript, type BashScriptOptions } from '#shared/bash-script.js';
import type { AgentOnReject } from '#workflow/node/on-reject.js';

import type { LoopVerdictKind, NodeRunResult } from '../types.js';

import { runClaudeNode } from './claude/runner.js';
import { runCodexNode } from './codex-cli/runner.js';
import { runGrokNode } from './grok/runner.js';
import type { AgentRunResult, RecordAgentOutput, RecordAgentSession } from './types.js';

type RecordAgentIteration = (iteration: number, maxIterations: number) => Promise<void>;

type RecordAgentIterationCompleted = (iteration: number, verdict: LoopVerdictKind) => Promise<void>;

type LoopCheckResult =
  { outcome: 'answered'; verdict: LoopVerdictKind } | { outcome: 'failed'; reason: string };

type AgentInvocationOptions = {
  prompt: string;
  cwd: string;
  recordOutput: RecordAgentOutput;
  recordSession: RecordAgentSession;
  abortSignal: AbortSignal;
};

async function runAgentInvocation(
  node: AgentNode | AgentOnReject,
  options: AgentInvocationOptions & { completionSignal: string | null },
): Promise<AgentRunResult> {
  switch (node.provider) {
    case 'claude': {
      const agentRunResult = await runClaudeNode({
        ...options,
        model: node.model,
        effort: node.options.effort,
        maxTurns: node.options.maxTurns,
      });
      return agentRunResult;
    }
    case 'codex': {
      const agentRunResult = await runCodexNode({
        ...options,
        model: node.model,
        modelReasoningEffort: node.options.modelReasoningEffort,
      });
      return agentRunResult;
    }
    case 'grok': {
      const agentRunResult = await runGrokNode({
        ...options,
        model: node.model,
        reasoningEffort: node.options.reasoningEffort,
        maxTurns: node.options.maxTurns,
      });
      return agentRunResult;
    }
  }
}

function checkLoopCompletionSignal(signalDetected: boolean): LoopCheckResult {
  const verdict: LoopVerdictKind = signalDetected ? 'complete' : 'continue';
  const loopCheckResult: LoopCheckResult = { outcome: 'answered', verdict };
  return loopCheckResult;
}

async function checkLoopCompletionBash(
  script: string,
  options: BashScriptOptions,
): Promise<LoopCheckResult> {
  const bashScriptResult = await runBashScript(script, options);

  if (bashScriptResult.outcome === 'spawn-failed') {
    const loopCheckResult: LoopCheckResult = {
      outcome: 'failed',
      reason: `Failed to spawn the completion check: ${bashScriptResult.message}`,
    };
    return loopCheckResult;
  }
  if (bashScriptResult.outcome === 'killed') {
    const loopCheckResult: LoopCheckResult = {
      outcome: 'failed',
      reason: `The completion check was killed by ${bashScriptResult.signal}`,
    };
    return loopCheckResult;
  }
  if (bashScriptResult.outcome === 'exited') {
    if (bashScriptResult.code === 0) {
      const loopCheckResult: LoopCheckResult = { outcome: 'answered', verdict: 'complete' };
      return loopCheckResult;
    }
    if (bashScriptResult.code === 1) {
      const loopCheckResult: LoopCheckResult = { outcome: 'answered', verdict: 'continue' };
      return loopCheckResult;
    }

    const loopCheckResult: LoopCheckResult = {
      outcome: 'failed',
      reason: `The completion check exited with code ${bashScriptResult.code}. 0 means complete and 1 means not yet; anything else is an error in the check itself.`,
    };
    return loopCheckResult;
  }

  bashScriptResult satisfies never;
  throw new Error('Unknown bash script outcome');
}

function resolveCompletionSignal(completion: LoopCompletion): string | null {
  switch (completion.kind) {
    case 'signal':
      return completion.signal;
    case 'bash':
      return null;
  }
}

function resolveExhaustedReason(completion: LoopCompletion, maxIterations: number): string {
  switch (completion.kind) {
    case 'signal':
      return `Exceeded max iterations (${maxIterations}) without the completion signal "${completion.signal}"`;
    case 'bash':
      return `Exceeded max iterations (${maxIterations}) without completion_bash succeeding`;
  }
}

type AgentLoopOptions = {
  recordIteration: RecordAgentIteration;
  recordIterationCompleted: RecordAgentIterationCompleted;
  bashCheckOptions: BashScriptOptions;
};

export async function runAgentNode(
  node: AgentNode,
  options: AgentInvocationOptions & AgentLoopOptions,
): Promise<NodeRunResult> {
  const { abortSignal, recordIteration, recordIterationCompleted, bashCheckOptions } = options;

  const loop = node.loop;
  if (loop === null) {
    const agentRunResult = await runAgentInvocation(node, {
      ...options,
      completionSignal: null,
    });
    return agentRunResult;
  }

  const { completion, maxIterations } = loop;
  const invocationOptions = {
    ...options,
    completionSignal: resolveCompletionSignal(completion),
  };

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    if (abortSignal.aborted) {
      const nodeRunResult: NodeRunResult = {
        outcome: 'failed',
        reason: 'Aborted by cancellation',
      };
      return nodeRunResult;
    }

    await recordIteration(iteration, maxIterations);

    const agentRunResult = await runAgentInvocation(node, invocationOptions);
    if (agentRunResult.outcome === 'failed') return agentRunResult;

    let loopCheckResult: LoopCheckResult;
    switch (completion.kind) {
      case 'signal':
        loopCheckResult = checkLoopCompletionSignal(agentRunResult.signalDetected);
        break;
      case 'bash':
        loopCheckResult = await checkLoopCompletionBash(completion.script, bashCheckOptions);
        break;
      default:
        completion satisfies never;
        throw new Error('Unknown loop completion kind');
    }

    if (loopCheckResult.outcome === 'failed') {
      const nodeRunResult: NodeRunResult = {
        outcome: 'failed',
        reason: loopCheckResult.reason,
      };
      return nodeRunResult;
    }

    await recordIterationCompleted(iteration, loopCheckResult.verdict);

    if (loopCheckResult.verdict === 'complete') {
      const nodeRunResult: NodeRunResult = { outcome: 'succeeded' };
      return nodeRunResult;
    }
  }

  const nodeRunResult: NodeRunResult = {
    outcome: 'failed',
    reason: resolveExhaustedReason(completion, maxIterations),
  };
  return nodeRunResult;
}

export async function runAgentOnReject(
  onReject: AgentOnReject,
  options: AgentInvocationOptions,
): Promise<NodeRunResult> {
  const agentRunResult = await runAgentInvocation(onReject, {
    ...options,
    completionSignal: null,
  });
  return agentRunResult;
}
