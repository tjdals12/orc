import { tryRunCliCommand } from '../cli-command.js';
import {
  isNewerVersion,
  isOlderVersion,
  parseSemanticVersion,
  type SemanticVersion,
} from '../semantic-version.js';

const minimumClaudeCliVersion: SemanticVersion = { major: 2, minor: 1, patch: 261 };

const maximumTestedClaudeCliVersion: SemanticVersion = { major: 2, minor: 1, patch: 261 };

export type ClaudeCliCompatibility =
  | { status: 'not-found' }
  | { status: 'compatible' }
  | { status: 'untested-newer' }
  | { status: 'too-old' }
  | { status: 'unsupported-major' }
  | { status: 'check-failed' };

export function formatClaudeCliSupportedVersionRange(): string {
  return `>=${minimumClaudeCliVersion.major}.${minimumClaudeCliVersion.minor}.${minimumClaudeCliVersion.patch}, <${minimumClaudeCliVersion.major + 1}.0.0`;
}

export function classifyClaudeCliVersion(output: string): ClaudeCliCompatibility {
  const currentClaudeCliVersion = parseSemanticVersion(output.trim());
  if (currentClaudeCliVersion === null) {
    return { status: 'check-failed' };
  }
  if (isOlderVersion(currentClaudeCliVersion, minimumClaudeCliVersion)) {
    return { status: 'too-old' };
  }
  if (currentClaudeCliVersion.major !== minimumClaudeCliVersion.major) {
    return { status: 'unsupported-major' };
  }
  if (isNewerVersion(currentClaudeCliVersion, maximumTestedClaudeCliVersion)) {
    return { status: 'untested-newer' };
  }

  return { status: 'compatible' };
}

export async function checkClaudeCliCompatibility(): Promise<ClaudeCliCompatibility> {
  const commandResult = await tryRunCliCommand('claude', ['--version']);
  if (commandResult.outcome === 'not-found') {
    return { status: 'not-found' };
  }
  if (commandResult.outcome !== 'succeeded') {
    return { status: 'check-failed' };
  }

  return classifyClaudeCliVersion(commandResult.stdout);
}
