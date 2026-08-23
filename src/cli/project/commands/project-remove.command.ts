import { Command } from 'commander';

import { buildDatabasePath } from '#shared/path.js';
import { openDatabase } from '#database/open.js';
import { ProjectRemoveHandler } from '#cli/project/handlers/project-remove.handler.js';
import { renderProjectRemoveResult } from '#cli/project/views/project-remove.view.js';

export const projectRemoveCommand = new Command('remove')
  .description('Unregister a project (keeps the directory)')
  .argument('<name>', 'Project name')
  .action(async (name: string) => {
    const database = openDatabase(buildDatabasePath());

    try {
      const handler = new ProjectRemoveHandler(database);
      const result = await handler.execute({ name });

      renderProjectRemoveResult(result);
    } finally {
      await database.destroy();
    }
  });
