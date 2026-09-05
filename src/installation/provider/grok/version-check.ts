import { z } from 'zod';

import { tryRunCliCommand } from '../cli-command.js';
import {
  isNewerVersion,
  isOlderVersion,
  parseSemanticVersion,
  type SemanticVersion,
} from '../semantic-version.js';

const minimumGrokVersion: SemanticVersion = { major: 1, minor: 0, patch: 13 };

const maximumTestedGrokVersion: SemanticVersion = { major: 1, minor: 0, patch: 13 };

export function formatGrokSupportedVersionRange(): string {
  return `>=${minimumGrokVersion.major}.${minimumGrokVersion.minor}.${minimumGrokVersion.patch}, <${minimumGrokVersion.major + 1}.0.0`;
}

export type GrokCliCompatibility =
  | { status: 'not-found' }
  | { status: 'compatible' }
  | { status: 'untested-newer' }
  | { status: 'too-old' }
  | { status: 'unsupported-major' }
  | { status: 'check-failed' };

const GrokVersionSchema = z.object({
  currentVersion: z.string().min(1),
});

function resolveCompatibility(version: string): GrokCliCompatibility {
  const currentGrokVersion = parseSemanticVersion(version);
  if (currentGrokVersion === null) {
    return { status: 'check-failed' };
  }

  if (isOlderVersion(currentGrokVersion, minimumGrokVersion)) {
    return { status: 'too-old' };
  }
  if (currentGrokVersion.major !== minimumGrokVersion.major) {
    return { status: 'unsupported-major' };
  }
  if (isNewerVersion(currentGrokVersion, maximumTestedGrokVersion)) {
    return { status: 'untested-newer' };
  }

  return { status: 'compatible' };
}

export async function checkGrokCliCompatibility(): Promise<GrokCliCompatibility> {
  const commandResult = await tryRunCliCommand('grok', ['version', '--json']);
  if (commandResult.outcome === 'not-found') {
    return { status: 'not-found' };
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

  const result = GrokVersionSchema.safeParse(payload);
  if (result.error) {
    return { status: 'check-failed' };
  }

  return resolveCompatibility(result.data.currentVersion);
}
