import { Command } from 'commander';

import { buildDatabasePath } from '#shared/path.js';
import { openDatabase } from '#database/open.js';
import { WorkflowLogsHandler } from '#cli/workflow/handlers/workflow-logs.handler.js';
import { printJson } from '#cli/output.js';
import { renderWorkflowLogsResult } from '#cli/workflow/views/workflow-logs.view.js';

export const workflowLogsCommand = new Command('logs')
  .description(`Replay run's node output`)
  .argument('<run-id>', 'Workflow run id')
  .argument('[node-id]', 'Replay only this node')
  .option('--json', 'Print the logs as JSON')
  .action(
    async (workflowRunId: string, nodeId: string | undefined, options: { json?: boolean }) => {
      const database = openDatabase(buildDatabasePath());

      try {
        const handler = new WorkflowLogsHandler(database);
        const result = await handler.execute({ workflowRunId, nodeId: nodeId ?? null });

        if (options.json) {
          printJson(handler.toJson(result));
          return;
        }

        renderWorkflowLogsResult(result);
      } finally {
        await database.destroy();
      }
    },
  );
