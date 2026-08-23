import { Command } from 'commander';

import { openDatabase } from '#database/open.js';
import { buildDatabasePath } from '#shared/path.js';
import { printJson } from '#cli/output.js';
import { WorkflowApprovalsHandler } from '#cli/workflow/handlers/workflow-approvals.handler.js';
import { renderWorkflowApprovalsResult } from '#cli/workflow/views/workflow-approvals.view.js';

export const workflowApprovalsCommand = new Command('approvals')
  .description(`Show a run's approval requests`)
  .argument('<run-id>', 'Workflow run id')
  .argument('[node-id]', 'Node id')
  .option('--json', 'Print the approval requests as JSON')
  .action(
    async (workflowRunId: string, nodeId: string | undefined, options: { json?: boolean }) => {
      const database = openDatabase(buildDatabasePath());

      try {
        const handler = new WorkflowApprovalsHandler(database);
        const result = await handler.execute({ workflowRunId, nodeId: nodeId ?? null });

        if (options.json === true) {
          printJson(handler.toJson(result));
        } else {
          renderWorkflowApprovalsResult(result);
        }
      } finally {
        await database.destroy();
      }
    },
  );
