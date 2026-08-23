import { Command } from 'commander';

import { buildDatabasePath } from '#shared/path.js';
import { openDatabase } from '#database/open.js';
import {
  WorkflowStreamFollowHandler,
  WorkflowStreamHandler,
} from '#cli/workflow/handlers/workflow-stream.handler.js';
import { printJson, printJsonLine } from '#cli/output.js';
import {
  buildWorkflowStreamRenderer,
  renderWorkflowStreamFollowResult,
  renderWorkflowStreamResult,
} from '#cli/workflow/views/workflow-stream.view.js';

export const workflowStreamCommand = new Command('stream')
  .description(`Replay run's events and logs`)
  .argument('<run-id>', 'Workflow run id')
  .option('-f, --follow', 'Keep printing until the run ends')
  .option('--json', 'Print the stream as JSON')
  .action(async (workflowRunId: string, options: { follow?: boolean; json?: boolean }) => {
    const database = openDatabase(buildDatabasePath());

    try {
      if (options.follow) {
        const followHandler = new WorkflowStreamFollowHandler(database, (plan) => {
          if (options.json) {
            return {
              onEntries: (entries) => {
                for (const entry of entries) {
                  printJsonLine(followHandler.toEntryJson(entry));
                }
              },
            };
          }
          return {
            onEntries: buildWorkflowStreamRenderer(plan.workflowId, plan.workflowRunId),
          };
        });
        const followResult = await followHandler.execute({ workflowRunId });

        renderWorkflowStreamFollowResult(followResult, options.json === true);
        return;
      }

      const handler = new WorkflowStreamHandler(database);
      const result = await handler.execute({ workflowRunId });

      if (options.json) {
        printJson(handler.toJson(result));
        return;
      }

      renderWorkflowStreamResult(result);
    } finally {
      await database.destroy();
    }
  });
