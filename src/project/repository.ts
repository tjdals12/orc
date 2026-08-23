import type { Kysely, Selectable } from 'kysely';

import { randomUUID } from 'node:crypto';

import type { Database, ProjectsTable } from '#database/schema.js';

export type Project = Selectable<ProjectsTable>;

export class ProjectRepository {
  constructor(private readonly database: Kysely<Database>) {}

  async findById(id: string): Promise<Project | null> {
    const project = await this.database
      .selectFrom('projects')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return project ?? null;
  }

  async findByPath(projectPath: string): Promise<Project | null> {
    const project = await this.database
      .selectFrom('projects')
      .selectAll()
      .where('path', '=', projectPath)
      .executeTakeFirst();
    return project ?? null;
  }

  async findByName(projectName: string): Promise<Project | null> {
    const project = await this.database
      .selectFrom('projects')
      .selectAll()
      .where('name', '=', projectName)
      .executeTakeFirst();
    return project ?? null;
  }

  async findMany(): Promise<Project[]> {
    const projects = await this.database
      .selectFrom('projects')
      .selectAll()
      .orderBy('created_at', 'asc')
      .execute();
    return projects;
  }

  async create(input: { name: string; path: string }): Promise<Project> {
    const { name, path } = input;
    const project: Project = {
      id: randomUUID(),
      name,
      path,
      created_at: new Date().toISOString(),
    };
    await this.database.insertInto('projects').values(project).execute();
    return project;
  }

  async deleteById(id: string): Promise<void> {
    await this.database.deleteFrom('projects').where('id', '=', id).execute();
  }
}
