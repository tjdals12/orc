import { buildSetupStampPath } from '#shared/path.js';
import { loadSetupStamp } from '#installation/setup-stamp/load.js';
import { SETUP_VERSION } from '#installation/setup-stamp/schema.js';
import {
  NewerSetupStampError,
  NotFoundSetupStampError,
  OutdatedSetupStampError,
} from '#installation/setup-stamp/error.js';

export function assertSetupComplete(): void {
  const setupStampPath = buildSetupStampPath();
  const setupStamp = loadSetupStamp(setupStampPath);

  if (setupStamp === null) {
    throw new NotFoundSetupStampError('Not set up yet. Run setup first.');
  }

  if (setupStamp.setupVersion < SETUP_VERSION) {
    throw new OutdatedSetupStampError('Setup is out of date. Run setup again.');
  }

  if (setupStamp.setupVersion > SETUP_VERSION) {
    throw new NewerSetupStampError(
      'This machine was set up by a newer version of this tool. Update the tool first.',
    );
  }
}
