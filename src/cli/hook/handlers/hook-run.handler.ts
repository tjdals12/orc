import { randomUUID } from 'node:crypto';

import type { WorktreeHookPhase } from '#database/schema.js';
import { buildConfigPath, buildHookRunWorktreePath, buildProjectPaths } from '#shared/path.js';
import { loadConfigOrThrow } from '#installation/config/load.js';
import { loadProjectConfigOrThrow } from '#project/config/load.js';
import { MergedConfig } from '#project/merged-config/merged-config.js';
import { renderWorktreeHooks } from '#execution-environment/worktree-hook.js';
import {
  provisionWorktree,
  tryDiscardWorktree,
  type WorktreeProvisionStep,
} from '#execution-environment/worktree.js';

export type HookRunNoHooksResult = {
  outcome: 'no-hooks';
  phase: WorktreeHookPhase;
};

export type HookRunDryRunResult = {
  outcome: 'dry-run';
  renderedHooks: { file: string; script: string }[];
};

export type HookRunExecutionResult = {
  outcome: 'executed';
  hookCount: number;
  elapsedSeconds: number;
  cleanupFailures: string[];
};

export type HookRunResult = HookRunNoHooksResult | HookRunDryRunResult | HookRunExecutionResult;

export type HookRunHeaderInfo = {
  phase: WorktreeHookPhase;
};

export type HookRunEnvironmentInfo = {
  branch: string;
  worktreePath: string;
};

export type HookRunCleanupFailureResult = {
  messages: string[];
};

type HookRunPlan = {
  phase: WorktreeHookPhase;
  hookFiles: string[];
  branch: string;
  worktreePath: string;
};

export type HookRunProgress = {
  onStep: (step: WorktreeProvisionStep) => void;
  onHookOutput: (file: string, stream: 'stdout' | 'stderr', text: string) => void;
  onCleanupFailure: (messages: string[]) => void;
};

export class HookRunHandler {
  constructor(private readonly _beginRun: (plan: HookRunPlan) => HookRunProgress) {}

  async execute(
    projectPath: string,
    args: { hookPhase: WorktreeHookPhase; dryRun: boolean },
  ): Promise<HookRunResult> {
    const { projectConfigPath, projectHooksDirPath } = buildProjectPaths(projectPath);
    const projectConfig = loadProjectConfigOrThrow(projectConfigPath);

    const configPath = buildConfigPath();
    const globalConfig = loadConfigOrThrow(configPath);

    const mergedConfig = MergedConfig.merge(projectHooksDirPath, globalConfig, projectConfig);

    const hookFiles = mergedConfig.worktree.listHookFiles(args.hookPhase);
    if (hookFiles.length === 0) {
      const noHooks: HookRunResult = { outcome: 'no-hooks', phase: args.hookPhase };
      return noHooks;
    }

    if (args.dryRun) {
      const worktreePath = buildHookRunWorktreePath('dry-run');
      const renderedHooks = renderWorktreeHooks({
        hooksDirPath: projectHooksDirPath,
        files: hookFiles,
        context: {
          repoPath: projectPath,
          worktreePath,
          branch: 'orc/hook-run',
        },
      });
      const dryRun: HookRunResult = { outcome: 'dry-run', renderedHooks };
      return dryRun;
    }

    const hookRunId = randomUUID();
    const worktreePath = buildHookRunWorktreePath(hookRunId);
    const branch = `orc/hook-run-${hookRunId.slice(0, 8)}`;

    const progress = this._beginRun({ phase: args.hookPhase, hookFiles, branch, worktreePath });

    const startedAtMs = Date.now();

    let cleanupPromise: Promise<string[]> | null = null;
    const cleanUpOnce = (): Promise<string[]> => {
      if (cleanupPromise === null) {
        cleanupPromise = tryDiscardWorktree({ repoPath: projectPath, worktreePath, branch });
      }
      return cleanupPromise;
    };

    const onSignal = (): void => {
      void cleanUpOnce()
        .then((failureMessages) => {
          if (failureMessages.length > 0) {
            progress.onCleanupFailure(failureMessages);
          }
        })
        .finally(() => {
          process.exit(1);
        });
    };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);

    try {
      await provisionWorktree(
        {
          repoPath: projectPath,
          worktreePath,
          branch,
          base: 'HEAD',
          hooksDirPath: projectHooksDirPath,
          include: mergedConfig.worktree.include,
          exclude: mergedConfig.worktree.exclude,
          hookFiles,
        },
        {
          recordStep: (step) => {
            progress.onStep(step);
            return Promise.resolve();
          },
          recordHookOutput: (file, stream, text) => {
            progress.onHookOutput(file, stream, text);
            return Promise.resolve();
          },
        },
      );

      const elapsedSeconds = (Date.now() - startedAtMs) / 1000;
      const cleanupFailures = await cleanUpOnce();
      const execution: HookRunResult = {
        outcome: 'executed',
        hookCount: hookFiles.length,
        elapsedSeconds,
        cleanupFailures,
      };
      return execution;
    } catch (e) {
      const failureMessages = await cleanUpOnce();
      if (failureMessages.length > 0) {
        progress.onCleanupFailure(failureMessages);
      }
      throw e;
    } finally {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
    }
  }
}
