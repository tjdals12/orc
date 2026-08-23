import { Command } from 'commander';

import { buildDatabasePath } from '#shared/path.js';
import { openDatabase } from '#database/open.js';
import { WorkflowHookLogsHandler } from '#cli/workflow/handlers/workflow-hook-logs.handler.js';
import { printJson } from '#cli/output.js';
import { renderWorkflowHookLogsResult } from '#cli/workflow/views/workflow-hook-logs.view.js';

export const workflowHookLogsCommand = new Command('hook-logs')
  .description(`Replay run's hook output`)
  .argument('<run-id>', 'Workflow run id')
  .argument('[file]', 'Replay only this hook file')
  .option('--json', 'Print the hook logs as JSON')
  .action(async (workflowRunId: string, file: string | undefined, options: { json?: boolean }) => {
    const database = openDatabase(buildDatabasePath());

    try {
      const handler = new WorkflowHookLogsHandler(database);
      const result = await handler.execute({ workflowRunId, file: file ?? null });

      if (options.json) {
        printJson(handler.toJson(result));
        return;
      }

      renderWorkflowHookLogsResult(result);
    } finally {
      await database.destroy();
    }
  });
