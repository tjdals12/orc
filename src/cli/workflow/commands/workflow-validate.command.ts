import { Command } from 'commander';

import { WorkflowValidateHandler } from '#cli/workflow/handlers/workflow-validate.handler.js';
import { printJson } from '#cli/output.js';
import { renderWorkflowValidateResult } from '#cli/workflow/views/workflow-validate.view.js';

export const workflowValidateCommand = new Command('validate')
  .description('Check whether a workflow in this project is valid')
  .argument('<id>', 'Workflow id')
  .option('--json', 'Print the verdict and findings as JSON')
  .action((id: string, options: { json?: boolean }) => {
    const projectPath = process.cwd();

    const handler = new WorkflowValidateHandler();
    const result = handler.execute(projectPath, { workflowId: id });

    if (options.json) {
      printJson(handler.toJson(result));
    } else {
      renderWorkflowValidateResult(result);
    }
    if (result.verdict === 'invalid') {
      process.exitCode = 1;
    }
  });
