import type { WorkflowValidateResult } from '#cli/workflow/handlers/workflow-validate.handler.js';
import { style, symbols } from '#cli/output.js';

export function renderWorkflowValidateResult(result: WorkflowValidateResult): void {
  if (result.verdict === 'valid') {
    const nodeNoun = result.nodeCount === 1 ? 'node' : 'nodes';
    console.log(
      `${style.success(symbols.ok)} ${style.ident(result.workflowId)} is valid  ${style.muted(`·  ${result.nodeCount} ${nodeNoun}`)}`,
    );
  } else if (result.verdict === 'invalid') {
    console.log(`${style.error(symbols.fail)} ${style.ident(result.workflowId)} is invalid`);
    for (const finding of result.findings) {
      console.log(`  ${finding}`);
    }
  } else {
    result satisfies never;
  }
}
