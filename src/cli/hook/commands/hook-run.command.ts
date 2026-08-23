import { Command } from 'commander';

import { WORKTREE_HOOK_PHASES } from '#database/schema.js';
import { ExecutionEnvironmentError } from '#execution-environment/error.js';
import { HookRunHandler, type HookRunProgress } from '#cli/hook/handlers/hook-run.handler.js';
import {
  buildHookRunStreamRenderer,
  renderHookRunCleanupFailureResult,
  renderHookRunEnvironmentInfo,
  renderHookRunHeader,
  renderHookRunResult,
} from '#cli/hook/views/hook-run.view.js';

export const hookRunCommand = new Command('run')
  .description("Run this project's worktree hooks in a throwaway worktree")
  .argument('<phase>', `Hook phase (${WORKTREE_HOOK_PHASES.join(' | ')})`)
  .option('--dry-run', 'Print the rendered hook scripts without running them')
  .action(async (phase: string, options: { dryRun?: boolean }) => {
    const hookPhase = WORKTREE_HOOK_PHASES.find((hookPhase) => hookPhase === phase);
    if (hookPhase === undefined) {
      throw new ExecutionEnvironmentError(
        `Unknown hook phase "${phase}". Expected one of: ${WORKTREE_HOOK_PHASES.join(', ')}.`,
      );
    }

    const projectPath = process.cwd();

    const handler = new HookRunHandler((plan) => {
      renderHookRunHeader({ phase: plan.phase });
      renderHookRunEnvironmentInfo({ branch: plan.branch, worktreePath: plan.worktreePath });

      const streamRenderer = buildHookRunStreamRenderer(plan.hookFiles);
      const progress: HookRunProgress = {
        onStep: streamRenderer.onStep,
        onHookOutput: streamRenderer.onHookOutput,
        onCleanupFailure: (messages) => {
          renderHookRunCleanupFailureResult({ messages });
        },
      };
      return progress;
    });
    const result = await handler.execute(projectPath, {
      hookPhase,
      dryRun: options.dryRun ?? false,
    });

    renderHookRunResult(result);
  });
