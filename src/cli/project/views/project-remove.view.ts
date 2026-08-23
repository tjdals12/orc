import type { ProjectRemoveResult } from '#cli/project/handlers/project-remove.handler.js';
import { style, symbols } from '#cli/output.js';

export function renderProjectRemoveResult(result: ProjectRemoveResult): void {
  const { outcome } = result;

  if (outcome === 'removed') {
    const { name, path } = result;
    console.log(`${style.success(symbols.ok)} Removed ${name} at ${style.ident(path)}`);
    return;
  }

  if (outcome === 'not-registered') {
    const { name } = result;
    console.log(`${style.warn(symbols.warn)} ${name} is not registered`);
    return;
  }

  result satisfies never;
}
