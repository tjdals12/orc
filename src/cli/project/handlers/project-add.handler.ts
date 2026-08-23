import fs from 'node:fs';

import type { Kysely } from 'kysely';

import { buildProjectPaths } from '#shared/path.js';
import type { Database } from '#database/schema.js';
import { ProjectError } from '#project/error.js';
import { ProjectRepository, type Project } from '#project/repository.js';
import { ensureProjectScaffold } from '#project/scaffold.js';

type ProjectAddOutcome = 'registered' | 'already-registered';

type ProjectRegistration = {
  outcome: ProjectAddOutcome;
  project: Project;
};

export type ProjectAddResult = {
  outcome: ProjectAddOutcome;
  name: string;
  path: string;
};

export class ProjectAddHandler {
  private readonly _projectRepository: ProjectRepository;

  constructor(database: Kysely<Database>) {
    this._projectRepository = new ProjectRepository(database);
  }

  async execute(projectPath: string, args: { name: string }): Promise<ProjectAddResult> {
    if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
      throw new ProjectError(`Not a directory: ${projectPath}.`);
    }

    const { projectConfigPath, projectHooksDirPath, workflowsDirPath } =
      buildProjectPaths(projectPath);

    const registration = await this.ensureProjectRegistration(projectPath, args.name);

    ensureProjectScaffold({ workflowsDirPath, projectHooksDirPath, projectConfigPath });

    const result: ProjectAddResult = {
      outcome: registration.outcome,
      name: registration.project.name,
      path: registration.project.path,
    };
    return result;
  }

  private async ensureProjectRegistration(
    projectPath: string,
    name: string,
  ): Promise<ProjectRegistration> {
    const projectAtPath = await this._projectRepository.findByPath(projectPath);
    if (projectAtPath) {
      if (projectAtPath.name !== name) {
        throw new ProjectError(`${projectPath} is already registered as "${projectAtPath.name}".`);
      }

      const alreadyRegistered: ProjectRegistration = {
        outcome: 'already-registered',
        project: projectAtPath,
      };
      return alreadyRegistered;
    }

    const projectWithName = await this._projectRepository.findByName(name);
    if (projectWithName) {
      throw new ProjectError(`Name "${name}" is already used by "${projectWithName.path}".`);
    }

    const createdProject = await this._projectRepository.create({ name, path: projectPath });

    const registered: ProjectRegistration = { outcome: 'registered', project: createdProject };
    return registered;
  }
}
