import type { WorkflowStopResult } from '#cli/workflow/handlers/workflow-run/workflow-stop.handler.js';
import { style, symbols } from '#cli/output.js';

export function renderWorkflowStopResult(result: WorkflowStopResult): void {
  if (result.status === 'stopped') {
    console.log(`${style.muted(symbols.info)} Run ${style.ident(result.workflowRunId)} is stopped`);
    return;
  }
  if (result.outcome === 'noop') {
    console.log(
      `${style.muted(symbols.info)} Run ${style.ident(result.workflowRunId)} is already stopping`,
    );
    return;
  }

  console.log(`${style.success(symbols.ok)} Stopping ${style.ident(result.workflowRunId)}`);
  console.log(
    `${style.warn(symbols.warn)} Uncommitted Git changes and untracked files will be discarded`,
  );
  console.log(`  ${style.ident(`workflow status ${result.workflowRunId}`)}`);
}
