import pc from 'picocolors';
import stringWidth from 'string-width';

import type {
  WorkflowRunEventType,
  WorkflowRunNodeLogType,
  WorkflowRunStatus,
} from '#database/schema.js';
import type { WorktreeTeardownStep } from '#execution-environment/worktree.js';
import { parseAgentOutputLogData, parseBashOutputLogData } from '#workflow-run/logs.js';

export const symbols = {
  ok: '✔',
  fail: '✖',
  warn: '⚠',
  info: 'ℹ',
  pending: '○',
  running: '●',
  nodeEvent: '◆',
  runEvent: '◇',
  nodeLog: '│',
  agentText: '>',
  agentToolUse: '⚙',
  agentToolResult: '↳',
};

export const style = {
  success: (text: string): string => pc.green(text),
  error: (text: string): string => pc.red(text),
  warn: (text: string): string => pc.yellow(text),
  muted: (text: string): string => pc.dim(text),
  strong: (text: string): string => pc.bold(text),
  ident: (text: string): string => pc.cyan(text),
  node: (text: string): string => pc.yellow(text),
  workflow: (text: string): string => pc.green(text),
};

export function measureWidth(text: string): number {
  return stringWidth(text);
}

export function measureColumnWidth(cells: string[]): number {
  const width = Math.max(0, ...cells.map((cell) => measureWidth(cell)));
  return width;
}

export function padToWidth(text: string, width: number): string {
  const padding = ' '.repeat(Math.max(0, width - measureWidth(text)));
  const padded = `${text}${padding}`;
  return padded;
}

const ELLIPSIS = '...';

export function truncateToWidth(text: string, maxWidth: number): string {
  if (measureWidth(text) <= maxWidth) {
    return text;
  }

  const budget = maxWidth - measureWidth(ELLIPSIS);
  const segmenter = new Intl.Segmenter();
  let kept = '';
  let keptWidth = 0;
  for (const { segment } of segmenter.segment(text)) {
    const segmentWidth = measureWidth(segment);
    if (keptWidth + segmentWidth > budget) break;
    kept += segment;
    keptWidth += segmentWidth;
  }

  const truncated = `${kept}${ELLIPSIS}`;
  return truncated;
}

const ANSI_ESCAPE_PATTERN =
  // eslint-disable-next-line no-control-regex
  /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][\s\S]*?(?:\u0007|\u001b\\|$)|[P^_X][\s\S]*?(?:\u001b\\|$)|[ -/]*[0-~])/g;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/g;

export function sanitizeCapturedText(text: string): string {
  const withoutEscapes = text.replace(ANSI_ESCAPE_PATTERN, '');
  const sanitized = withoutEscapes.replace(CONTROL_CHARACTER_PATTERN, ' ');
  return sanitized;
}

function formatLogPreview(preview: string): string {
  const sanitized = sanitizeCapturedText(preview);
  const formatted = sanitized.length > 0 ? style.muted(sanitized) : sanitized;
  return formatted;
}

export function formatBashOutputBody(stream: 'stdout' | 'stderr', text: string): string {
  const sanitized = sanitizeCapturedText(text);
  const body = stream === 'stderr' && sanitized.length > 0 ? style.muted(sanitized) : sanitized;
  return body;
}

export function formatInfoBlock(rows: [string, string][]): string[] {
  const labelWidth = measureColumnWidth(rows.map((row) => row[0]));
  const lines = rows.map((row) => `  ${style.muted(padToWidth(row[0], labelWidth))}   ${row[1]}`);
  return lines;
}

export function formatNextStepRows(rows: [string, string][]): string[] {
  const labelWidth = measureColumnWidth(rows.map(([label]) => label));
  const lines = rows.map(
    ([label, command]) => `  ${padToWidth(label, labelWidth)}   ${style.ident(command)}`,
  );
  return lines;
}

export function formatCommandRows(rows: [string, string][]): string[] {
  const commandWidth = measureColumnWidth(rows.map(([command]) => command));
  const lines = rows.map(
    ([command, label]) =>
      `  ${style.ident(padToWidth(command, commandWidth))}   ${style.muted(label)}`,
  );
  return lines;
}

export function formatClockTime(timestamp: string): string {
  const time = new Date(timestamp).toTimeString().slice(0, 8);
  return time;
}

