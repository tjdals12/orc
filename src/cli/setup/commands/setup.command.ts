import { Command } from 'commander';

import { SpinnerProgressReporter } from '#cli/progress-reporter.js';
import { AuthStatusHandler } from '#cli/auth/handlers/auth-status.handler.js';
import { SetupHandler } from '#cli/setup/handlers/setup.handler.js';
import {
  renderNextSteps,
  renderSetupResult,
  renderSetupStep,
} from '#cli/setup/views/setup.view.js';
import { renderProviderAuths } from '#cli/auth/views/provider-auth.view.js';

export const setupCommand = new Command('setup')
  .description('Initialize this machine')
  .action(async () => {
    const setupHandler = new SetupHandler((step) => {
      renderSetupStep(step);
    });
    const result = await setupHandler.execute();
    renderSetupResult(result);

    const reporter = new SpinnerProgressReporter();
    const authStatusHandler = new AuthStatusHandler(reporter);
    const authStatusResult = await authStatusHandler.execute();
    renderProviderAuths(authStatusResult);

    if (result.outcome === 'initialized') {
      renderNextSteps();
    }
  });
