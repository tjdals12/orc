import { parseEventDetail } from '#workflow-run/events.js';
import { parseBashOutputLogData } from '#workflow-run/logs.js';
import type { PendingApproval, WorkflowExecutionResult } from '#workflow-run/executor/types.js';
import type {
  WorkflowRunEvent,
  WorkflowRunHookLog,
  WorkflowRunNodeLog,
} from '#workflow-run/repository.js';

import type {
  WorkflowRunPlan,
  WorkflowRunProgress,
  WorkflowRunResult,
} from '#cli/workflow/handlers/workflow-run/types.js';
import type {
  WorkflowResumePlan,
  WorkflowResumeProgress,
  WorkflowResumeResult,
} from '#cli/workflow/handlers/workflow-run/workflow-resume.handler.js';
import type { WorktreeEnvironmentInfo } from '#cli/workflow/handlers/workflow-run/worktree-environment-provisioner.js';
import {
  eventGutterColor,
  formatBashOutputBody,
  formatClockTime,
  formatElapsedSeconds,
  formatInfoBlock,
  formatNodeLogBody,
  measureColumnWidth,
  padToWidth,
  sanitizeCapturedText,
  style,
  symbols,
} from '#cli/output.js';

function renderRunHeader(plan: WorkflowRunPlan): void {
  const { projectName, workflowId, workflowRunId, workflowRunNodeCount } = plan;

  console.error(`${style.ident(symbols.running)} Running workflow`);
  console.error('');
  console.error(style.strong('Info'));
  const rows: [string, string][] = [
    ['Project', projectName],
    ['Workflow', workflowId],
    ['Run', style.ident(workflowRunId)],
    ['Nodes', String(workflowRunNodeCount)],
  ];
  const lines = formatInfoBlock(rows);
  for (const line of lines) {
    console.error(line);
  }
  console.error('');
}

function renderResumeHeader(plan: WorkflowResumePlan): void {
  const { projectName, workflowId, workflowRunId, remainingNodeCount, totalNodeCount } = plan;

  console.error(`${style.ident(symbols.running)} Resuming workflow`);
  console.error('');
  console.error(style.strong('Info'));
  const rows: [string, string][] = [
    ['Project', projectName],
    ['Workflow', workflowId],
    ['Run', style.ident(workflowRunId)],
    ['Nodes', `${totalNodeCount} (${remainingNodeCount} remaining)`],
  ];
  const lines = formatInfoBlock(rows);
  for (const line of lines) {
    console.error(line);
  }
  console.error('');
}

function renderArtifactsBlock(artifactsDirPath: string): void {
  console.error(style.strong('Artifacts'));
  const rows: [string, string][] = [['Path', style.ident(artifactsDirPath)]];
  const lines = formatInfoBlock(rows);
  for (const line of lines) {
    console.error(line);
  }
  console.error('');
}

function renderApprovalsBlock(approvals: PendingApproval[]): void {
  console.error('');
  console.error(style.strong('Approvals'));
  for (const [index, approval] of approvals.entries()) {
    if (index > 0) {
      console.error('');
    }
    console.error(`  ${style.node(approval.nodeId)}`);
    for (const line of approval.message.split('\n')) {
      console.error(`    ${sanitizeCapturedText(line)}`);
    }
  }
}

export function renderWorktreeBlock(info: WorktreeEnvironmentInfo): void {
  const { branch, worktreePath } = info;

  console.error(style.strong('Worktree'));
  const rows: [string, string][] = [
    ['Branch', style.ident(branch)],
    ['Path', style.ident(worktreePath)],
  ];
  const lines = formatInfoBlock(rows);
  for (const line of lines) {
    console.error(line);
  }
  console.error('');
}

type WorkflowRunStreamRenderer = {
  onEvent: (event: WorkflowRunEvent) => void;
  onLog: (log: WorkflowRunNodeLog) => void;
  onHookLog: (hookLog: WorkflowRunHookLog) => void;
};

