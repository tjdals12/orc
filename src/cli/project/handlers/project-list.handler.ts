import type { Kysely } from 'kysely';

import type { Database } from '#database/schema.js';
import { ProjectRepository } from '#project/repository.js';

export type ProjectListResult = {
  projects: { id: string; name: string; path: string; created_at: string }[];
};

export class ProjectListHandler {
  private readonly _projectRepository: ProjectRepository;

  constructor(database: Kysely<Database>) {
    this._projectRepository = new ProjectRepository(database);
  }

  async execute(): Promise<ProjectListResult> {
    const projects = await this._projectRepository.findMany();

    const result: ProjectListResult = {
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        path: project.path,
        created_at: project.created_at,
      })),
    };
    return result;
  }
}
