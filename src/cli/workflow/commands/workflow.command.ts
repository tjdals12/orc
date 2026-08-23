import { Command } from 'commander';

import { workflowListCommand } from './workflow-list.command.js';
import { workflowValidateCommand } from './workflow-validate.command.js';
import { workflowRunCommand } from './workflow-run.command.js';
import { workflowResumeCommand } from './workflow-resume.command.js';
import { workflowApproveCommand } from './workflow-approve.command.js';
import { workflowRejectCommand } from './workflow-reject.command.js';
import { workflowApprovalsCommand } from './workflow-approvals.command.js';
import { workflowEventsCommand } from './workflow-events.command.js';
import { workflowLogsCommand } from './workflow-logs.command.js';
import { workflowHookLogsCommand } from './workflow-hook-logs.command.js';
import { workflowStreamCommand } from './workflow-stream.command.js';
import { workflowStatusCommand } from './workflow-status.command.js';
import { workflowRunsCommand } from './workflow-runs.command.js';
import { workflowPruneCommand } from './workflow-prune.command.js';
import { workflowCancelCommand } from './workflow-cancel.command.js';
import { workflowWorkerCommand } from './workflow-worker.command.js';

export const workflowCommand = new Command('workflow').description('Manage and run workflows');

workflowCommand.addCommand(workflowListCommand);
workflowCommand.addCommand(workflowValidateCommand);
workflowCommand.addCommand(workflowRunCommand);
workflowCommand.addCommand(workflowResumeCommand);
workflowCommand.addCommand(workflowApproveCommand);
workflowCommand.addCommand(workflowRejectCommand);
workflowCommand.addCommand(workflowApprovalsCommand);
workflowCommand.addCommand(workflowEventsCommand);
workflowCommand.addCommand(workflowLogsCommand);
workflowCommand.addCommand(workflowHookLogsCommand);
workflowCommand.addCommand(workflowStreamCommand);
workflowCommand.addCommand(workflowStatusCommand);
workflowCommand.addCommand(workflowRunsCommand);
workflowCommand.addCommand(workflowCancelCommand);
workflowCommand.addCommand(workflowPruneCommand);
workflowCommand.addCommand(workflowWorkerCommand, { hidden: true });
