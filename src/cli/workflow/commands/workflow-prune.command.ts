import { Command } from 'commander';

import { buildDatabasePath } from '#shared/path.js';
import { openDatabase } from '#database/open.js';
import { WorkflowPruneHandler } from '#cli/workflow/handlers/workflow-prune.handler.js';
import {
  buildWorkflowPruneProgressRenderer,
  renderWorkflowPruneHeader,
  renderWorkflowPruneResult,
} from '#cli/workflow/views/workflow-prune.view.js';

export const workflowPruneCommand = new Command('prune')
  .description('Delete a run — its records, artifacts, worktree and branch')
  .argument('<run-id>', 'Run id')
  .option('--force', 'Force-delete the run branch even if unmerged')
  .action(async (workflowRunId: string, options: { force?: boolean }) => {
    const database = openDatabase(buildDatabasePath());

    try {
      const handler = new WorkflowPruneHandler(database, (plan) => {
        renderWorkflowPruneHeader(plan);
        return buildWorkflowPruneProgressRenderer(plan.hookFiles);
      });
      const result = await handler.execute({ workflowRunId, force: options.force ?? false });

      renderWorkflowPruneResult(result);
    } finally {
      await database.destroy();
    }
  });
