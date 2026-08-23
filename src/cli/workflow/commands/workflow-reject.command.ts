import { Command } from 'commander';

import { openDatabase } from '#database/open.js';
import { buildDatabasePath } from '#shared/path.js';
import { printJson } from '#cli/output.js';
import { WorkflowRejectHandler } from '#cli/workflow/handlers/workflow-run/workflow-reject.handler.js';
import { renderWorkflowRejectResult } from '#cli/workflow/views/workflow-reject.view.js';

export const workflowRejectCommand = new Command('reject')
  .description('Reject a node awaiting a decision')
  .argument('<run-id>', 'Workflow run id')
  .argument('<node-id>', 'Node id')
  .option('--reason <text>', 'Text the on_reject body receives as $REASON')
  .option('--json', 'Print the decision as JSON')
  .action(
    async (workflowRunId: string, nodeId: string, options: { reason?: string; json?: boolean }) => {
      const database = openDatabase(buildDatabasePath());

      try {
        const handler = new WorkflowRejectHandler(database);
        const result = await handler.execute({
          workflowRunId,
          nodeId,
          reason: options.reason ?? null,
        });

        if (options.json === true) {
          printJson(handler.toJson(result));
        } else {
          renderWorkflowRejectResult(result);
        }
      } finally {
        await database.destroy();
      }
    },
  );
