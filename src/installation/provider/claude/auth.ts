import { z } from 'zod';

import { tryRunCliCommand, tryRunInteractiveCliCommand } from '../cli-command.js';
import type { ProviderAuthStatus } from '../auth.js';

const ClaudeAuthStatusSchema = z.object({
  loggedIn: z.boolean(),
  authMethod: z.string(),
});

export async function checkClaudeAuthStatus(): Promise<ProviderAuthStatus> {
  const commandResult = await tryRunCliCommand('claude', ['auth', 'status']);
  if (commandResult.outcome === 'not-found') {
    return { status: 'cli-not-found' };
  }
  if (commandResult.outcome !== 'succeeded') {
    return { status: 'check-failed' };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(commandResult.stdout);
  } catch {
    return { status: 'check-failed' };
  }

  const result = ClaudeAuthStatusSchema.safeParse(payload);
  if (result.error) {
    return { status: 'check-failed' };
  }
  if (!result.data.loggedIn) {
    return { status: 'signed-out' };
  }

  return { status: 'signed-in', method: result.data.authMethod };
}

export async function signInToClaude(): Promise<void> {
  await tryRunInteractiveCliCommand('claude', ['auth', 'login']);
}

export async function signOutFromClaude(): Promise<void> {
  await tryRunCliCommand('claude', ['auth', 'logout']);
}
