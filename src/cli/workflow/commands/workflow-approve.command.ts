import { Command } from 'commander';

import { openDatabase } from '#database/open.js';
import { buildDatabasePath } from '#shared/path.js';
import { printJson } from '#cli/output.js';
import { WorkflowApproveHandler } from '#cli/workflow/handlers/workflow-run/workflow-approve.handler.js';
import { renderWorkflowApproveResult } from '#cli/workflow/views/workflow-approve.view.js';

export const workflowApproveCommand = new Command('approve')
  .description('Approve a node awaiting a decision')
  .argument('<run-id>', 'Workflow run id')
  .argument('<node-id>', 'Node id')
  .option('--json', 'Print the decision as JSON')
  .action(async (workflowRunId: string, nodeId: string, options: { json?: boolean }) => {
    const database = openDatabase(buildDatabasePath());

    try {
      const handler = new WorkflowApproveHandler(database);
      const result = await handler.execute({ workflowRunId, nodeId });

      if (options.json === true) {
        printJson(handler.toJson(result));
      } else {
        renderWorkflowApproveResult(result);
      }
    } finally {
      await database.destroy();
    }
  });
