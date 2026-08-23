import { Command } from 'commander';

import { projectAddCommand } from './project-add.command.js';
import { projectListCommand } from './project-list.command.js';
import { projectRemoveCommand } from './project-remove.command.js';
import { projectPruneCommand } from './project-prune.command.js';

export const projectCommand = new Command('project').description('Manage project registrations');

projectCommand.addCommand(projectAddCommand);
projectCommand.addCommand(projectListCommand);
projectCommand.addCommand(projectRemoveCommand);
projectCommand.addCommand(projectPruneCommand);
