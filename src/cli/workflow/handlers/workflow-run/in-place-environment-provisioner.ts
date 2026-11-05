import type { Kysely } from 'kysely';

import {
  buildGitFailureDetail,
  hasHeadCommit,
  isGitWorkTree,
  resolveBranchName,
} from '#shared/git.js';

import type { Database } from '#database/schema.js';
import type { Project } from '#project/repository.js';
import { ExecutionEnvironmentError } from '#execution-environment/error.js';
import {
  ExecutionEnvironmentRepository,
  type ExecutionEnvironment,
} from '#execution-environment/repository.js';
import { WorkflowRunRepository, type WorkflowRun } from '#workflow-run/repository.js';

export class InPlaceEnvironmentProvisioner {
  private readonly _executionEnvironmentRepository: ExecutionEnvironmentRepository;
  private readonly _workflowRunRepository: WorkflowRunRepository;

  constructor(database: Kysely<Database>) {
    this._executionEnvironmentRepository = new ExecutionEnvironmentRepository(database);
    this._workflowRunRepository = new WorkflowRunRepository(database);
  }

  async provision(args: {
    project: Project;
    workflowRun: WorkflowRun;
  }): Promise<ExecutionEnvironment> {
    const { project, workflowRun } = args;
    const { path: projectPath } = project;
    const { id: workflowRunId } = workflowRun;

    let baseBranch: string | null = null;
    try {
      const gitWorkTree = await isGitWorkTree(projectPath);
      if (gitWorkTree) {
        const headCommit = await hasHeadCommit(projectPath);
        if (headCommit) {
          baseBranch = await resolveBranchName({ repoPath: projectPath, base: 'HEAD' });
        }
      }
    } catch (e) {
      throw new ExecutionEnvironmentError(
        `Failed to resolve the base branch in ${projectPath}. ${buildGitFailureDetail(e)}`,
      );
    }

    let executionEnvironment = await this._executionEnvironmentRepository.findByPath(projectPath);
    if (executionEnvironment === null) {
      executionEnvironment = await this._executionEnvironmentRepository.create({
        kind: 'in-place',
        path: projectPath,
      });
    }

    await this._workflowRunRepository.updateOrThrow(
      { id: workflowRunId },
      { execution_environment_id: executionEnvironment.id, base_branch: baseBranch },
    );

    return executionEnvironment;
  }
}
