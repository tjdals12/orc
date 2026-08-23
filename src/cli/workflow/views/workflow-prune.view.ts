import ora from 'ora';

import type {
  WorkflowPrunePlan,
  WorkflowPruneProgress,
  WorkflowPruneResult,
} from '#cli/workflow/handlers/workflow-prune.handler.js';
import {
  formatBashOutputBody,
  formatKeptBranchRows,
  formatPrunedDetail,
  formatWorktreeTeardownStep,
  measureColumnWidth,
  padToWidth,
  runStatusColor,
  style,
  symbols,
} from '#cli/output.js';
import type { WorktreeTeardownStep } from '#execution-environment/worktree.js';

export function renderWorkflowPruneHeader(plan: WorkflowPrunePlan): void {
  const { workflowRunId, workflowId, status } = plan;

  const coloredStatus = runStatusColor(status)(status);
  console.error(
    `${style.ident(symbols.running)} Pruning ${style.ident(workflowRunId)}  ${style.workflow(workflowId)}  ${coloredStatus}`,
  );
}

export function buildWorkflowPruneProgressRenderer(hookFiles: string[]): WorkflowPruneProgress {
  const fileWidth = measureColumnWidth(hookFiles);
  const spinner = ora({ stream: process.stderr, text: style.muted('Pruning…') });

  const start = () => {
    spinner.start();
  };

  const onStep = (step: WorktreeTeardownStep) => {
    if (step.kind === 'run-hooks') {
      spinner.stop();
      return;
    }
    spinner.start(style.muted(formatWorktreeTeardownStep(step)));
  };

  const onHookOutput = (file: string, stream: 'stdout' | 'stderr', text: string) => {
    const gutter = style.muted(symbols.nodeLog);
    const fileColumn = style.muted(padToWidth(file, fileWidth));
    const body = formatBashOutputBody(stream, text);
    console.error(`  ${gutter}  ${fileColumn}   ${body}`);
  };

  const stop = () => {
    spinner.stop();
  };

  return {
    start,
    onStep,
    onHookOutput,
    stop,
  };
}

export function renderWorkflowPruneResult(result: WorkflowPruneResult): void {
  const { workflowRunId, keptBranch, warnings, worktreeCount, reclaimedBytes } = result;

  if (keptBranch !== null) {
    const rows = formatKeptBranchRows(keptBranch);
    for (const row of rows) {
      console.error(row);
    }
  }
  for (const warning of warnings) {
    console.error(`${style.warn(symbols.warn)} ${warning}`);
  }

  const detail = style.muted(`·  ${formatPrunedDetail(worktreeCount, reclaimedBytes)}`);
  console.error('');
  console.error(`${style.success(symbols.ok)} Pruned ${style.ident(workflowRunId)}  ${detail}`);
}
