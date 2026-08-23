import type { Kysely } from 'kysely';

import type { Database } from '#database/schema.js';
import { ProjectError } from '#project/error.js';
import { ProjectRepository } from '#project/repository.js';
import { WorkflowRunRepository } from '#workflow-run/repository.js';

export type ProjectRemoveResult =
  { outcome: 'removed'; name: string; path: string } | { outcome: 'not-registered'; name: string };

export class ProjectRemoveHandler {
  private readonly _projectRepository: ProjectRepository;
  private readonly _workflowRunRepository: WorkflowRunRepository;

  constructor(database: Kysely<Database>) {
    this._projectRepository = new ProjectRepository(database);
    this._workflowRunRepository = new WorkflowRunRepository(database);
  }

  async execute(args: { name: string }): Promise<ProjectRemoveResult> {
    const project = await this._projectRepository.findByName(args.name);
    if (!project) {
      const notRegistered: ProjectRemoveResult = { outcome: 'not-registered', name: args.name };
      return notRegistered;
    }

    const workflowRunCount = await this._workflowRunRepository.count({ projectId: project.id });
    if (workflowRunCount > 0) {
      throw new ProjectError(
        `${args.name} still has runs. Run "orc project prune ${args.name}" first.`,
      );
    }

    await this._projectRepository.deleteById(project.id);

    const removed: ProjectRemoveResult = {
      outcome: 'removed',
      name: project.name,
      path: project.path,
    };
    return removed;
  }
}
