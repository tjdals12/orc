import { Command } from 'commander';

import path from 'node:path';

import { buildDatabasePath } from '#shared/path.js';
import { openDatabase } from '#database/open.js';
import { ProjectAddHandler } from '#cli/project/handlers/project-add.handler.js';
import { SkillInstallHandler } from '#cli/skill/handlers/skill-install.handler.js';
import {
  renderProjectAddNextSteps,
  renderProjectAddResult,
} from '#cli/project/views/project-add.view.js';
import { renderSkillInstallResult } from '#cli/skill/views/skill-install.view.js';

export const projectAddCommand = new Command('add')
  .description('Register a project')
  .argument('<name>', 'Project name')
  .option('--path <path>', 'Project path (default: current directory)')
  .option('--no-skill', 'Register without installing the agent skill')
  .action(async (name: string, options: { path?: string; skill: boolean }) => {
    const projectPath = path.resolve(options.path ?? process.cwd());

    const database = openDatabase(buildDatabasePath());

    try {
      const addHandler = new ProjectAddHandler(database);
      const addResult = await addHandler.execute(projectPath, { name });

      renderProjectAddResult(addResult);

      if (options.skill) {
        const skillInstallHandler = new SkillInstallHandler(database);
        const skillInstallResult = await skillInstallHandler.execute(projectPath);
        renderSkillInstallResult(skillInstallResult);
      }
    } finally {
      await database.destroy();
    }

    renderProjectAddNextSteps();
  });
