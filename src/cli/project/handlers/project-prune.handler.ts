import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import type { Kysely } from 'kysely';

import { buildProjectsAreaDirPath, buildSpecPaths, buildWorkflowRunPaths } from '#shared/path.js';

import type { Database } from '#database/schema.js';
import { loadMergedConfig } from '#project/merged-config/load.js';
import { ProjectRepository } from '#project/repository.js';
import {
  ExecutionEnvironmentRepository,
  type ExecutionEnvironment,
} from '#execution-environment/repository.js';
import { teardownWorktree, type WorktreeTeardownStep } from '#execution-environment/worktree.js';
import { pruneWorktreeRegistrations } from '#shared/git.js';
import { WorkflowRunRepository, type WorkflowRun } from '#workflow-run/repository.js';
import { resolveWorkflowRunLiveness } from '#workflow-run/liveness.js';
import { collectOrphanedDirPaths, measureDirSize } from '#workflow-run/dir.js';

type ProjectPruneRuns = {
  prunableRuns: WorkflowRun[];
  skippedRuns: WorkflowRun[];
  pausedRuns: WorkflowRun[];
};

export type ProjectPrunePlan = {
  projectName: string;
  workflowIds: string[];
};

export type ProjectPruneRunTarget = {
  workflowRunId: string;
  workflowId: string;
};

export type ProjectPruneRunOutcome = {
  keptBranch: string | null;
  warnings: string[];
  reclaimedBytes: number;
};

export type ProjectPruneRunProgress = {
  onPruneStart: (run: ProjectPruneRunTarget, hookFiles: string[]) => void;
  onStep: (step: WorktreeTeardownStep) => void;
  onHookOutput: (file: string, stream: 'stdout' | 'stderr', text: string) => void;
  onPruneCleanup: () => void;
  onPruneFinish: (outcome: ProjectPruneRunOutcome) => void;
};

export type ProjectPruneNotRegisteredResult = {
  outcome: 'not-registered';
  projectName: string;
};

export type ProjectPrunedResult = {
  outcome: 'pruned';
  projectName: string;
  prunedRunIds: string[];
  worktreeCount: number;
  reclaimedBytes: number;
  skippedRunIds: string[];
  pausedRunIds: string[];
  orphanedDirPaths: string[];
  orphansRemoved: boolean;
};

export type ProjectOrphansPrunedResult = {
  outcome: 'orphans-pruned';
  orphanedDirPaths: string[];
  orphansRemoved: boolean;
};

export type ProjectPruneResult =
  ProjectPruneNotRegisteredResult | ProjectPrunedResult | ProjectOrphansPrunedResult;

export class ProjectPruneHandler {
  private readonly _database: Kysely<Database>;
  private readonly _projectRepository: ProjectRepository;
  private readonly _workflowRunRepository: WorkflowRunRepository;
  private readonly _executionEnvironmentRepository: ExecutionEnvironmentRepository;
  private readonly _beginPrune: (plan: ProjectPrunePlan) => ProjectPruneRunProgress;

  constructor(
    database: Kysely<Database>,
    beginPrune: (plan: ProjectPrunePlan) => ProjectPruneRunProgress,
  ) {
    this._database = database;
    this._projectRepository = new ProjectRepository(database);
    this._workflowRunRepository = new WorkflowRunRepository(database);
    this._executionEnvironmentRepository = new ExecutionEnvironmentRepository(database);
    this._beginPrune = beginPrune;
  }

