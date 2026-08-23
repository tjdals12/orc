import { Command } from 'commander';

import { buildDatabasePath } from '#shared/path.js';
import { openDatabase } from '#database/open.js';
import { WorkflowEventsHandler } from '#cli/workflow/handlers/workflow-events.handler.js';
import { printJson } from '#cli/output.js';
import { renderWorkflowEventsResult } from '#cli/workflow/views/workflow-events.view.js';

export const workflowEventsCommand = new Command('events')
  .description('Replay the event timeline of a run')
  .argument('<run-id>', 'Workflow run id')
  .option('--json', 'Print the events as JSON')
  .action(async (workflowRunId: string, options: { json?: boolean }) => {
    const database = openDatabase(buildDatabasePath());

    try {
      const handler = new WorkflowEventsHandler(database);
      const result = await handler.execute({ workflowRunId });

      if (options.json) {
        printJson(handler.toJson(result));
        return;
      }

      renderWorkflowEventsResult(result);
    } finally {
      await database.destroy();
    }
  });
