import type { ProviderCliStatus } from '../auth.js';

import {
  checkClaudeCliCompatibility,
  formatClaudeCliSupportedVersionRange,
} from './version-check.js';

export async function checkClaudeCliStatus(): Promise<ProviderCliStatus> {
  const compatibility = await checkClaudeCliCompatibility();
  switch (compatibility.status) {
    case 'compatible':
      return { status: 'available' };
    case 'not-found':
      return {
        status: 'not-found',
        installHint: 'Install Claude Code from code.claude.com/docs/en/overview.',
      };
    case 'check-failed':
      return { status: 'check-failed', checkCommand: 'claude --version' };
    case 'too-old':
    case 'unsupported-major':
      return {
        status: 'unsupported',
        supportedVersionRange: formatClaudeCliSupportedVersionRange(),
        updateCommand: 'claude update',
      };
    case 'untested-newer':
      return {
        status: 'may-be-incompatible',
        supportedVersionRange: formatClaudeCliSupportedVersionRange(),
      };
  }
}
