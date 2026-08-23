import type { WorkflowRunNodeStatus } from '#database/schema.js';
import { sanitizeCapturedText, style } from '#cli/output.js';
import type {
  WorkflowApprovalEntry,
  WorkflowApprovalsResult,
} from '#cli/workflow/handlers/workflow-approvals.handler.js';

function approvalStatusColor(status: WorkflowRunNodeStatus): (text: string) => string {
  switch (status) {
    case 'pending':
    case 'running':
    case 'rejected':
      return style.muted;
    case 'awaiting_decision':
      return style.warn;
    case 'succeeded':
      return style.success;
    case 'failed':
      return style.error;
  }
}

function renderApproval(approval: WorkflowApprovalEntry): void {
  const { nodeId, status, message, reason } = approval;

  const color = approvalStatusColor(status);
  console.log(`  ${style.node(nodeId)}   ${color(status)}`);
  for (const line of message.split('\n')) {
    console.log(`    ${sanitizeCapturedText(line)}`);
  }
  if (reason !== null) {
    console.log('');
    console.log(`    ${style.muted('Reason')}`);
    for (const line of reason.split('\n')) {
      console.log(`      ${sanitizeCapturedText(line)}`);
    }
  }
}

export function renderWorkflowApprovalsResult(result: WorkflowApprovalsResult): void {
  const { approvals } = result;

  if (approvals.length === 0) {
    console.log('No approval requests in this run.');
    return;
  }

  console.log(style.strong('Approvals'));
  for (const [index, approval] of approvals.entries()) {
    if (index > 0) {
      console.log('');
    }
    renderApproval(approval);
  }
}
