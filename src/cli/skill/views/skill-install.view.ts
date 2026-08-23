import path from 'node:path';

import type { SkillInstallResult } from '#cli/skill/handlers/skill-install.handler.js';
import { style, symbols } from '#cli/output.js';

function renderUnregisteredProjectWarning(): void {
  console.log('');
  console.log(`${style.warn(symbols.warn)} This project is not registered.`);
  console.log(style.muted('  Workflows only run in a registered project.'));
  console.log(style.muted('  Register it with "orc project add <name>".'));
}

export function renderSkillInstallResult(result: SkillInstallResult): void {
  const { outcome, projectPath, targetSkillDirPaths, registered } = result;

  switch (outcome) {
    case 'installed':
      console.log(`${style.success(symbols.ok)} Installed the agent skill`);
      break;
    case 'updated':
      console.log(`${style.success(symbols.ok)} Updated the agent skill`);
      break;
    case 'unchanged':
      console.log(`${style.muted(symbols.info)} The agent skill is already up to date`);
      break;
    default:
      outcome satisfies never;
  }

  for (const targetSkillDirPath of targetSkillDirPaths) {
    console.log(`  ${style.ident(path.relative(projectPath, targetSkillDirPath))}`);
  }

  if (!registered) {
    renderUnregisteredProjectWarning();
  }
}
