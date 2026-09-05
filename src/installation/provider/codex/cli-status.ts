import type { ProviderCliStatus } from '../auth.js';

import {
  checkCodexCliCompatibility,
  formatCodexCliSupportedVersionRange,
} from './version-check.js';

export async function checkCodexCliStatus(): Promise<ProviderCliStatus> {
  const compatibility = await checkCodexCliCompatibility();
  switch (compatibility.status) {
    case 'compatible':
      return { status: 'available' };
    case 'not-found':
      return { status: 'not-found', installHint: 'Install Codex from chatgpt.com/codex.' };
    case 'check-failed':
      return { status: 'check-failed', checkCommand: 'codex --version' };
    case 'too-old':
    case 'unsupported-major':
      return {
        status: 'unsupported',
        supportedVersionRange: formatCodexCliSupportedVersionRange(),
        updateCommand: 'Update Codex from chatgpt.com/codex',
      };
    case 'untested-newer':
      return {
        status: 'may-be-incompatible',
        supportedVersionRange: formatCodexCliSupportedVersionRange(),
      };
  }
}
