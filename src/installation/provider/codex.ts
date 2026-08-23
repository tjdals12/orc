import { createRequire } from 'node:module';

import { tryRunCliCommand, tryRunInteractiveCliCommand } from './cli-command.js';
import { tryCreateRequireFromPackage, tryResolvePath } from './module-resolve.js';
import type { ProviderAuthStatus } from './auth.js';

function hasPlatformCliPackage(sdkRequire: NodeRequire, cliPackage: string): boolean {
  const cliPackageByPlatformArch: Record<string, string> = {
    'linux-x64': '@openai/codex-linux-x64',
    'linux-arm64': '@openai/codex-linux-arm64',
    'darwin-x64': '@openai/codex-darwin-x64',
    'darwin-arm64': '@openai/codex-darwin-arm64',
    'win32-x64': '@openai/codex-win32-x64',
    'win32-arm64': '@openai/codex-win32-arm64',
  };

  const platformArch = `${process.platform}-${process.arch}`;
  const platformCliPackage = cliPackageByPlatformArch[platformArch];
  if (platformCliPackage === undefined) {
    return false;
  }

  const cliPackageJsonPath = tryResolvePath(sdkRequire, `${cliPackage}/package.json`);
  if (cliPackageJsonPath === null) {
    return false;
  }

  const cliRequire = createRequire(cliPackageJsonPath);
  const platformPackageJsonPath = tryResolvePath(cliRequire, `${platformCliPackage}/package.json`);
  return platformPackageJsonPath !== null;
}

function resolveCodexCliLauncherPath(): string | null {
  const sdkPackage = '@openai/codex-sdk';
  const cliPackage = '@openai/codex';

  const sdkRequire = tryCreateRequireFromPackage(sdkPackage);
  if (sdkRequire === null) {
    return null;
  }

  if (!hasPlatformCliPackage(sdkRequire, cliPackage)) {
    return null;
  }

  const launcherPath = tryResolvePath(sdkRequire, `${cliPackage}/bin/codex.js`);
  return launcherPath;
}

export async function checkCodexAuthStatus(): Promise<ProviderAuthStatus> {
  const launcherPath = resolveCodexCliLauncherPath();
  if (launcherPath === null) {
    return { status: 'cli-not-found' };
  }

  const output = await tryRunCliCommand(process.execPath, [launcherPath, 'login', 'status']);

  const signedInPattern = /^Logged in using (.+)$/m;
  const signedInMatch = signedInPattern.exec(output.stderr);
  const method = signedInMatch?.[1]?.trim() ?? null;
  if (method !== null && method.length > 0) {
    const status: ProviderAuthStatus = { status: 'signed-in', method };
    return status;
  }

  if (output.stderr.includes('Not logged in')) {
    return { status: 'signed-out' };
  }

  return { status: 'check-failed' };
}

export async function signInToCodex(): Promise<void> {
  const launcherPath = resolveCodexCliLauncherPath();
  if (launcherPath === null) {
    return;
  }

  await tryRunInteractiveCliCommand(process.execPath, [launcherPath, 'login']);
}

export async function signOutFromCodex(): Promise<void> {
  const launcherPath = resolveCodexCliLauncherPath();
  if (launcherPath === null) {
    return;
  }

  await tryRunCliCommand(process.execPath, [launcherPath, 'logout']);
}
