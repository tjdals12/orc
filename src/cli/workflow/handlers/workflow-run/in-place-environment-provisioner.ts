import type { Kysely } from 'kysely';

import type { Database } from '#database/schema.js';
import type { Project } from '#project/repository.js';
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

    let executionEnvironment = await this._executionEnvironmentRepository.findByPath(projectPath);
    if (executionEnvironment === null) {
      executionEnvironment = await this._executionEnvironmentRepository.create({
        kind: 'in-place',
        path: projectPath,
      });
    }

    await this._workflowRunRepository.updateOrThrow(
      { id: workflowRunId },
      { execution_environment_id: executionEnvironment.id },
    );

    return executionEnvironment;
  }
}
