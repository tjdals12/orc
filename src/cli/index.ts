import { Command } from 'commander';

import { createRequire } from 'node:module';

import { ConfigError } from '#installation/config/error.js';
import { SetupStampError } from '#installation/setup-stamp/error.js';
import { ProjectError } from '#project/error.js';
import { WorkflowError } from '#workflow/error.js';

import { assertSetupComplete } from './setup-gate.js';
import { style, symbols } from './output.js';
import { setupCommand } from './setup/commands/setup.command.js';
import { projectCommand } from './project/commands/project.command.js';
import { workflowCommand } from './workflow/commands/workflow.command.js';
import { hookCommand } from './hook/commands/hook.command.js';
import { authCommand } from './auth/commands/auth.command.js';
import { doctorCommand } from './doctor/commands/doctor.command.js';
import { skillCommand } from './skill/commands/skill.command.js';
import { WorkflowRunError } from '#workflow-run/error.js';
import { ExecutionEnvironmentError } from '#execution-environment/error.js';

const program = new Command();
const require = createRequire(import.meta.url);
const { version, bugs } = require('#package.json') as {
  version: string;
  bugs: { url: string };
};

const GATE_EXEMPT_COMMANDS = new Set(['setup', 'doctor']);

program.hook('preAction', (_program, actionCommand) => {
  const commandName = actionCommand.name();
  if (!GATE_EXEMPT_COMMANDS.has(commandName)) {
    assertSetupComplete();
  }
});

program.name('orc').version(version);

program.addCommand(setupCommand);
program.addCommand(projectCommand);
program.addCommand(workflowCommand);
program.addCommand(hookCommand);
program.addCommand(authCommand);
program.addCommand(doctorCommand);
program.addCommand(skillCommand);

try {
  await program.parseAsync();
} catch (e) {
  const known =
    e instanceof ConfigError ||
    e instanceof SetupStampError ||
    e instanceof ProjectError ||
    e instanceof WorkflowError ||
    e instanceof WorkflowRunError ||
    e instanceof ExecutionEnvironmentError;
  if (known) {
    console.error(`${style.error(symbols.fail)} ${e.message}`);
  } else {
    console.error(e);
    console.error('');
    console.error(
      style.muted(
        `This is a bug. Run "orc doctor" to check this install, or report it at ${bugs.url} with the output above.`,
      ),
    );
  }
  process.exitCode = 1;
}
