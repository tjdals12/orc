import ora from 'ora';

import type {
  ProjectOrphansPrunedResult,
  ProjectPrunedResult,
  ProjectPruneNotRegisteredResult,
  ProjectPrunePlan,
  ProjectPruneResult,
  ProjectPruneRunOutcome,
  ProjectPruneRunProgress,
  ProjectPruneRunTarget,
} from '#cli/project/handlers/project-prune.handler.js';
import {
  formatBashOutputBody,
  formatBytes,
  formatKeptBranchRows,
  formatPrunedDetail,
  formatWorktreeTeardownStep,
  measureColumnWidth,
  padToWidth,
  style,
  symbols,
} from '#cli/output.js';
import type { WorktreeTeardownStep } from '#execution-environment/worktree.js';

function renderNotRegistered(result: ProjectPruneNotRegisteredResult): void {
  console.log(`${style.warn(symbols.warn)} ${result.projectName} is not registered`);
}

export function renderProjectPruneHeader(plan: ProjectPrunePlan): void {
  console.error(`${style.ident(symbols.running)} Pruning ${plan.projectName}`);
  console.error('');
}

export function buildProjectPruneProgressRenderer(workflowIds: string[]): ProjectPruneRunProgress {
  const workflowIdWidth = measureColumnWidth(workflowIds);
  const spinner = ora({ stream: process.stderr, text: style.muted('Pruning…') });

  let rowPrefix = '';
  let fileWidth = 0;

  const onPruneStart = (run: ProjectPruneRunTarget, hookFiles: string[]) => {
    rowPrefix = `  ${style.ident(run.workflowRunId)}  ${padToWidth(run.workflowId, workflowIdWidth)}   `;
    fileWidth = measureColumnWidth(hookFiles);
    spinner.prefixText = rowPrefix;
    spinner.start(style.muted('Pruning…'));
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

  const onPruneFinish = (outcome: ProjectPruneRunOutcome) => {
    const { keptBranch, warnings, reclaimedBytes } = outcome;

    spinner.stop();
    console.error(`${rowPrefix}${style.muted(formatBytes(reclaimedBytes))}`);
    if (keptBranch !== null) {
      const keptBranchRows = formatKeptBranchRows(keptBranch);
      for (const keptBranchRow of keptBranchRows) {
        console.error(keptBranchRow);
      }
    }
    for (const warning of warnings) {
      console.error(`${style.warn(symbols.warn)} ${warning}`);
    }
  };

  const onPruneCleanup = () => {
    spinner.stop();
  };

  return {
    onPruneStart,
    onStep,
    onHookOutput,
    onPruneFinish,
    onPruneCleanup,
  };
}

function renderSummary(result: ProjectPrunedResult): void {
  const { prunedRunIds, worktreeCount, reclaimedBytes } = result;

  const runNoun = prunedRunIds.length === 1 ? 'run' : 'runs';
  const detail = style.muted(`·  ${formatPrunedDetail(worktreeCount, reclaimedBytes)}`);
  console.error('');
  console.error(`${style.success(symbols.ok)} Pruned ${prunedRunIds.length} ${runNoun}  ${detail}`);
}

function renderNoRuns(): void {
  console.error('No runs to prune.');
}

function renderSkippedRuns(result: ProjectPrunedResult): void {
  const { skippedRunIds } = result;

  const runPhrase = skippedRunIds.length === 1 ? 'run is' : 'runs are';
  console.error('');
  console.error(
    `${style.warn(symbols.warn)} ${skippedRunIds.length} ${runPhrase} still running — cancel before pruning:`,
  );
  for (const skippedRunId of skippedRunIds) {
    console.error(`    ${style.ident(`orc workflow cancel ${skippedRunId}`)}`);
  }
}

function renderPausedRuns(result: ProjectPrunedResult): void {
  const { pausedRunIds } = result;

  const runPhrase = pausedRunIds.length === 1 ? 'run is' : 'runs are';
  console.error('');
  console.error(
    `${style.warn(symbols.warn)} ${pausedRunIds.length} ${runPhrase} awaiting a decision — cancel before pruning:`,
  );
  for (const pausedRunId of pausedRunIds) {
    console.error(`    ${style.ident(`orc workflow cancel ${pausedRunId}`)}`);
  }
}

function renderOrphans(args: {
  orphanedDirPaths: string[];
  orphansRemoved: boolean;
  projectName: string | null;
}): void {
  const { orphanedDirPaths, orphansRemoved, projectName } = args;

  const directoryNoun = orphanedDirPaths.length === 1 ? 'directory' : 'directories';
  if (orphansRemoved) {
    console.error(
      `${style.success(symbols.ok)} Removed ${orphanedDirPaths.length} orphaned ${directoryNoun}.`,
    );
  } else {
    console.error(
      `${style.warn(symbols.warn)} ${orphanedDirPaths.length} orphaned ${directoryNoun} found — use --force to remove:`,
    );
  }
  for (const orphanedDirPath of orphanedDirPaths) {
    console.error(`    ${style.muted(orphanedDirPath)}`);
  }
  if (!orphansRemoved && process.stderr.isTTY) {
    const target = projectName === null ? '' : ` ${projectName}`;
    console.error(style.muted(`  orc project prune${target} --force`));
  }
}

function renderOrphansOnly(result: ProjectOrphansPrunedResult): void {
  const { orphanedDirPaths, orphansRemoved } = result;

  if (orphanedDirPaths.length === 0) {
    console.error('No orphaned directories found.');
    return;
  }

  renderOrphans({ orphanedDirPaths, orphansRemoved, projectName: null });
}

function renderPruned(result: ProjectPrunedResult): void {
  const nothingToPrune =
    result.prunedRunIds.length === 0 &&
    result.skippedRunIds.length === 0 &&
    result.pausedRunIds.length === 0 &&
    result.orphanedDirPaths.length === 0;
  if (nothingToPrune) {
    renderNoRuns();
    return;
  }

  if (result.prunedRunIds.length > 0) {
    renderSummary(result);
  }
  if (result.skippedRunIds.length > 0) {
    renderSkippedRuns(result);
  }
  if (result.pausedRunIds.length > 0) {
    renderPausedRuns(result);
  }
  if (result.orphanedDirPaths.length > 0) {
    console.error('');
    renderOrphans({
      orphanedDirPaths: result.orphanedDirPaths,
      orphansRemoved: result.orphansRemoved,
      projectName: result.projectName,
    });
  }
}

export function renderProjectPruneResult(result: ProjectPruneResult): void {
  if (result.outcome === 'not-registered') {
    renderNotRegistered(result);
    return;
  }
  if (result.outcome === 'orphans-pruned') {
    renderOrphansOnly(result);
    return;
  }
  if (result.outcome === 'pruned') {
    renderPruned(result);
    return;
  }

  result satisfies never;
}
