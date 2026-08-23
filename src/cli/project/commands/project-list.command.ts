import { Command } from 'commander';

import { buildDatabasePath } from '#shared/path.js';
import { openDatabase } from '#database/open.js';
import { ProjectListHandler } from '#cli/project/handlers/project-list.handler.js';
import { printJson } from '#cli/output.js';
import { renderProjectListResult } from '#cli/project/views/project-list.view.js';

export const projectListCommand = new Command('list')
  .description('List registered projects')
  .option('--json', 'Print the projects as JSON')
  .action(async (options: { json?: boolean }) => {
    const database = openDatabase(buildDatabasePath());

    try {
      const handler = new ProjectListHandler(database);
      const result = await handler.execute();

      if (options.json) {
        printJson(result);
        return;
      }

      renderProjectListResult(result);
    } finally {
      await database.destroy();
    }
  });
