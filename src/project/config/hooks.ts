import { WORKTREE_HOOK_PHASES } from '#database/schema.js';

import type { WorktreeConfigFile } from './schema.js';

export function countHookFiles(worktree: WorktreeConfigFile | null): number {
  let hookFileCount = 0;
  for (const phase of WORKTREE_HOOK_PHASES) {
    const hookFiles = worktree?.hook?.[phase] ?? [];
    hookFileCount += hookFiles.length;
  }
  return hookFileCount;
}
