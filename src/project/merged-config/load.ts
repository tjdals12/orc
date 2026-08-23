import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import fs from 'node:fs';
import util from 'node:util';

import { ProjectConfigError } from '#project/config/error.js';

import { MergedConfig } from './merged-config.js';
import { MergedConfigSchema } from './schema.js';

export function loadMergedConfig(
  mergedConfigPath: string,
  hooksDirPath: string,
): MergedConfig | null {
  const exists = fs.existsSync(mergedConfigPath);
  if (!exists) {
    return null;
  }

  const raw = fs.readFileSync(mergedConfigPath, 'utf-8');

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (e) {
    const message = e instanceof Error ? e.message : util.inspect(e);
    throw new ProjectConfigError(`Invalid merged config at ${mergedConfigPath}.\n${message}`);
  }

  const result = MergedConfigSchema.safeParse(parsed);
  if (result.error) {
    throw new ProjectConfigError(
      `Invalid merged config at ${mergedConfigPath}.\n${z.prettifyError(result.error)}`,
    );
  }

  const mergedConfig = MergedConfig.fromFile(hooksDirPath, result.data);
  return mergedConfig;
}

export function loadMergedConfigOrThrow(
  mergedConfigPath: string,
  hooksDirPath: string,
): MergedConfig {
  const mergedConfig = loadMergedConfig(mergedConfigPath, hooksDirPath);
  if (mergedConfig === null) {
    throw new ProjectConfigError(`No merged config at ${mergedConfigPath}.`);
  }
  return mergedConfig;
}
