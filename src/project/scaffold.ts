import fs from 'node:fs';

import { createDefaultProjectConfig } from './config/create.js';

export function ensureProjectScaffold(args: {
  workflowsDirPath: string;
  projectHooksDirPath: string;
  projectConfigPath: string;
}): void {
  const { workflowsDirPath, projectHooksDirPath, projectConfigPath } = args;

  fs.mkdirSync(workflowsDirPath, { recursive: true });
  fs.mkdirSync(projectHooksDirPath, { recursive: true });

  const projectConfigExists = fs.existsSync(projectConfigPath);
  if (!projectConfigExists) {
    createDefaultProjectConfig(projectConfigPath);
  }
}
