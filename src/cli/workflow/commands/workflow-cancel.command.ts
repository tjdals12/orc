import { Command } from 'commander';

import { buildDatabasePath } from '#shared/path.js';
import { openDatabase } from '#database/open.js';
import { WorkflowCancelHandler } from '#cli/workflow/handlers/workflow-run/workflow-cancel.handler.js';
import { renderWorkflowCancelResult } from '#cli/workflow/views/workflow-cancel.view.js';

export const workflowCancelCommand = new Command('cancel')
  .description('Cancel a run')
  .argument('<run-id>', 'Workflow run id')
  .action(async (workflowRunId: string) => {
    const database = openDatabase(buildDatabasePath());

    try {
      const handler = new WorkflowCancelHandler(database);
      const result = await handler.execute({ workflowRunId });

      renderWorkflowCancelResult(result);
    } finally {
      await database.destroy();
    }
  });
