import { z } from 'zod';

import fs from 'node:fs';

import { tryRunCliCommand, tryRunInteractiveCliCommand } from './cli-command.js';
import { tryCreateRequireFromPackage, tryResolvePath } from './module-resolve.js';
import type { ProviderAuthStatus } from './auth.js';

type GlibcProcessReport = { header?: { glibcVersionRuntime?: string } };

const ClaudeAuthStatusSchema = z.object({
  loggedIn: z.boolean(),
  authMethod: z.string(),
});

function prefersMuslCli(): boolean {
  if (process.platform !== 'linux') {
    return false;
  }

  const report = process.report?.getReport() as GlibcProcessReport | undefined;
  const prefersMusl = report?.header?.glibcVersionRuntime === undefined;
  return prefersMusl;
}

function collectCliPackageNames(sdkPackage: string): string[] {
  const { platform, arch } = process;

  if (platform === 'linux') {
    const glibcPackage = `${sdkPackage}-linux-${arch}`;
    const muslPackage = `${glibcPackage}-musl`;
    const packageNames = prefersMuslCli()
      ? [muslPackage, glibcPackage]
      : [glibcPackage, muslPackage];
    return packageNames;
  }

  const packageNames = [`${sdkPackage}-${platform}-${arch}`];
  return packageNames;
}

function resolveClaudeCliPath(): string | null {
  const sdkPackage = '@anthropic-ai/claude-agent-sdk';

  const sdkRequire = tryCreateRequireFromPackage(sdkPackage);
  if (sdkRequire === null) {
    return null;
  }

  const executableName = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const packageNames = collectCliPackageNames(sdkPackage);

  for (const packageName of packageNames) {
    const cliPath = tryResolvePath(sdkRequire, `${packageName}/${executableName}`);
    if (cliPath !== null && fs.existsSync(cliPath)) {
      return cliPath;
    }
  }

  return null;
}

export async function checkClaudeAuthStatus(): Promise<ProviderAuthStatus> {
  const cliPath = resolveClaudeCliPath();
  if (cliPath === null) {
    return { status: 'cli-not-found' };
  }

  const output = await tryRunCliCommand(cliPath, ['auth', 'status']);

  let payload: unknown;
  try {
    payload = JSON.parse(output.stdout);
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

  const status: ProviderAuthStatus = { status: 'signed-in', method: result.data.authMethod };
  return status;
}

export async function signInToClaude(): Promise<void> {
  const cliPath = resolveClaudeCliPath();
  if (cliPath === null) {
    return;
  }

  await tryRunInteractiveCliCommand(cliPath, ['auth', 'login']);
}

export async function signOutFromClaude(): Promise<void> {
  const cliPath = resolveClaudeCliPath();
  if (cliPath === null) {
    return;
  }

  await tryRunCliCommand(cliPath, ['auth', 'logout']);
}