export function formatRelativeTime(timestamp: string): string {
  const elapsedMs = Date.now() - new Date(timestamp).getTime();

  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 60) {
    return 'just now';
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months}mo ago`;
  }

  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

export function formatElapsedSeconds(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }

  if (totalSeconds < 3600) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

const BYTE_UNITS = ['B', 'kB', 'MB', 'GB', 'TB'];

export function formatBytes(totalBytes: number): string {
  let value = totalBytes;
  let unitIndex = 0;
  while (value >= 1000 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }

  const unit = BYTE_UNITS[unitIndex] ?? 'TB';
  const rounded = unitIndex === 0 ? String(value) : value.toFixed(1);
  return `${rounded} ${unit}`;
}

export function formatWorktreeTeardownStep(step: WorktreeTeardownStep): string {
  switch (step.kind) {
    case 'run-hooks':
      return `Running ${step.phase} hooks…`;
    case 'remove-worktree':
      return 'Removing the worktree…';
    case 'delete-branch':
      return 'Deleting the branch…';
  }
}

export function formatPrunedDetail(worktreeCount: number, reclaimedBytes: number): string {
  const parts: string[] = [];
  if (worktreeCount > 0) {
    const worktreeNoun = worktreeCount === 1 ? 'worktree' : 'worktrees';
    parts.push(`${worktreeCount} ${worktreeNoun}`);
  }
  parts.push(`${formatBytes(reclaimedBytes)} reclaimed`);

  const detail = parts.join(', ');
  return detail;
}

export function formatKeptBranchRows(branch: string): string[] {
  const rows = [
    `${style.warn(symbols.warn)} Kept the branch ${style.ident(branch)} — it has unmerged work.`,
    style.muted(`  Delete it with --force, or run "git branch -D ${branch}".`),
  ];
  return rows;
}

export function formatDuration(startedAt: string | null, finishedAt: string | null): string {
  if (startedAt === null || finishedAt === null) {
    return '-';
  }
  const elapsedMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  const elapsedSeconds = elapsedMs / 1000;
  const duration = formatElapsedSeconds(elapsedSeconds);
  return duration;
}

export function formatSourceTag(workflowId: string, workflowRunId: string): string {
  const workflowTag = style.workflow(`[${workflowId}]`);
  const shortRunId = style.ident(workflowRunId.slice(0, 8));
  const separator = style.muted('-');
  const sourceTag = `${workflowTag} ${shortRunId} ${separator}`;
  return sourceTag;
}

export function eventGutterColor(type: WorkflowRunEventType): (text: string) => string {
  switch (type) {
    case 'run_started':
    case 'run_resumed':
    case 'agent_session_started':
    case 'iteration_started':
    case 'iteration_completed':
    case 'worktree_creating':
    case 'files_copying':
    case 'hook_started':
      return (text) => text;
    case 'node_started':
      return style.ident;
    case 'decision_requested':
    case 'run_paused':
      return style.warn;
    case 'run_succeeded':
    case 'node_succeeded':
    case 'decision_approved':
      return style.success;
    case 'run_failed':
    case 'node_failed':
      return style.error;
    case 'run_cancelled':
    case 'decision_rejected':
      return style.muted;
  }
}

export function formatNodeLogBody(logType: WorkflowRunNodeLogType, data: string): string {
  if (logType === 'bash_output') {
    const { stream, text } = parseBashOutputLogData(data);
    const body = formatBashOutputBody(stream, text);
    return body;
  }
  if (logType === 'agent_output') {
    const output = parseAgentOutputLogData(data);
    if (output.provider === 'claude') {
      if (output.kind === 'text') {
        const body = `${symbols.agentText} ${sanitizeCapturedText(output.text)}`;
        return body;
      }
      if (output.kind === 'tool_use') {
        const toolName = sanitizeCapturedText(output.tool_name);
        const preview = formatLogPreview(output.input_preview);
        const body = `${symbols.agentToolUse} ${toolName} ${preview}`;
        return body;
      }
      if (output.kind === 'tool_result') {
        const toolName = sanitizeCapturedText(output.tool_name);
        const outcome = output.is_error ? 'failed ' : '';
        const preview = formatLogPreview(output.result_preview);
        const body = `${symbols.agentToolResult} ${toolName} ${outcome}${preview}`;
        return body;
      }

      output satisfies never;
      throw new Error('Unknown claude output kind');
    }
    if (output.provider === 'codex') {
      if (output.kind === 'agent_message') {
        const body = `${symbols.agentText} ${sanitizeCapturedText(output.text)}`;
        return body;
      }
      if (output.kind === 'command_execution') {
        const body = `${symbols.agentToolUse} ${sanitizeCapturedText(output.command)}`;
        return body;
      }
      if (output.kind === 'command_result') {
        const outcome = output.status === 'failed' ? 'failed ' : '';
        const exit = output.exit_code === null ? '' : `(exit ${output.exit_code}) `;
        const preview = formatLogPreview(output.output_preview);
        const body = `${symbols.agentToolResult} ${outcome}${exit}${preview}`;
        return body;
      }
      if (output.kind === 'file_change') {
        const outcome = output.status === 'failed' ? 'failed ' : '';
        const changes = output.changes
          .map((change) => `${change.kind} ${sanitizeCapturedText(change.path)}`)
          .join(', ');
        const body = `${symbols.agentToolUse} ${outcome}${changes}`;
        return body;
      }

      output satisfies never;
      throw new Error('Unknown codex output kind');
    }

    output satisfies never;
    throw new Error('Unknown agent output provider');
  }

  logType satisfies never;
  throw new Error('Unknown workflow run node log type');
}

export function runStatusColor(status: WorkflowRunStatus): (text: string) => string {
  switch (status) {
    case 'pending':
      return style.muted;
    case 'running':
      return style.ident;
    case 'paused':
      return style.warn;
    case 'succeeded':
      return style.success;
    case 'failed':
      return style.error;
    case 'cancelled':
      return style.muted;
  }
}

const DEAD_RUN_SUFFIX = ` (${symbols.warn} dead)`;

export function formatDeadRunStatusText(status: WorkflowRunStatus): string {
  const text = `${status}${DEAD_RUN_SUFFIX}`;
  return text;
}

export function formatDeadRunStatus(status: WorkflowRunStatus): string {
  const colored = runStatusColor(status)(status);
  const formatted = `${colored}${style.warn(DEAD_RUN_SUFFIX)}`;
  return formatted;
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function printJsonLine(value: unknown): void {
  console.log(JSON.stringify(value));
}
