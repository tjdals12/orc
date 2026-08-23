import type { WorkflowHookLogsResult } from '#cli/workflow/handlers/workflow-hook-logs.handler.js';
import {
  formatBashOutputBody,
  formatClockTime,
  formatSourceTag,
  measureColumnWidth,
  padToWidth,
  style,
} from '#cli/output.js';
import { parseBashOutputLogData } from '#workflow-run/logs.js';

export function renderWorkflowHookLogsResult(result: WorkflowHookLogsResult): void {
  const { workflowId, workflowRunId, hookLogs, ranInPlace } = result;

  if (hookLogs.length === 0) {
    const message = ranInPlace
      ? 'No hook logs recorded. This run executed in place.'
      : 'No hook logs recorded.';
    console.log(message);
    return;
  }

  const hookLogFiles = hookLogs.map((hookLog) => hookLog.file);
  const files = [...new Set(hookLogFiles)];
  const fileWidth = measureColumnWidth(files);

  const prefix = formatSourceTag(workflowId, workflowRunId);

  for (const hookLog of hookLogs) {
    const { stream, text } = parseBashOutputLogData(hookLog.data);
    const time = style.muted(formatClockTime(hookLog.created_at));
    const file = style.muted(padToWidth(hookLog.file, fileWidth));
    const body = formatBashOutputBody(stream, text);
    const line = `${prefix} ${time}  ${file}  ${body}`.trimEnd();
    console.log(line);
  }
}
