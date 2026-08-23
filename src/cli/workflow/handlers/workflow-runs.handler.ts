import type { Kysely } from 'kysely';

import type { Database } from '#database/schema.js';
import { ProjectError } from '#project/error.js';
import { ProjectRepository } from '#project/repository.js';
import {
  WorkflowRunRepository,
  type WorkflowRunWithProjectName,
} from '#workflow-run/repository.js';
import { resolveWorkflowRunLiveness } from '#workflow-run/liveness.js';

export type WorkflowRunEntry = {
  run: WorkflowRunWithProjectName;
  isDead: boolean;
};

export type WorkflowRunsResult = {
  entries: WorkflowRunEntry[];
  totalCount: number;
};

export class WorkflowRunsHandler {
  private readonly _workflowRunRepository: WorkflowRunRepository;
  private readonly _projectRepository: ProjectRepository;

  constructor(database: Kysely<Database>) {
    this._workflowRunRepository = new WorkflowRunRepository(database);
    this._projectRepository = new ProjectRepository(database);
  }

  async execute(projectPath: string | null, args: { limit: number }): Promise<WorkflowRunsResult> {
    let projectId: string | null = null;
    if (projectPath !== null) {
      const project = await this._projectRepository.findByPath(projectPath);
      if (!project) {
        throw new ProjectError(
          `Not a registered project: ${projectPath}. Use --all to list every project's runs.`,
        );
      }
      projectId = project.id;
    }

    const criteria = projectId === null ? {} : { projectId };
    const workflowRuns = await this._workflowRunRepository.findManyWithProjectName({
      limit: args.limit,
      ...criteria,
    });

    const entries = workflowRuns.map((workflowRun) => {
      const liveness = resolveWorkflowRunLiveness(workflowRun);
      const isDead = liveness === 'dead';
      const entry: WorkflowRunEntry = { run: workflowRun, isDead };
      return entry;
    });

    const totalCount = await this._workflowRunRepository.count(criteria);
    const result: WorkflowRunsResult = { entries, totalCount };
    return result;
  }

  toJson(result: WorkflowRunsResult): WorkflowRunWithProjectName[] {
    const rows = result.entries.map((entry) => entry.run);
    return rows;
  }
}
