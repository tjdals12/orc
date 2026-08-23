import { Command } from 'commander';

import { authLoginCommand } from './auth-login.command.js';
import { authLogoutCommand } from './auth-logout.command.js';
import { authStatusCommand } from './auth-status.command.js';

export const authCommand = new Command('auth').description('Manage provider sign-in');

authCommand.addCommand(authLoginCommand);
authCommand.addCommand(authLogoutCommand);
authCommand.addCommand(authStatusCommand);
