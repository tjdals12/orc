import type {
  WorkflowStreamFollowResult,
  WorkflowStreamResult,
} from '#cli/workflow/handlers/workflow-stream.handler.js';
import {
  eventGutterColor,
  formatBashOutputBody,
  formatClockTime,
  formatNodeLogBody,
  formatSourceTag,
  measureWidth,
  padToWidth,
  style,
  symbols,
} from '#cli/output.js';
import { parseEventDetail } from '#workflow-run/events.js';
import type { WorkflowRunStreamEntry } from '#workflow-run/follow.js';
import { parseBashOutputLogData } from '#workflow-run/logs.js';
import type {
  WorkflowRunEvent,
  WorkflowRunHookLog,
  WorkflowRunNodeLog,
} from '#workflow-run/repository.js';

export function buildWorkflowStreamRenderer(
  workflowId: string,
  workflowRunId: string,
): (entries: WorkflowRunStreamEntry[]) => void {
  const prefix = formatSourceTag(workflowId, workflowRunId);

  let nodeWidth = 0;
  let typeWidth = 0;

  const growWidths = (entries: WorkflowRunStreamEntry[]): void => {
    for (const entry of entries) {
      if (entry.kind === 'event') {
        const nodeId = entry.event.node_id;
        if (nodeId !== null) {
          nodeWidth = Math.max(nodeWidth, measureWidth(nodeId));
        }
        typeWidth = Math.max(typeWidth, measureWidth(entry.event.type));
        continue;
      }
      if (entry.kind === 'log') {
        nodeWidth = Math.max(nodeWidth, measureWidth(entry.log.node_id));
        continue;
      }
      nodeWidth = Math.max(nodeWidth, measureWidth(entry.hookLog.file));
    }
  };

  const renderEventLine = (event: WorkflowRunEvent): void => {
    const color = eventGutterColor(event.type);
    const gutter = color(event.node_id === null ? symbols.runEvent : symbols.nodeEvent);
    const time = style.muted(formatClockTime(event.created_at));
    const node = style.node(padToWidth(event.node_id ?? '', nodeWidth));
    const type = padToWidth(event.type, typeWidth);
    const detail = parseEventDetail(event.type, event.data);
    const suffix = detail === null ? '' : `   ${style.muted(detail)}`;
    const line = `${prefix} ${gutter} ${time}  ${node}  ${type}${suffix}`.trimEnd();
    console.log(line);
  };

  const renderLogLine = (log: WorkflowRunNodeLog): void => {
    const gutter = style.muted(symbols.nodeLog);
    const time = style.muted(formatClockTime(log.created_at));
    const node = style.node(padToWidth(log.node_id, nodeWidth));
    const body = formatNodeLogBody(log.type, log.data);
    const line = `${prefix} ${gutter} ${time}  ${node}  ${body}`.trimEnd();
    console.log(line);
  };

  const renderHookLogLine = (hookLog: WorkflowRunHookLog): void => {
    const { stream, text } = parseBashOutputLogData(hookLog.data);
    const gutter = style.muted(symbols.nodeLog);
    const time = style.muted(formatClockTime(hookLog.created_at));
    const file = style.muted(padToWidth(hookLog.file, nodeWidth));
    const body = formatBashOutputBody(stream, text);
    const line = `${prefix} ${gutter} ${time}  ${file}  ${body}`.trimEnd();
    console.log(line);
  };

  const renderEntries = (entries: WorkflowRunStreamEntry[]): void => {
    growWidths(entries);

    for (const entry of entries) {
      if (entry.kind === 'event') {
        renderEventLine(entry.event);
        continue;
      }
      if (entry.kind === 'log') {
        renderLogLine(entry.log);
        continue;
      }
      if (entry.kind === 'hook_log') {
        renderHookLogLine(entry.hookLog);
        continue;
      }
      entry satisfies never;
    }
  };

  return renderEntries;
}

export function renderWorkflowStreamResult(result: WorkflowStreamResult): void {
  const { workflowId, workflowRunId, entries } = result;

  if (entries.length === 0) {
    console.log('No events or logs recorded.');
    return;
  }

  const renderEntries = buildWorkflowStreamRenderer(workflowId, workflowRunId);
  renderEntries(entries);
}

export function renderWorkflowStreamFollowResult(
  result: WorkflowStreamFollowResult,
  json: boolean,
): void {
  const { outcome, entryCount } = result;

  if (outcome === 'dead') {
    console.error(`${style.warn(symbols.warn)} The process running this run is gone.`);
    return;
  }
  if (outcome === 'deleted') {
    console.error(`${style.warn(symbols.warn)} This run was deleted.`);
    return;
  }
  if (entryCount === 0 && !json) {
    console.log('No events or logs recorded.');
  }
}
