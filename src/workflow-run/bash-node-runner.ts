import type { BashNode } from '#workflow/node/bash-node.js';

import { runBashScript, type BashScriptOptions } from '#shared/bash-script.js';
import type { BashOnReject } from '#workflow/node/on-reject.js';

import type { NodeRunResult } from './types.js';

export async function runBashNode(
  node: BashNode | BashOnReject,
  options: BashScriptOptions,
): Promise<NodeRunResult> {
  const bashScriptResult = await runBashScript(node.script, options);

  if (bashScriptResult.outcome === 'spawn-failed') {
    const nodeRunResult: NodeRunResult = {
      outcome: 'failed',
      reason: `Failed to spawn bash: ${bashScriptResult.message}`,
    };
    return nodeRunResult;
  }
  if (bashScriptResult.outcome === 'killed') {
    const nodeRunResult: NodeRunResult = {
      outcome: 'failed',
      reason: `Killed by ${bashScriptResult.signal}`,
    };
    return nodeRunResult;
  }
  if (bashScriptResult.outcome === 'exited') {
    if (bashScriptResult.code === 0) {
      const nodeRunResult: NodeRunResult = { outcome: 'succeeded' };
      return nodeRunResult;
    }

    const nodeRunResult: NodeRunResult = {
      outcome: 'failed',
      reason: `Exited with code ${bashScriptResult.code}`,
    };
    return nodeRunResult;
  }

  bashScriptResult satisfies never;
  throw new Error('Unknown bash script outcome');
}
