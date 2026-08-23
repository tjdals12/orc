import { Command } from 'commander';

import { buildDatabasePath } from '#shared/path.js';

import { openDatabase } from '#database/open.js';
import { WorkflowRunError } from '#workflow-run/error.js';

import { printJson } from '#cli/output.js';
import type { WorkflowRunHandler } from '#cli/workflow/handlers/workflow-run/workflow-run.handler.js';
import { WorktreeWorkflowRunHandler } from '#cli/workflow/handlers/workflow-run/worktree-workflow-run.handler.js';
import { InPlaceWorkflowRunHandler } from '#cli/workflow/handlers/workflow-run/in-place-workflow-run.handler.js';
import { WorktreeEnvironmentProvisioner } from '#cli/workflow/handlers/workflow-run/worktree-environment-provisioner.js';
import { InPlaceEnvironmentProvisioner } from '#cli/workflow/handlers/workflow-run/in-place-environment-provisioner.js';
import { WorkflowRunLauncher } from '#cli/workflow/handlers/workflow-run/workflow-run-launcher.js';
import type { WorkflowRunInput } from '#cli/workflow/handlers/workflow-run/types.js';
import {
  beginWorkflowRun,
  beginWorkflowRunQuietly,
  renderWorkflowRunCancelling,
  renderWorkflowRunStoppedSignal,
  renderWorkflowRunResult,
  renderWorktreeBlock,
} from '#cli/workflow/views/workflow-run.view.js';

type WorkflowRunCommandOptions = {
  worktree: boolean;
  base?: string;
  branch?: string;
  input?: string;
  inputFile?: string;
  detach?: boolean;
  json?: boolean;
};

export const workflowRunCommand = new Command('run')
  .description('Run a workflow in this project')
  .argument('<id>', 'Workflow id')
  .option('--input <text>', 'Text the workflow receives as $INPUT')
  .option('--input-file <path>', 'File whose text the workflow receives as $INPUT')
  .option('--no-worktree', 'Run in the project directory itself')
  .option('--base <ref>', 'Ref the worktree branch forks from (default: current HEAD)')
  .option('--branch <prefix>', 'Worktree branch prefix (default: orc/<workflow-id>)')
  .option('--detach', 'Run in the background and return immediately')
  .option('--json', 'Print the run and its nodes as JSON')
  .action(async (id: string, options: WorkflowRunCommandOptions) => {
    if (options.worktree === false && options.base !== undefined) {
      throw new WorkflowRunError('--base requires a worktree run. Drop --no-worktree to use it.');
    }

    if (options.worktree === false && options.branch !== undefined) {
      throw new WorkflowRunError('--branch requires a worktree run. Drop --no-worktree to use it.');
    }

    if (options.input !== undefined && options.inputFile !== undefined) {
      throw new WorkflowRunError('Pass either --input or --input-file, not both.');
    }

    let input: WorkflowRunInput | null = null;
    if (options.input !== undefined) {
      input = { kind: 'inline', text: options.input };
    } else if (options.inputFile !== undefined) {
      input = { kind: 'file', path: options.inputFile };
    }

    const quiet = options.json === true;
    const projectPath = process.cwd();
    const database = openDatabase(buildDatabasePath());

    try {
      const launcher = new WorkflowRunLauncher(database, renderWorkflowRunCancelling);
      const beginRun = quiet ? beginWorkflowRunQuietly : beginWorkflowRun;

      let handler: WorkflowRunHandler;
      if (options.worktree) {
        const provisioner = new WorktreeEnvironmentProvisioner(
          database,
          options.base ?? null,
          options.branch ?? null,
          quiet ? () => {} : renderWorktreeBlock,
        );
        handler = new WorktreeWorkflowRunHandler(database, provisioner, launcher, beginRun);
      } else {
        const provisioner = new InPlaceEnvironmentProvisioner(database);
        handler = new InPlaceWorkflowRunHandler(database, provisioner, launcher, beginRun);
      }

      const result = await handler.execute(projectPath, {
        workflowId: id,
        input,
        detach: options.detach ?? false,
      });

      if (quiet) {
        renderWorkflowRunStoppedSignal(result);
        printJson(handler.toJson(result));
      } else {
        renderWorkflowRunResult(result);
      }

      if (handler.hasFailed(result)) {
        process.exitCode = 1;
      }
    } finally {
      await database.destroy();
    }
  });
