import type { Kysely } from 'kysely';

import { buildWorktreePath } from '#shared/path.js';

import type { Database } from '#database/schema.js';
import type { Project } from '#project/repository.js';
import type { WorktreeConfig } from '#project/merged-config/worktree-config.js';
import {
  ExecutionEnvironmentRepository,
  type ExecutionEnvironment,
} from '#execution-environment/repository.js';
import { provisionWorktree, type WorktreeProvisionStep } from '#execution-environment/worktree.js';
import { WorkflowRunRepository, type WorkflowRun } from '#workflow-run/repository.js';

export type WorktreeEnvironmentInfo = {
  branch: string;
  worktreePath: string;
};

type WorktreeProvisionEvent =
  | { type: 'worktree_creating' }
  | { type: 'files_copying' }
  | { type: 'hook_started'; file: string };

type WorktreeProvisionHookLog = {
  type: 'bash_output';
  phase: 'post-create';
  file: string;
  stream: 'stdout' | 'stderr';
  text: string;
};

export class WorktreeEnvironmentProvisioner {
  private readonly _database: Kysely<Database>;
  private readonly _executionEnvironmentRepository: ExecutionEnvironmentRepository;
  private readonly _workflowRunRepository: WorkflowRunRepository;
  private readonly _base: string | null;
  private readonly _branch: string | null;
  private readonly _onProvisioning: (info: WorktreeEnvironmentInfo) => void;

  constructor(
    database: Kysely<Database>,
    base: string | null,
    branch: string | null,
    onProvisioning: (info: WorktreeEnvironmentInfo) => void,
  ) {
    this._database = database;
    this._executionEnvironmentRepository = new ExecutionEnvironmentRepository(database);
    this._workflowRunRepository = new WorkflowRunRepository(database);
    this._base = base;
    this._branch = branch;
    this._onProvisioning = onProvisioning;
  }

  async provision(args: {
    project: Project;
    worktreeConfig: WorktreeConfig;
    workflowRun: WorkflowRun;
    recordEvent: (event: WorktreeProvisionEvent) => Promise<void>;
    recordHookLog: (hookLog: WorktreeProvisionHookLog) => Promise<void>;
  }): Promise<ExecutionEnvironment> {
    const { project, worktreeConfig, workflowRun, recordEvent, recordHookLog } = args;
    const { id: projectId, path: projectPath } = project;
    const { id: workflowRunId, workflow_id: workflowId } = workflowRun;

    const base = this._base ?? 'HEAD';
    const branchPrefix = this._branch ?? `orc/${workflowId}`;
    const branch = `${branchPrefix}-${workflowRunId.slice(0, 8)}`;
    const worktreePath = buildWorktreePath({
      projectId,
      workflowRunId,
    });

    const executionEnvironment = await this._database.transaction().execute(async (transaction) => {
      const executionEnvironment = await this._executionEnvironmentRepository.create(
        {
          kind: 'worktree',
          branch,
          path: worktreePath,
        },
        { transaction },
      );

      await this._workflowRunRepository.updateOrThrow(
        {
          id: workflowRunId,
        },
        {
          execution_environment_id: executionEnvironment.id,
        },
        {
          transaction,
        },
      );

      return executionEnvironment;
    });

    this._onProvisioning({
      branch,
      worktreePath,
    });

    const recordStep = async (step: WorktreeProvisionStep): Promise<void> => {
      switch (step.kind) {
        case 'create-worktree':
          await recordEvent({ type: 'worktree_creating' });
          break;
        case 'copy-ignored-files':
          await recordEvent({ type: 'files_copying' });
          break;
        case 'run-hook':
          await recordEvent({ type: 'hook_started', file: step.file });
          break;
        default:
          step satisfies never;
      }
    };

    const recordHookOutput = async (
      file: string,
      stream: 'stdout' | 'stderr',
      text: string,
    ): Promise<void> => {
      await recordHookLog({
        type: 'bash_output',
        phase: 'post-create',
        file,
        stream,
        text,
      });
    };

    await provisionWorktree(
      {
        repoPath: projectPath,
        worktreePath,
        branch,
        base,
        hooksDirPath: worktreeConfig.hooksDirPath,
        include: worktreeConfig.include,
        exclude: worktreeConfig.exclude,
        hookFiles: worktreeConfig.listHookFiles('post-create'),
      },
      {
        recordStep,
        recordHookOutput,
      },
    );

    return executionEnvironment;
  }
}
