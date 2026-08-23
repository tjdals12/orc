import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import fs from 'node:fs';
import util from 'node:util';

import { ProjectConfigSchema, type ProjectConfigFile } from './schema.js';
import { InvalidProjectConfigError, ProjectConfigError } from './error.js';

export function loadProjectConfig(projectConfigPath: string): ProjectConfigFile | null {
  const exists = fs.existsSync(projectConfigPath);
  if (!exists) {
    return null;
  }

  const raw = fs.readFileSync(projectConfigPath, 'utf-8');

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (e) {
    const reason = e instanceof Error ? e.message : util.inspect(e);
    throw new InvalidProjectConfigError(
      `Invalid project config at ${projectConfigPath}.\n${reason}`,
      reason,
    );
  }

  const result = ProjectConfigSchema.safeParse(parsed);
  if (result.error) {
    const reason = z.prettifyError(result.error);
    throw new InvalidProjectConfigError(
      `Invalid project config at ${projectConfigPath}.\n${reason}`,
      reason,
    );
  }

  return result.data;
}

export function loadProjectConfigOrThrow(projectConfigPath: string): ProjectConfigFile {
  const projectConfig = loadProjectConfig(projectConfigPath);
  if (projectConfig === null) {
    throw new ProjectConfigError(
      `No project config at ${projectConfigPath}. Run "orc project add <name>" to create it.`,
    );
  }
  return projectConfig;
}
