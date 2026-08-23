import { Command } from 'commander';

import { buildDatabasePath } from '#shared/path.js';
import { openDatabase } from '#database/open.js';
import { WorkflowStatusHandler } from '#cli/workflow/handlers/workflow-status.handler.js';
import { printJson } from '#cli/output.js';
import { renderWorkflowStatusResult } from '#cli/workflow/views/workflow-status.view.js';

export const workflowStatusCommand = new Command('status')
  .description(`Show a run's current state`)
  .argument('<run-id>', 'Workflow run id')
  .option('--json', 'Print the status as JSON')
  .action(async (workflowRunId: string, options: { json?: boolean }) => {
    const database = openDatabase(buildDatabasePath());

    try {
      const handler = new WorkflowStatusHandler(database);
      const result = await handler.execute({ workflowRunId });

      if (options.json) {
        printJson(handler.toJson(result));
        return;
      }

      renderWorkflowStatusResult(result);
    } finally {
      await database.destroy();
    }
  });
