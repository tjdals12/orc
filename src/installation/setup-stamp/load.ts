import { z } from 'zod';

import fs from 'node:fs';
import util from 'node:util';

import { SetupStampSchema, type SetupStamp } from './schema.js';
import { InvalidSetupStampError } from './error.js';

export function loadSetupStamp(setupStampPath: string): SetupStamp | null {
  const exists = fs.existsSync(setupStampPath);
  if (!exists) {
    return null;
  }

  const raw = fs.readFileSync(setupStampPath, 'utf-8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    const message = e instanceof Error ? e.message : util.inspect(e);
    throw new InvalidSetupStampError(`Invalid setup-stamp at ${setupStampPath}.\n${message}`);
  }

  const result = SetupStampSchema.safeParse(parsed);
  if (result.error) {
    throw new InvalidSetupStampError(
      `Invalid setup-stamp at ${setupStampPath}.\n${z.prettifyError(result.error)}`,
    );
  }

  return result.data;
}

export function tryLoadSetupStamp(setupStampPath: string): SetupStamp | null {
  try {
    const setupStamp = loadSetupStamp(setupStampPath);
    return setupStamp;
  } catch (e) {
    if (e instanceof InvalidSetupStampError) {
      return null;
    }
    throw e;
  }
}