function buildStreamRenderer(nodeLabels: string[]): WorkflowRunStreamRenderer {
  const nodeWidth = measureColumnWidth(nodeLabels);

  let streamTitlePrinted = false;

  const emitLine = (gutter: string, createdAt: string, nodeColumn: string, body: string) => {
    if (!streamTitlePrinted) {
      console.error(style.strong('Stream'));
      streamTitlePrinted = true;
    }
    const time = style.muted(formatClockTime(createdAt));
    console.error(`  ${gutter}  ${time}  ${nodeColumn}   ${body}`);
  };

  const emitEvent = (event: WorkflowRunEvent, detail: string | null) => {
    const color = eventGutterColor(event.type);
    const gutter = color(event.node_id === null ? symbols.runEvent : symbols.nodeEvent);
    const node = style.node(padToWidth(event.node_id ?? '', nodeWidth));
    const body = detail === null ? event.type : `${event.type}  ${style.muted(detail)}`;
    emitLine(gutter, event.created_at, node, body);
  };

  const onEvent = (event: WorkflowRunEvent) => {
    const detail = parseEventDetail(event.type, event.data);
    emitEvent(event, detail);
  };

  const onLog = (log: WorkflowRunNodeLog) => {
    const gutter = style.muted(symbols.nodeLog);
    const node = style.node(padToWidth(log.node_id, nodeWidth));
    const body = formatNodeLogBody(log.type, log.data);
    emitLine(gutter, log.created_at, node, body);
  };

  const onHookLog = (hookLog: WorkflowRunHookLog) => {
    const { stream, text } = parseBashOutputLogData(hookLog.data);
    const gutter = style.muted(symbols.nodeLog);
    const file = style.muted(padToWidth(hookLog.file, nodeWidth));
    const body = formatBashOutputBody(stream, text);
    emitLine(gutter, hookLog.created_at, file, body);
  };

  return {
    onEvent,
    onLog,
    onHookLog,
  };
}

export function beginWorkflowRun(plan: WorkflowRunPlan): WorkflowRunProgress {
  renderRunHeader(plan);

  if (plan.artifactsDirPath !== null) {
    renderArtifactsBlock(plan.artifactsDirPath);
  }

  const streamRenderer = buildStreamRenderer(plan.nodeLabels);
  const progress: WorkflowRunProgress = {
    onEvent: streamRenderer.onEvent,
    onLog: streamRenderer.onLog,
    onHookLog: streamRenderer.onHookLog,
  };
  return progress;
}

export function beginWorkflowRunQuietly(): WorkflowRunProgress {
  const progress: WorkflowRunProgress = {
    onEvent: () => {},
    onLog: () => {},
    onHookLog: () => {},
  };
  return progress;
}

export function beginWorkflowResume(plan: WorkflowResumePlan): WorkflowResumeProgress {
  renderResumeHeader(plan);

  if (plan.artifactsDirPath !== null) {
    renderArtifactsBlock(plan.artifactsDirPath);
  }

  if (plan.worktree !== null) {
    renderWorktreeBlock(plan.worktree);
  }

  const streamRenderer = buildStreamRenderer(plan.nodeLabels);
  const progress: WorkflowResumeProgress = {
    onEvent: streamRenderer.onEvent,
    onLog: streamRenderer.onLog,
    onHookLog: streamRenderer.onHookLog,
  };
  return progress;
}

export function beginWorkflowResumeQuietly(): WorkflowResumeProgress {
  const progress: WorkflowResumeProgress = {
    onEvent: () => {},
    onLog: () => {},
    onHookLog: () => {},
  };
  return progress;
}

export function renderWorkflowRunResult(result: WorkflowRunResult): void {
  const { outcome, run } = result;

  console.error('');
  if (outcome.kind === 'detached') {
    renderDetachedLine(outcome.workerPid);
  } else if (outcome.kind === 'executed' && outcome.execution.outcome === 'succeeded') {
    renderSucceededLine(outcome.execution.nodeCount, outcome.execution.elapsedSeconds);
  } else {
    renderWorkflowRunStoppedSignal(result);
  }
  const approvals =
    outcome.kind === 'executed' && outcome.execution.outcome === 'paused'
      ? outcome.execution.approvals
      : [];
  if (approvals.length > 0) {
    renderApprovalsBlock(approvals);
  }
  renderInspectBlock(run.id, approvals);
}

