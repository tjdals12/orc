import { style, symbols } from '#cli/output.js';
import type {
  WorkflowRejectedResult,
  WorkflowRejectNoopResult,
  WorkflowRejectResult,
} from '#cli/workflow/handlers/workflow-run/workflow-reject.handler.js';

function renderRejected(result: WorkflowRejectedResult): void {
  const { workflowRunId, nodeId, runCancelled, hasOnReject } = result;

  console.log(`${style.success(symbols.ok)} Rejected ${style.node(nodeId)}`);
  if (runCancelled) {
    console.log(`${style.muted(symbols.info)} Run ${style.ident(workflowRunId)} is cancelled`);
  }
  if (hasOnReject) {
    console.log(
      `${style.muted(symbols.info)} Run ${style.ident(workflowRunId)} stays paused — resume runs on_reject`,
    );
  }
}

function renderNoop(result: WorkflowRejectNoopResult): void {
  const { nodeId } = result;

  console.log(`${style.muted(symbols.info)} Node ${style.node(nodeId)} is already rejected`);
}

export function renderWorkflowRejectResult(result: WorkflowRejectResult): void {
  if (result.outcome === 'rejected') {
    renderRejected(result);
    return;
  }
  if (result.outcome === 'noop') {
    renderNoop(result);
    return;
  }

  result satisfies never;
}
