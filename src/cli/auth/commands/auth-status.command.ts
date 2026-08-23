import { Command } from 'commander';

import { SilentProgressReporter, SpinnerProgressReporter } from '#cli/progress-reporter.js';
import { AuthStatusHandler } from '#cli/auth/handlers/auth-status.handler.js';
import { printJson } from '#cli/output.js';
import { renderProviderAuths } from '#cli/auth/views/provider-auth.view.js';

export const authStatusCommand = new Command('status')
  .description('Show which providers are signed in')
  .option('--json', 'Output machine-readable JSON')
  .action(async (options: { json?: boolean }) => {
    const reporter = options.json ? new SilentProgressReporter() : new SpinnerProgressReporter();
    const handler = new AuthStatusHandler(reporter);
    const result = await handler.execute();

    if (options.json) {
      printJson(result);
      return;
    }

    renderProviderAuths(result);
  });
