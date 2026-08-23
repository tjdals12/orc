import { Command } from 'commander';

import { buildDatabasePath } from '#shared/path.js';
import { openDatabase } from '#database/open.js';
import { printJson } from '#cli/output.js';
import { WorkflowResumeHandler } from '#cli/workflow/handlers/workflow-run/workflow-resume.handler.js';
import { WorkflowRunLauncher } from '#cli/workflow/handlers/workflow-run/workflow-run-launcher.js';
import {
  beginWorkflowResume,
  beginWorkflowResumeQuietly,
  renderWorkflowResumeResult,
  renderWorkflowResumeStoppedSignal,
  renderWorkflowRunCancelling,
} from '#cli/workflow/views/workflow-run.view.js';

export const workflowResumeCommand = new Command('resume')
  .description('Continue a stopped workflow run')
  .argument('<run-id>', 'Workflow run id')
  .option('--detach', 'Run in the background and return immediately')
  .option('--json', 'Print the run and its nodes as JSON')
  .action(async (workflowRunId: string, options: { detach?: boolean; json?: boolean }) => {
    const quiet = options.json === true;
    const database = openDatabase(buildDatabasePath());

    try {
      const launcher = new WorkflowRunLauncher(database, renderWorkflowRunCancelling);
      const beginResume = quiet ? beginWorkflowResumeQuietly : beginWorkflowResume;

      const handler = new WorkflowResumeHandler(database, launcher, beginResume);
      const result = await handler.execute({
        workflowRunId,
        detach: options.detach ?? false,
      });

      if (quiet) {
        renderWorkflowResumeStoppedSignal(result);
        printJson(handler.toJson(result));
      } else {
        renderWorkflowResumeResult(result);
      }

      if (handler.hasFailed(result)) {
        process.exitCode = 1;
      }
    } finally {
      await database.destroy();
    }
  });
