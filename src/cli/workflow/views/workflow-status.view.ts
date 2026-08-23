import type { WorkflowStatusResult } from '#cli/workflow/handlers/workflow-status.handler.js';
import {
  formatClockTime,
  formatDuration,
  formatInfoBlock,
  formatRelativeTime,
  formatDeadRunStatus,
  measureColumnWidth,
  padToWidth,
  runStatusColor,
  style,
  symbols,
  truncateToWidth,
  sanitizeCapturedText,
} from '#cli/output.js';
import type { WorkflowRunNodeStatus } from '#database/schema.js';
import type { ExecutionEnvironment } from '#execution-environment/repository.js';
import { buildPreview, collapseWhitespace } from '#shared/text.js';
import { parseEventDetail, parseNodeFailedEventData } from '#workflow-run/events.js';
import type { WorkflowRunEvent, WorkflowRunNode } from '#workflow-run/repository.js';

const INPUT_PREVIEW_LIMIT = 200;
const MESSAGE_PREVIEW_WIDTH = 60;

function nodeStatusColor(status: WorkflowRunNodeStatus): (text: string) => string {
  switch (status) {
    case 'pending':
      return style.muted;
    case 'running':
      return style.ident;
    case 'awaiting_decision':
      return style.warn;
    case 'rejected':
      return style.muted;
    case 'succeeded':
      return style.success;
    case 'failed':
      return style.error;
  }
}

function nodeStatusSymbol(status: WorkflowRunNodeStatus): string {
  switch (status) {
    case 'pending':
      return symbols.pending;
    case 'running':
      return symbols.running;
    case 'awaiting_decision':
      return symbols.warn;
    case 'rejected':
      return symbols.fail;
    case 'succeeded':
      return symbols.ok;
    case 'failed':
      return symbols.fail;
  }
}

function nodeStatusDetail(node: WorkflowRunNode): string {
  const { status, started_at, finished_at } = node;
  if (status === 'succeeded' || status === 'failed') {
    return formatDuration(started_at, finished_at);
  }
  return status;
}

function collectNodeFailureReason(events: WorkflowRunEvent[]): Map<string, string> {
  const failureReasonByNodeId = new Map<string, string>();
  for (const event of events) {
    const { type, node_id, data } = event;
    if (type === 'node_failed' && node_id !== null) {
      const { reason } = parseNodeFailedEventData(data);
      failureReasonByNodeId.set(node_id, reason);
    }
  }
  return failureReasonByNodeId;
}

function renderNodesSection(
  nodes: WorkflowRunNode[],
  failureReasonByNodeId: Map<string, string>,
): void {
  console.log('');
  console.log(style.strong('Nodes'));

  const nodeIdWidth = measureColumnWidth(nodes.map((node) => node.node_id));
  for (const node of nodes) {
    const { status, node_id, attempt, message } = node;

    const color = nodeStatusColor(status);
    const symbol = nodeStatusSymbol(status);
    const nodeId = style.node(padToWidth(node_id, nodeIdWidth));
    const attemptSuffix = attempt > 1 ? ` (attempt ${attempt})` : '';
    const detail = style.muted(`${nodeStatusDetail(node)}${attemptSuffix}`);
    const reason = failureReasonByNodeId.get(node_id);
    const failure = status === 'failed' && reason !== undefined ? `   ${style.muted(reason)}` : '';
    let messageSuffix = '';
    if (status === 'awaiting_decision' && message !== null) {
      const preview = truncateToWidth(
        collapseWhitespace(sanitizeCapturedText(message)),
        MESSAGE_PREVIEW_WIDTH,
      );
      messageSuffix = `   ${style.muted(preview)}`;
    }
    console.log(`  ${color(symbol)} ${nodeId}   ${detail}${failure}${messageSuffix}`);
  }
}

function renderEventsSection(workflowRunId: string, events: WorkflowRunEvent[]): void {
  if (events.length === 0) {
    return;
  }

  const shownEvents = events.slice(-10);
  const truncated = events.length > shownEvents.length;
  const count = truncated ? style.muted(`   (last ${shownEvents.length} of ${events.length})`) : '';

  console.log('');
  console.log(`${style.strong('Events')}${count}`);

  const nodeWidth = measureColumnWidth(shownEvents.map((event) => event.node_id ?? ''));
  const typeWidth = measureColumnWidth(shownEvents.map((event) => event.type));
  for (const shownEvent of shownEvents) {
    const time = style.muted(formatClockTime(shownEvent.created_at));
    const node = style.node(padToWidth(shownEvent.node_id ?? '', nodeWidth));
    const type = padToWidth(shownEvent.type, typeWidth);
    const detail = parseEventDetail(shownEvent.type, shownEvent.data);
    const suffix = detail === null ? '' : `   ${style.muted(detail)}`;
    const line = `  ${time}  ${node}  ${type}${suffix}`.trimEnd();
    console.log(line);
  }

  if (truncated) {
    console.log('');
    console.log(style.muted(`  Full timeline:  orc workflow events ${workflowRunId}`));
  }
}

function formatEnvironmentKind(environment: ExecutionEnvironment | null): string {
  if (environment === null) {
    return '-';
  }
  switch (environment.kind) {
    case 'in-place':
      return 'in place';
    case 'worktree':
      return 'worktree';
  }
}

export function renderWorkflowStatusResult(workflowStatusResult: WorkflowStatusResult): void {
  const { run, runIsDead, environment, nodes, events } = workflowStatusResult;
  const {
    id: workflowRunId,
    workflow_id: workflowId,
    status,
    input,
    started_at: startedAt,
    finished_at: finishedAt,
  } = run;

  console.log(`${style.strong('Run')} ${style.ident(workflowRunId)}`);
  console.log('');

  const statusColor = runStatusColor(status);
  const renderedStatus = runIsDead ? formatDeadRunStatus(status) : statusColor(status);
  const started = startedAt === null ? '-' : formatRelativeTime(startedAt);
  const duration = formatDuration(startedAt, finishedAt);
  const inputPreview =
    input === null ? '-' : buildPreview(collapseWhitespace(input), INPUT_PREVIEW_LIMIT);
  const rows: [string, string][] = [
    ['Workflow', workflowId],
    ['Status', renderedStatus],
    ['Input', inputPreview],
    ['Started', started],
    ['Duration', duration],
    ['Environment', formatEnvironmentKind(environment)],
  ];
  if (environment !== null) {
    if (environment.branch !== null) {
      rows.push(['Branch', style.ident(environment.branch)]);
    }
    rows.push(['Path', style.ident(environment.path)]);
  }
  const lines = formatInfoBlock(rows);
  for (const line of lines) {
    console.log(line);
  }

  const failureReasonByNodeId = collectNodeFailureReason(events);
  renderNodesSection(nodes, failureReasonByNodeId);
  renderEventsSection(workflowRunId, events);
  if (runIsDead) {
    renderResumeHint(workflowRunId);
  }
}

function renderResumeHint(workflowRunId: string): void {
  if (!process.stdout.isTTY) {
    return;
  }
  console.log('');
  console.log(style.strong('Resume'));
  console.log(`  ${style.ident(`workflow resume ${workflowRunId}`)}`);
}
