import path from 'node:path';
import fs from 'node:fs';

import { WORKTREE_HOOK_PHASES, type WorktreeHookPhase } from '#database/schema.js';
import { ProjectConfigError } from '#project/config/error.js';

export class WorktreeConfig {
  private readonly _hooksDirPath: string;
  private readonly _include: string[];
  private readonly _exclude: string[];
  private readonly _hook: Record<WorktreeHookPhase, string[]>;

  constructor(args: {
    hooksDirPath: string;
    include: string[];
    exclude: string[];
    hook: Record<WorktreeHookPhase, string[]>;
  }) {
    this._hooksDirPath = args.hooksDirPath;
    this._include = args.include;
    this._exclude = args.exclude;
    this._hook = args.hook;
  }

  get hooksDirPath(): string {
    return this._hooksDirPath;
  }

  get include(): string[] {
    return this._include;
  }

  get exclude(): string[] {
    return this._exclude;
  }

  listHookFiles(phase: WorktreeHookPhase): string[] {
    const hookFiles = this._hook[phase];
    return hookFiles;
  }

  listTeardownHookFiles(): string[] {
    const teardownHookFiles = [...this._hook['pre-remove'], ...this._hook['post-remove']];
    return teardownHookFiles;
  }

  assertHookFilesExist(): void {
    const hookFiles = WORKTREE_HOOK_PHASES.flatMap((phase) => this._hook[phase]);
    for (const file of hookFiles) {
      const hookFilePath = path.join(this._hooksDirPath, file);
      if (!fs.existsSync(hookFilePath)) {
        throw new ProjectConfigError(
          `Hook file not found at ${hookFilePath}. Check the worktree.hook section of the project config.`,
        );
      }
    }
  }
}
