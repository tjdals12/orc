import { Command } from 'commander';

import { skillInstallCommand } from './skill-install.command.js';

export const skillCommand = new Command('skill').description('Manage the agent skill');

skillCommand.addCommand(skillInstallCommand);
