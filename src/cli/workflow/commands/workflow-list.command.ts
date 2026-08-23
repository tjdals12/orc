import { Command } from 'commander';

import { WorkflowListHandler } from '#cli/workflow/handlers/workflow-list.handler.js';
import { printJson } from '#cli/output.js';
import { renderWorkflowListResult } from '#cli/workflow/views/workflow-list.view.js';

export const workflowListCommand = new Command('list')
  .description('List workflows in this project')
  .option('--json', 'Print the workflows and broken files as JSON')
  .action((options: { json?: boolean }) => {
    const projectPath = process.cwd();

    const handler = new WorkflowListHandler();
    const result = handler.execute(projectPath);

    if (options.json) {
      printJson(result);
      return;
    }

    renderWorkflowListResult(result);
  });
