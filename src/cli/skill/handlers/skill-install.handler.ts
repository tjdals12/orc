import fs from 'node:fs';

import type { Kysely } from 'kysely';

import {
  buildProjectSkillDirPaths,
  buildSkillFilePath,
  buildSkillSourceDirPath,
} from '#shared/path.js';
import type { Database } from '#database/schema.js';
import { ProjectError } from '#project/error.js';
import { ProjectRepository } from '#project/repository.js';
import { checkSkillStatus, installProjectSkill, type SkillInstallOutcome } from '#project/skill.js';

export type SkillInstallResult = {
  outcome: SkillInstallOutcome;
  projectPath: string;
  targetSkillDirPaths: string[];
  registered: boolean;
};

export class SkillInstallHandler {
  private readonly _projectRepository: ProjectRepository;

  constructor(database: Kysely<Database>) {
    this._projectRepository = new ProjectRepository(database);
  }

  async execute(projectPath: string): Promise<SkillInstallResult> {
    if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
      throw new ProjectError(`Not a directory: ${projectPath}.`);
    }

    const project = await this._projectRepository.findByPath(projectPath);
    const registered = project !== null;

    const sourceSkillDirPath = buildSkillSourceDirPath();
    const sourceSkillFilePath = buildSkillFilePath(sourceSkillDirPath);

    const { claudeSkillDirPath, agentsSkillDirPath } = buildProjectSkillDirPaths(projectPath);
    const targetSkillDirPaths = [claudeSkillDirPath, agentsSkillDirPath];
    const installedSkillFilePaths = targetSkillDirPaths.map((skillDirPath) =>
      buildSkillFilePath(skillDirPath),
    );

    const priorStatus = checkSkillStatus({
      sourceSkillFilePath,
      installedSkillFilePaths,
    });
    const outcome = installProjectSkill({ sourceSkillDirPath, targetSkillDirPaths, priorStatus });

    const result: SkillInstallResult = { outcome, projectPath, targetSkillDirPaths, registered };
    return result;
  }
}
