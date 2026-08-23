import type { WorkflowEventsResult } from '#cli/workflow/handlers/workflow-events.handler.js';
import {
  formatClockTime,
  formatSourceTag,
  measureColumnWidth,
  padToWidth,
  style,
} from '#cli/output.js';
import { parseEventDetail } from '#workflow-run/events.js';

export function renderWorkflowEventsResult(result: WorkflowEventsResult): void {
  const { workflowId, workflowRunId, events } = result;

  if (events.length === 0) {
    console.log('No events recorded.');
    return;
  }

  const eventNodeIds = events.map((event) => event.node_id).filter((nodeId) => nodeId !== null);
  const nodeIds = [...new Set(eventNodeIds)];
  const nodeWidth = measureColumnWidth(nodeIds);
  const typeWidth = measureColumnWidth(events.map((event) => event.type));

  const prefix = formatSourceTag(workflowId, workflowRunId);

  for (const event of events) {
    const time = style.muted(formatClockTime(event.created_at));
    const node = style.node(padToWidth(event.node_id ?? '', nodeWidth));
    const type = padToWidth(event.type, typeWidth);
    const detail = parseEventDetail(event.type, event.data);
    const suffix = detail === null ? '' : `   ${style.muted(detail)}`;
    const line = `${prefix} ${time}  ${node}  ${type}${suffix}`.trimEnd();
    console.log(line);
  }
}
