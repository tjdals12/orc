import { Command, InvalidArgumentError } from 'commander';

import { buildDatabasePath } from '#shared/path.js';
import { openDatabase } from '#database/open.js';
import { WorkflowRunsHandler } from '#cli/workflow/handlers/workflow-runs.handler.js';
import { printJson } from '#cli/output.js';
import { renderWorkflowRunsResult } from '#cli/workflow/views/workflow-runs.view.js';

function parseLimit(value: string): number {
  const limit = Number.parseInt(value, 10);
  if (Number.isNaN(limit) || limit <= 0) {
    throw new InvalidArgumentError('Expected a positive integer.');
  }
  return limit;
}

export const workflowRunsCommand = new Command('runs')
  .description('List recent runs')
  .option('--all', `List every project's runs`)
  .option('--limit <count>', 'Maximum number of runs to list', parseLimit, 10)
  .option('--json', 'Print the runs as JSON')
  .action(async (options: { all?: boolean; limit: number; json?: boolean }) => {
    const projectPath = options.all ? null : process.cwd();

    const database = openDatabase(buildDatabasePath());

    try {
      const handler = new WorkflowRunsHandler(database);
      const result = await handler.execute(projectPath, { limit: options.limit });

      if (options.json) {
        printJson(handler.toJson(result));
        return;
      }

      renderWorkflowRunsResult(result);
    } finally {
      await database.destroy();
    }
  });
