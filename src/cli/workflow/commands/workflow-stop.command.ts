import { Command } from 'commander';

import { openDatabase } from '#database/open.js';
import { printJson } from '#cli/output.js';
import { buildDatabasePath } from '#shared/path.js';
import { WorkflowRunLauncher } from '#cli/workflow/handlers/workflow-run/workflow-run-launcher.js';
import { WorkflowStopHandler } from '#cli/workflow/handlers/workflow-run/workflow-stop.handler.js';
import { renderWorkflowStopResult } from '#cli/workflow/views/workflow-stop.view.js';

export const workflowStopCommand = new Command('stop')
  .description('Stop a run, discard uncommitted changes, and keep it resumable')
  .argument('<run-id>', 'Workflow run id')
  .option('--json', 'Print the stop request as JSON')
  .action(async (workflowRunId: string, options: { json?: boolean }) => {
    const database = openDatabase(buildDatabasePath());

    try {
      const launcher = new WorkflowRunLauncher(database);
      const handler = new WorkflowStopHandler(database, launcher);
      const result = await handler.execute({ workflowRunId });

      if (options.json === true) {
        printJson(handler.toJson(result));
      } else {
        renderWorkflowStopResult(result);
      }
    } finally {
      await database.destroy();
    }
  });
