import fs from 'node:fs';

import { SETUP_VERSION, type SetupStamp } from './schema.js';

export function writeSetupStamp(setupStampPath: string): void {
  const setupStamp: SetupStamp = {
    setupVersion: SETUP_VERSION,
    completedAt: new Date().toISOString(),
  };

  fs.writeFileSync(setupStampPath, `${JSON.stringify(setupStamp, null, 2)}\n`);
}
