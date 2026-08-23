import type {
  WorkflowCancelNoopResult,
  WorkflowCancellingResult,
  WorkflowCancelResult,
  WorkflowCancelledResult,
} from '#cli/workflow/handlers/workflow-run/workflow-cancel.handler.js';
import { style, symbols } from '#cli/output.js';

function renderCancelling(result: WorkflowCancellingResult): void {
  const { workflowRunId } = result;

  console.log(`${style.success(symbols.ok)} Cancelling ${style.ident(workflowRunId)}`);
}

function renderCancelled(result: WorkflowCancelledResult): void {
  const { workflowRunId } = result;

  console.log(`${style.success(symbols.ok)} Cancelled ${style.ident(workflowRunId)}`);
}

function renderNoop(result: WorkflowCancelNoopResult): void {
  const { workflowRunId, status } = result;

  console.log(
    `${style.muted(symbols.info)} Run ${style.ident(workflowRunId)} is already ${status}`,
  );
}

export function renderWorkflowCancelResult(result: WorkflowCancelResult): void {
  if (result.outcome === 'cancelling') {
    renderCancelling(result);
    return;
  }
  if (result.outcome === 'cancelled') {
    renderCancelled(result);
    return;
  }
  if (result.outcome === 'noop') {
    renderNoop(result);
    return;
  }

  result satisfies never;
}
