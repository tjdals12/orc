import { Argument, Command } from 'commander';

import { AuthLogoutHandler } from '#cli/auth/handlers/auth-logout.handler.js';
import { listProviderIds } from '#installation/provider/auth.js';
import { renderAuthLogoutResult } from '#cli/auth/views/provider-auth.view.js';

export const authLogoutCommand = new Command('logout')
  .description('Sign out of a provider')
  .addArgument(new Argument('<provider>', 'Provider to sign out of').choices(listProviderIds()))
  .action(async (provider: string) => {
    const handler = new AuthLogoutHandler();
    const result = await handler.execute({ providerId: provider });

    renderAuthLogoutResult(result);
    if (result.outcome === 'cli-not-found' || result.outcome === 'sign-out-failed') {
      process.exitCode = 1;
    }
  });
