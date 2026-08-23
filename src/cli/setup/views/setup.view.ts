import type { SetupResult, SetupStep } from '#cli/setup/handlers/setup.handler.js';
import { formatNextStepRows, style, symbols } from '#cli/output.js';

function formatSetupStepBody(step: SetupStep): string {
  switch (step.kind) {
    case 'home-dir':
    case 'config':
    case 'database': {
      const path = style.ident(step.path);
      return step.changed ? `Created ${path}` : `${path} already exists`;
    }
    case 'migrations': {
      const migrationNoun = step.appliedCount === 1 ? 'migration' : 'migrations';
      return step.appliedCount > 0
        ? `Applied ${step.appliedCount} ${migrationNoun}`
        : 'Migrations are up to date';
    }
  }
}

function hasSetupStepChanged(step: SetupStep): boolean {
  const changed = step.kind === 'migrations' ? step.appliedCount > 0 : step.changed;
  return changed;
}

export function renderSetupStep(step: SetupStep): void {
  const marker = hasSetupStepChanged(step) ? style.success(symbols.ok) : style.muted(symbols.info);
  console.log(`${marker} ${formatSetupStepBody(step)}`);
}

export function renderSetupResult(result: SetupResult): void {
  const { outcome } = result;

  const ok = style.success(symbols.ok);

  console.log('');
  switch (outcome) {
    case 'initialized':
      console.log(`${ok} Initialized`);
      break;
    case 'updated':
      console.log(`${ok} Updated installation`);
      break;
    case 'unchanged':
      console.log(`${ok} Already set up`);
      break;
    default:
      outcome satisfies never;
  }
}

export function renderNextSteps(): void {
  const rows: [string, string][] = [
    ['Register a project', 'orc project add <name>'],
    ['Run a workflow', 'orc workflow run <name>'],
    ['Check run history', 'orc workflow runs'],
  ];

  console.log('');
  console.log(style.strong('Next:'));
  for (const line of formatNextStepRows(rows)) {
    console.log(line);
  }
}
