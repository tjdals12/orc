import type { WorkflowLogsResult } from '#cli/workflow/handlers/workflow-logs.handler.js';
import {
  formatClockTime,
  formatNodeLogBody,
  formatSourceTag,
  measureColumnWidth,
  padToWidth,
  style,
} from '#cli/output.js';

export function renderWorkflowLogsResult(result: WorkflowLogsResult): void {
  const { workflowId, workflowRunId, logs } = result;

  if (logs.length === 0) {
    console.log('No logs recorded.');
    return;
  }

  const logNodeIds = logs.map((log) => log.node_id);
  const nodeIds = [...new Set(logNodeIds)];
  const nodeWidth = measureColumnWidth(nodeIds);

  const prefix = formatSourceTag(workflowId, workflowRunId);

  for (const log of logs) {
    const time = style.muted(formatClockTime(log.created_at));
    const node = style.node(padToWidth(log.node_id, nodeWidth));
    const body = formatNodeLogBody(log.type, log.data);
    const line = `${prefix} ${time}  ${node}  ${body}`.trimEnd();
    console.log(line);
  }
}
