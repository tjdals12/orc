import { Command } from 'commander';

import { buildDatabasePath } from '#shared/path.js';
import { openDatabase } from '#database/open.js';
import { WorkflowWorkerHandler } from '#cli/workflow/handlers/workflow-run/workflow-worker.handler.js';

export const workflowWorkerCommand = new Command('__worker')
  .description('Execute a prepared workflow run')
  .argument('<run-id>', 'Workflow run id')
  .action(async (workflowRunId: string) => {
    const database = openDatabase(buildDatabasePath());

    try {
      const handler = new WorkflowWorkerHandler(database);
      await handler.execute({ workflowRunId });
    } finally {
      await database.destroy();
    }
  });
