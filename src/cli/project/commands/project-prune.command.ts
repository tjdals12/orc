import { Command } from 'commander';

import { buildDatabasePath } from '#shared/path.js';
import { openDatabase } from '#database/open.js';
import { ProjectPruneHandler } from '#cli/project/handlers/project-prune.handler.js';
import {
  buildProjectPruneProgressRenderer,
  renderProjectPruneHeader,
  renderProjectPruneResult,
} from '#cli/project/views/project-prune.view.js';

export const projectPruneCommand = new Command('prune')
  .description("Reclaim orphaned run directories, and a named project's runs")
  .argument('[name]', 'Project name; omit to reclaim orphaned directories only')
  .option('--force', 'Also delete orphaned directories and unmerged run branches')
  .action(async (name: string | undefined, options: { force?: boolean }) => {
    const force = options.force ?? false;

    const database = openDatabase(buildDatabasePath());

    try {
      const handler = new ProjectPruneHandler(database, (plan) => {
        if (plan.workflowIds.length > 0) {
          renderProjectPruneHeader(plan);
        }
        return buildProjectPruneProgressRenderer(plan.workflowIds);
      });
      const result = await handler.execute({ name: name ?? null, force });

      renderProjectPruneResult(result);
    } finally {
      await database.destroy();
    }
  });
