import { Command } from 'commander';

import { buildDatabasePath } from '#shared/path.js';
import { openDatabase } from '#database/open.js';
import { WorkflowStopFinalizerHandler } from '#cli/workflow/handlers/workflow-run/workflow-stop-finalizer.handler.js';

export const workflowStopFinalizerCommand = new Command('__stop-finalizer')
  .description('Finalize a stopped workflow run whose worker is gone')
  .argument('<run-id>', 'Workflow run id')
  .action(async (workflowRunId: string) => {
    const database = openDatabase(buildDatabasePath());

    try {
      const handler = new WorkflowStopFinalizerHandler(database);
      await handler.execute({ workflowRunId });
    } finally {
      await database.destroy();
    }
  });
