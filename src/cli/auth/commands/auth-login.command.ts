import { Argument, Command } from 'commander';

import { AuthLoginHandler } from '#cli/auth/handlers/auth-login.handler.js';
import { listProviderIds } from '#installation/provider/auth.js';
import {
  renderAuthLoginResult,
  renderProviderSignInNote,
} from '#cli/auth/views/provider-auth.view.js';

export const authLoginCommand = new Command('login')
  .description('Sign in to a provider')
  .addArgument(new Argument('<provider>', 'Provider to sign in to').choices(listProviderIds()))
  .action(async (provider: string) => {
    const handler = new AuthLoginHandler((note) => {
      renderProviderSignInNote(note);
    });
    const result = await handler.execute({ providerId: provider });

    renderAuthLoginResult(result);
    if (result.outcome === 'cli-not-found' || result.outcome === 'sign-in-failed') {
      process.exitCode = 1;
    }
  });
