import { style, symbols } from '#cli/output.js';

import type {
  WorkflowApprovedResult,
  WorkflowApproveNoopResult,
  WorkflowApproveResult,
} from '#cli/workflow/handlers/workflow-run/workflow-approve.handler.js';

function renderApproved(result: WorkflowApprovedResult): void {
  const { workflowRunId, nodeId } = result;

  console.log(`${style.success(symbols.ok)} Approved ${style.node(nodeId)}`);
  renderResumeHint(workflowRunId);
}

function renderResumeHint(workflowRunId: string): void {
  if (!process.stdout.isTTY) {
    return;
  }
  console.log('');
  console.log(style.strong('Resume'));
  console.log(`  ${style.ident(`workflow resume ${workflowRunId}`)}`);
}

function renderNoop(result: WorkflowApproveNoopResult): void {
  const { nodeId } = result;

  console.log(`${style.muted(symbols.info)} Node ${style.node(nodeId)} is already approved`);
}

export function renderWorkflowApproveResult(result: WorkflowApproveResult): void {
  if (result.outcome === 'approved') {
    renderApproved(result);
    return;
  }
  if (result.outcome === 'noop') {
    renderNoop(result);
    return;
  }

  result satisfies never;
}
