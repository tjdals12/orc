import type { ProviderCliStatus } from '../auth.js';

import { checkGrokCliCompatibility, formatGrokSupportedVersionRange } from './version-check.js';

export async function checkGrokCliStatus(): Promise<ProviderCliStatus> {
  const compatibility = await checkGrokCliCompatibility();
  switch (compatibility.status) {
    case 'compatible':
      return { status: 'available' };
    case 'not-found':
      return { status: 'not-found', installHint: 'Install Grok Build from docs.x.ai/build.' };
    case 'check-failed':
      return { status: 'check-failed', checkCommand: 'grok version --json' };
    case 'too-old':
    case 'unsupported-major':
      return {
        status: 'unsupported',
        supportedVersionRange: formatGrokSupportedVersionRange(),
        updateCommand: 'grok update --stable',
      };
    case 'untested-newer':
      return {
        status: 'may-be-incompatible',
        supportedVersionRange: formatGrokSupportedVersionRange(),
      };
  }
}
