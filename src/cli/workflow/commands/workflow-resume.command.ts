import { Command } from 'commander';

import { buildDatabasePath } from '#shared/path.js';
import { openDatabase } from '#database/open.js';
import { printJson } from '#cli/output.js';
import { WorkflowResumeHandler } from '#cli/workflow/handlers/workflow-run/workflow-resume.handler.js';
import { WorkflowRunLauncher } from '#cli/workflow/handlers/workflow-run/workflow-run-launcher.js';
import { WorkflowRunCoordinator } from '#cli/workflow/handlers/workflow-run/workflow-run-coordinator.js';
import {
  beginWorkflowResume,
  beginWorkflowResumeQuietly,
  renderWorkflowResumeResult,
  renderWorkflowResumeStoppedSignal,
} from '#cli/workflow/views/workflow-run.view.js';

export const workflowResumeCommand = new Command('resume')
  .description('Continue a stopped workflow run')
  .argument('<run-id>', 'Workflow run id')
  .option('--detach', 'Run in the background and return immediately')
  .option('--json', 'Print the resumed run and its nodes as JSON, then return')
  .action(async (workflowRunId: string, options: { detach?: boolean; json?: boolean }) => {
    const quiet = options.json === true;
    const database = openDatabase(buildDatabasePath());

    try {
      const launcher = new WorkflowRunLauncher(database);
      const coordinator = new WorkflowRunCoordinator(database, launcher);
      const beginResume = quiet ? beginWorkflowResumeQuietly : beginWorkflowResume;

      const handler = new WorkflowResumeHandler(database, coordinator, beginResume);
      const result = await handler.execute({
        workflowRunId,
        detach: options.detach === true || options.json === true,
      });

      if (options.json === true) {
        renderWorkflowResumeStoppedSignal(result);
        printJson(handler.toJson(result));
      } else {
        renderWorkflowResumeResult(result);
      }

      if (result.outcome.kind === 'interrupted') {
        process.exitCode = result.outcome.exitCode;
      } else if (handler.hasFailed(result)) {
        process.exitCode = 1;
      }
    } finally {
      await database.destroy();
    }
  });
