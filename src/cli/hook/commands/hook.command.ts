import { Command } from 'commander';

import { hookRunCommand } from './hook-run.command.js';

export const hookCommand = new Command('hook').description('Manage worktree hooks');

hookCommand.addCommand(hookRunCommand);
