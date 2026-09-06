import { tryRunCliCommand } from '../cli-command.js';
import {
  isNewerVersion,
  isOlderVersion,
  parseSemanticVersion,
  type SemanticVersion,
} from '../semantic-version.js';

const minimumCodexCliVersion: SemanticVersion = { major: 0, minor: 153, patch: 4 };

const maximumTestedCodexCliVersion: SemanticVersion = { major: 0, minor: 153, patch: 4 };

export type CodexCliCompatibility =
  | { status: 'not-found' }
  | { status: 'compatible' }
  | { status: 'untested-newer' }
  | { status: 'too-old' }
  | { status: 'unsupported-major' }
  | { status: 'check-failed' };

export function formatCodexCliSupportedVersionRange(): string {
  return `>=${minimumCodexCliVersion.major}.${minimumCodexCliVersion.minor}.${minimumCodexCliVersion.patch}, <${minimumCodexCliVersion.major + 1}.0.0`;
}

export function classifyCodexCliVersion(output: string): CodexCliCompatibility {
  const versionPrefix = 'codex-cli ';
  const normalizedOutput = output.trim();
  const hasVersionPrefix = normalizedOutput.startsWith(versionPrefix);
  if (!hasVersionPrefix) {
    return { status: 'check-failed' };
  }

  const versionText = normalizedOutput.slice(versionPrefix.length);
  const currentCodexCliVersion = parseSemanticVersion(versionText);
  if (currentCodexCliVersion === null) {
    return { status: 'check-failed' };
  }
  if (isOlderVersion(currentCodexCliVersion, minimumCodexCliVersion)) {
    return { status: 'too-old' };
  }
  if (currentCodexCliVersion.major !== minimumCodexCliVersion.major) {
    return { status: 'unsupported-major' };
  }
  if (isNewerVersion(currentCodexCliVersion, maximumTestedCodexCliVersion)) {
    return { status: 'untested-newer' };
  }

  return { status: 'compatible' };
}

export async function checkCodexCliCompatibility(): Promise<CodexCliCompatibility> {
  const commandResult = await tryRunCliCommand('codex', ['--version']);
  if (commandResult.outcome === 'not-found') {
    return { status: 'not-found' };
  }
  if (commandResult.outcome !== 'succeeded') {
    return { status: 'check-failed' };
  }

  return classifyCodexCliVersion(commandResult.stdout);
}