export function renderWorkflowRunStoppedSignal(result: WorkflowRunResult): void {
  const { outcome } = result;

  if (outcome.kind === 'detached') {
    return;
  }
  if (outcome.kind === 'provisioning-failed') {
    console.error(
      `${style.error(symbols.fail)} Failed during provisioning  ${style.muted(`·  ${outcome.reason}`)}`,
    );
    return;
  }
  if (outcome.kind === 'cancelled') {
    console.error(`${style.error(symbols.fail)} Cancelled`);
    return;
  }
  if (outcome.kind === 'executed') {
    renderExecutionStoppedLine(outcome.execution);
    return;
  }
  outcome satisfies never;
}

export function renderWorkflowResumeStoppedSignal(result: WorkflowResumeResult): void {
  const { outcome } = result;

  if (outcome.kind === 'noop' || outcome.kind === 'detached') {
    return;
  }
  if (outcome.kind === 'executed') {
    renderExecutionStoppedLine(outcome.execution);
    return;
  }
  outcome satisfies never;
}

export function renderWorkflowResumeResult(result: WorkflowResumeResult): void {
  const { outcome, run } = result;

  if (outcome.kind === 'noop') {
    console.error(`${style.muted(symbols.info)} Run ${style.ident(run.id)} is already succeeded`);
    return;
  }

  console.error('');
  if (outcome.kind === 'detached') {
    renderDetachedLine(outcome.workerPid);
  } else if (outcome.execution.outcome === 'succeeded') {
    renderSucceededLine(outcome.execution.nodeCount, outcome.execution.elapsedSeconds);
  } else {
    renderWorkflowResumeStoppedSignal(result);
  }
  const approvals =
    outcome.kind === 'executed' && outcome.execution.outcome === 'paused'
      ? outcome.execution.approvals
      : [];
  if (approvals.length > 0) {
    renderApprovalsBlock(approvals);
  }
  renderInspectBlock(run.id, approvals);
}

function renderSucceededLine(nodeCount: number, elapsedSeconds: number): void {
  const nodeNoun = nodeCount === 1 ? 'node' : 'nodes';
  const detail = style.muted(
    `·  ${nodeCount} ${nodeNoun}, ${formatElapsedSeconds(elapsedSeconds)}`,
  );
  console.error(`${style.success(symbols.ok)} Succeeded  ${detail}`);
}

function renderDetachedLine(workerPid: number): void {
  console.error(`${style.success(symbols.ok)} Detached  ${style.muted(`·  pid ${workerPid}`)}`);
}

function renderExecutionStoppedLine(execution: WorkflowExecutionResult): void {
  if (execution.outcome === 'succeeded') {
    return;
  }
  if (execution.outcome === 'paused') {
    const { approvals } = execution;
    const approvalNoun = approvals.length === 1 ? 'approval' : 'approvals';
    console.error(
      `${style.warn(symbols.warn)} Paused  ${style.muted(`·  ${approvals.length} ${approvalNoun} pending`)}`,
    );
    return;
  }
  if (execution.outcome === 'failed') {
    const { nodeId, reason } = execution;
    console.error(
      `${style.error(symbols.fail)} Failed at ${nodeId}  ${style.muted(`·  ${reason}`)}`,
    );
    return;
  }
  if (execution.outcome === 'cancelled') {
    console.error(`${style.error(symbols.fail)} Cancelled`);
    return;
  }
  execution satisfies never;
}

export function renderWorkflowRunCancelling(): void {
  console.error('');
  console.error(
    `${style.muted(symbols.running)} Cancelling  ${style.muted('·  waiting for nodes to stop')}`,
  );
  console.error(
    `${style.warn(symbols.warn)} Do not press Ctrl-C again — it quits now and leaves the record incomplete.`,
  );
  console.error('');
}

function renderInspectBlock(workflowRunId: string, approvals: PendingApproval[]): void {
  if (!process.stderr.isTTY) {
    return;
  }
  console.error('');
  console.error(style.strong('Inspect'));
  for (const approval of approvals) {
    console.error(`  ${style.ident(`workflow approve ${workflowRunId} ${approval.nodeId}`)}`);
    console.error(`  ${style.ident(`workflow reject ${workflowRunId} ${approval.nodeId}`)}`);
  }
  if (approvals.length > 0) {
    console.error(`  ${style.ident(`workflow approvals ${workflowRunId}`)}`);
  }
  console.error(`  ${style.ident(`workflow status ${workflowRunId}`)}`);
  console.error(`  ${style.ident(`workflow stream ${workflowRunId}`)}`);
}
