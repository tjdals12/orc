import { Command } from 'commander';

import path from 'node:path';

import { buildDatabasePath } from '#shared/path.js';
import { openDatabase } from '#database/open.js';
import { SkillInstallHandler } from '#cli/skill/handlers/skill-install.handler.js';
import { renderSkillInstallResult } from '#cli/skill/views/skill-install.view.js';

export const skillInstallCommand = new Command('install')
  .description('Install the agent skill into a project')
  .option('--path <path>', 'Project path (default: current directory)')
  .action(async (options: { path?: string }) => {
    const projectPath = path.resolve(options.path ?? process.cwd());

    const database = openDatabase(buildDatabasePath());

    try {
      const handler = new SkillInstallHandler(database);
      const result = await handler.execute(projectPath);

      renderSkillInstallResult(result);
    } finally {
      await database.destroy();
    }
  });
