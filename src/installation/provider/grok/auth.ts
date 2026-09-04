import fs from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { tryRunInteractiveCliCommand } from '../cli-command.js';
import type { ProviderAuthStatus } from '../auth.js';

function buildGrokAuthPath(): string {
  return path.join(homedir(), '.grok', 'auth.json');
}

export async function checkGrokAuthStatus(): Promise<ProviderAuthStatus> {
  if (process.env.XAI_API_KEY !== undefined && process.env.XAI_API_KEY.length > 0) {
    return { status: 'signed-in', method: 'XAI_API_KEY' };
  }
  try {
    await fs.access(buildGrokAuthPath());
    return { status: 'signed-in', method: 'cached credentials' };
  } catch {
    return { status: 'signed-out' };
  }
}

export async function signInToGrok(): Promise<void> {
  await tryRunInteractiveCliCommand('grok', ['login']);
}

export async function signOutFromGrok(): Promise<void> {
  await tryRunInteractiveCliCommand('grok', ['logout']);
}
