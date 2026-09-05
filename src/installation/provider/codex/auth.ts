import { tryRunCliCommand, tryRunInteractiveCliCommand } from '../cli-command.js';
import type { ProviderAuthStatus } from '../auth.js';

function parseCodexAuthMethod(output: string): string | null {
  const signedInPattern = /^Logged in using (.+)$/m;
  const signedInMatch = signedInPattern.exec(output);
  const method = signedInMatch?.[1]?.trim() ?? null;
  if (method !== null && method.length > 0) {
    return method;
  }
  return null;
}

function isSignedOutOutput(output: string): boolean {
  return /^Not logged in\r?\n?$/.test(output);
}

export async function checkCodexAuthStatus(): Promise<ProviderAuthStatus> {
  const commandResult = await tryRunCliCommand('codex', ['login', 'status']);
  if (commandResult.outcome === 'not-found') {
    return { status: 'cli-not-found' };
  }

  const outputs = [commandResult.stdout, commandResult.stderr];
  if (commandResult.outcome === 'succeeded') {
    for (const output of outputs) {
      const method = parseCodexAuthMethod(output);
      if (method !== null) {
        return { status: 'signed-in', method };
      }
    }
  }
  if (commandResult.outcome === 'failed') {
    for (const output of outputs) {
      if (isSignedOutOutput(output)) {
        return { status: 'signed-out' };
      }
    }
  }
  return { status: 'check-failed' };
}

export async function signInToCodex(): Promise<void> {
  await tryRunInteractiveCliCommand('codex', ['login']);
}

export async function signOutFromCodex(): Promise<void> {
  await tryRunInteractiveCliCommand('codex', ['logout']);
}
