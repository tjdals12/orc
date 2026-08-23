import fs from 'node:fs';
import util from 'node:util';

import type { Kysely } from 'kysely';

import { buildSpecPaths, buildWorkflowRunPaths } from '#shared/path.js';

import type { Database, WorkflowRunStatus } from '#database/schema.js';
import { loadMergedConfig } from '#project/merged-config/load.js';
import { ProjectRepository } from '#project/repository.js';
import {
  ExecutionEnvironmentRepository,
  type ExecutionEnvironment,
} from '#execution-environment/repository.js';
import { teardownWorktree, type WorktreeTeardownStep } from '#execution-environment/worktree.js';
import { WorkflowRunRepository } from '#workflow-run/repository.js';
import { WorkflowRunError } from '#workflow-run/error.js';
import { resolveWorkflowRunLiveness } from '#workflow-run/liveness.js';
import { measureDirSize } from '#workflow-run/dir.js';

export type WorkflowPrunePlan = {
  workflowRunId: string;
  workflowId: string;
  status: WorkflowRunStatus;
  hookFiles: string[];
};

export type WorkflowPruneProgress = {
  start: () => void;
  onStep: (step: WorktreeTeardownStep) => void;
  onHookOutput: (file: string, stream: 'stdout' | 'stderr', text: string) => void;
  stop: () => void;
};

export type WorkflowPruneResult = {
  workflowRunId: string;
  keptBranch: string | null;
  warnings: string[];
  worktreeCount: number;
  reclaimedBytes: number;
};

export class WorkflowPruneHandler {
  private readonly _database: Kysely<Database>;
  private readonly _workflowRunRepository: WorkflowRunRepository;
  private readonly _executionEnvironmentRepository: ExecutionEnvironmentRepository;
  private readonly _projectRepository: ProjectRepository;
  private readonly _beginPrune: (plan: WorkflowPrunePlan) => WorkflowPruneProgress;

  constructor(
    database: Kysely<Database>,
    beginPrune: (plan: WorkflowPrunePlan) => WorkflowPruneProgress,
  ) {
    this._database = database;
    this._workflowRunRepository = new WorkflowRunRepository(database);
    this._executionEnvironmentRepository = new ExecutionEnvironmentRepository(database);
    this._projectRepository = new ProjectRepository(database);
    this._beginPrune = beginPrune;
  }

  async execute(args: { workflowRunId: string; force: boolean }): Promise<WorkflowPruneResult> {
    const workflowRun = await this._workflowRunRepository.findById(args.workflowRunId);
    if (!workflowRun) {
      throw new WorkflowRunError(`No workflow run "${args.workflowRunId}".`);
    }
    const liveness = resolveWorkflowRunLiveness(workflowRun);
    const runIsAlive = liveness === 'alive';
    if (runIsAlive) {
      throw new WorkflowRunError(
        `Run ${args.workflowRunId} is running. Cancel it with "orc workflow cancel ${args.workflowRunId}" or wait for it to finish.`,
      );
    }

    const project = await this._projectRepository.findById(workflowRun.project_id);
    if (!project) {
      throw new Error(`No project with id ${workflowRun.project_id}`);
    }

    let executionEnvironment: ExecutionEnvironment | null = null;
    if (workflowRun.execution_environment_id !== null) {
      executionEnvironment = await this._executionEnvironmentRepository.findById(
        workflowRun.execution_environment_id,
      );
    }

    const { workflowRunDirPath, specDirPath } = buildWorkflowRunPaths({
      projectId: project.id,
      workflowRunId: workflowRun.id,
    });
    const { specConfigPath, specHooksDirPath } = buildSpecPaths(
      specDirPath,
      workflowRun.workflow_id,
    );
    const specConfig = loadMergedConfig(specConfigPath, specHooksDirPath);
    const preRemoveHookFiles = specConfig?.worktree.listHookFiles('pre-remove') ?? [];
    const postRemoveHookFiles = specConfig?.worktree.listHookFiles('post-remove') ?? [];

    const progress = this._beginPrune({
      workflowRunId: workflowRun.id,
      workflowId: workflowRun.workflow_id,
      status: workflowRun.status,
      hookFiles: [...preRemoveHookFiles, ...postRemoveHookFiles],
    });

    const worktreeEnvironment =
      executionEnvironment !== null && executionEnvironment.kind === 'worktree'
        ? executionEnvironment
        : null;
    const reclaimedBytes = measureDirSize(workflowRunDirPath);

    const recordHookOutput = (
      file: string,
      stream: 'stdout' | 'stderr',
      text: string,
    ): Promise<void> => {
      progress.onHookOutput(file, stream, text);
      return Promise.resolve();
    };

    const warnings: string[] = [];
    let keptBranch: string | null = null;

    progress.start();
    try {
      await this._database.transaction().execute(async (transaction) => {
        await this._workflowRunRepository.deleteById(workflowRun.id, { transaction });
        if (workflowRun.execution_environment_id !== null) {
          await this._executionEnvironmentRepository.deleteUnreferencedById(
            workflowRun.execution_environment_id,
            { transaction },
          );
        }
      });

      if (worktreeEnvironment !== null) {
        const branch = worktreeEnvironment.branch;
        if (branch === null) {
          throw new Error(`Worktree environment ${worktreeEnvironment.id} has no branch`);
        }

        const teardown = await teardownWorktree(
          {
            repoPath: project.path,
            worktreePath: worktreeEnvironment.path,
            branch,
            hooksDirPath: specHooksDirPath,
            preRemoveHookFiles,
            postRemoveHookFiles,
            force: args.force,
          },
          { recordStep: progress.onStep, recordHookOutput },
        );
        keptBranch = teardown.keptBranch;
        warnings.push(...teardown.warnings);
      }

      try {
        fs.rmSync(workflowRunDirPath, { recursive: true, force: true });
      } catch (e) {
        warnings.push(e instanceof Error ? e.message : util.inspect(e));
      }
    } finally {
      progress.stop();
    }

    const result: WorkflowPruneResult = {
      workflowRunId: workflowRun.id,
      keptBranch,
      warnings,
      worktreeCount: worktreeEnvironment === null ? 0 : 1,
      reclaimedBytes,
    };
    return result;
  }
}
