import type { ProjectAddResult } from '#cli/project/handlers/project-add.handler.js';
import { formatNextStepRows, style, symbols } from '#cli/output.js';

export function renderProjectAddResult(result: ProjectAddResult): void {
  const { outcome, name, path } = result;

  const location = style.ident(path);

  switch (outcome) {
    case 'registered':
      console.log(`${style.success(symbols.ok)} Registered ${name} at ${location}`);
      break;
    case 'already-registered':
      console.log(`${style.muted(symbols.info)} ${name} is already registered at ${location}`);
      break;
    default:
      outcome satisfies never;
  }
}

export function renderProjectAddNextSteps(): void {
  const rows: [string, string][] = [
    ['Add a workflow', '.orc/workflows/<id>.yml'],
    ['Run a workflow', 'orc workflow run <name>'],
  ];

  console.log('');
  console.log(style.strong('Next:'));
  for (const line of formatNextStepRows(rows)) {
    console.log(line);
  }
}
