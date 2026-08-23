import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import fs from 'node:fs';
import util from 'node:util';

import { GlobalConfigSchema, type GlobalConfigFile } from './schema.js';
import { InvalidConfigError, NotFoundConfigError } from './error.js';

export function loadConfig(configPath: string): GlobalConfigFile | null {
  const exists = fs.existsSync(configPath);
  if (!exists) {
    return null;
  }

  const raw = fs.readFileSync(configPath, 'utf-8');

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (e) {
    const reason = e instanceof Error ? e.message : util.inspect(e);
    throw new InvalidConfigError(`Invalid config at ${configPath}.\n${reason}`, reason);
  }

  const result = GlobalConfigSchema.safeParse(parsed);
  if (result.error) {
    const reason = z.prettifyError(result.error);
    throw new InvalidConfigError(`Invalid config at ${configPath}.\n${reason}`, reason);
  }

  return result.data;
}

export function loadConfigOrThrow(configPath: string): GlobalConfigFile {
  const config = loadConfig(configPath);
  if (config === null) {
    throw new NotFoundConfigError(`No config at ${configPath}. Run setup first.`);
  }
  return config;
}