  async execute(args: { name: string | null; force: boolean }): Promise<ProjectPruneResult> {
    if (args.name === null) {
      const { orphanedDirPaths, orphansRemoved } = await this.sweepOrphans(args.force);

      const orphansPruned: ProjectPruneResult = {
        outcome: 'orphans-pruned',
        orphanedDirPaths,
        orphansRemoved,
      };
      return orphansPruned;
    }

    const project = await this._projectRepository.findByName(args.name);
    if (!project) {
      const notRegistered: ProjectPruneResult = {
        outcome: 'not-registered',
        projectName: args.name,
      };
      return notRegistered;
    }

    const { prunableRuns, skippedRuns, pausedRuns } = await this.selectRunsToPrune(project.id);

    const runProgress = this._beginPrune({
      projectName: project.name,
      workflowIds: prunableRuns.map((workflowRun) => workflowRun.workflow_id),
    });

    let worktreeCount = 0;
    let reclaimedBytes = 0;
    for (const workflowRun of prunableRuns) {
      let worktreeEnvironment: ExecutionEnvironment | null = null;
      if (workflowRun.execution_environment_id !== null) {
        const executionEnvironment = await this._executionEnvironmentRepository.findById(
          workflowRun.execution_environment_id,
        );
        worktreeEnvironment =
          executionEnvironment !== null && executionEnvironment.kind === 'worktree'
            ? executionEnvironment
            : null;
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

      const runReclaimedBytes = measureDirSize(workflowRunDirPath);

      const warnings: string[] = [];
      let keptBranch: string | null = null;

      runProgress.onPruneStart(
        { workflowRunId: workflowRun.id, workflowId: workflowRun.workflow_id },
        [...preRemoveHookFiles, ...postRemoveHookFiles],
      );
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

          const recordHookOutput = (
            file: string,
            stream: 'stdout' | 'stderr',
            text: string,
          ): Promise<void> => {
            runProgress.onHookOutput(file, stream, text);
            return Promise.resolve();
          };

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
            { recordStep: runProgress.onStep, recordHookOutput },
          );

          keptBranch = teardown.keptBranch;
          warnings.push(...teardown.warnings);
          worktreeCount += 1;
        }

        try {
          fs.rmSync(workflowRunDirPath, { recursive: true, force: true });
        } catch (e) {
          warnings.push(e instanceof Error ? e.message : util.inspect(e));
        }
      } finally {
        runProgress.onPruneCleanup();
      }

      reclaimedBytes += runReclaimedBytes;
      runProgress.onPruneFinish({
        keptBranch,
        warnings,
        reclaimedBytes: runReclaimedBytes,
      });
    }

    const { orphanedDirPaths, orphansRemoved } = await this.sweepOrphans(args.force);

    const projectsAreaDirPath = buildProjectsAreaDirPath();
    const projectRunsDirPath = path.join(projectsAreaDirPath, project.id);
    if (fs.existsSync(projectRunsDirPath)) {
      const remainingEntries = fs.readdirSync(projectRunsDirPath);
      if (remainingEntries.length === 0) {
        fs.rmdirSync(projectRunsDirPath);
      }
    }

    const pruned: ProjectPruneResult = {
      outcome: 'pruned',
      projectName: project.name,
      prunedRunIds: prunableRuns.map((workflowRun) => workflowRun.id),
      worktreeCount,
      reclaimedBytes,
      skippedRunIds: skippedRuns.map((workflowRun) => workflowRun.id),
      pausedRunIds: pausedRuns.map((workflowRun) => workflowRun.id),
      orphanedDirPaths,
      orphansRemoved,
    };
    return pruned;
  }

  private async sweepOrphans(
    force: boolean,
  ): Promise<{ orphanedDirPaths: string[]; orphansRemoved: boolean }> {
    const projectsAreaDirPath = buildProjectsAreaDirPath();
    const projects = await this._projectRepository.findMany();

    const workflowRunIdsByProjectId = new Map<string, Set<string>>();
    for (const project of projects) {
      const workflowRuns = await this._workflowRunRepository.findManyByProjectId(project.id);
      workflowRunIdsByProjectId.set(project.id, new Set(workflowRuns.map((run) => run.id)));
    }

    const orphanedDirPaths = collectOrphanedDirPaths(
      projectsAreaDirPath,
      workflowRunIdsByProjectId,
    );

    const orphansRemoved = orphanedDirPaths.length > 0 && force;
    if (orphansRemoved) {
      for (const orphanedDirPath of orphanedDirPaths) {
        fs.rmSync(orphanedDirPath, { recursive: true, force: true });
      }

      // An orphan can belong to any registered project, so every repository is swept.
      for (const project of projects) {
        await pruneWorktreeRegistrations(project.path);
      }
    }

    const swept = { orphanedDirPaths, orphansRemoved };
    return swept;
  }

  private async selectRunsToPrune(projectId: string): Promise<ProjectPruneRuns> {
    const workflowRuns = await this._workflowRunRepository.findManyByProjectId(projectId);

    const prunableRuns: WorkflowRun[] = [];
    const skippedRuns: WorkflowRun[] = [];
    const pausedRuns: WorkflowRun[] = [];
    for (const workflowRun of workflowRuns) {
      const liveness = resolveWorkflowRunLiveness(workflowRun);
      if (liveness === 'alive') {
        skippedRuns.push(workflowRun);
      } else if (workflowRun.status === 'paused') {
        pausedRuns.push(workflowRun);
      } else {
        prunableRuns.push(workflowRun);
      }
    }

    const runs: ProjectPruneRuns = { prunableRuns, skippedRuns, pausedRuns };
    return runs;
  }
}
