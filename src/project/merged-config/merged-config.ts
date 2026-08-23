import {
  DEFAULT_MAX_CONCURRENT_NODES,
  type GlobalConfigFile,
} from '#installation/config/schema.js';
import type { ProjectConfigFile } from '#project/config/schema.js';

import { RunConfig } from './run-config.js';
import type { MergedConfigFile } from './schema.js';
import { WorktreeConfig } from './worktree-config.js';

export class MergedConfig {
  private readonly _version: number;
  private readonly _run: RunConfig;
  private readonly _worktree: WorktreeConfig;

  private constructor(args: { version: number; run: RunConfig; worktree: WorktreeConfig }) {
    this._version = args.version;
    this._run = args.run;
    this._worktree = args.worktree;
  }

  static merge(
    projectHooksDirPath: string,
    globalConfigFile: GlobalConfigFile,
    projectConfigFile: ProjectConfigFile,
  ): MergedConfig {
    const { version, worktree = {} } = projectConfigFile;

    const runConfig = new RunConfig({
      maxConcurrentNodes:
        projectConfigFile.run?.max_concurrent_nodes ??
        globalConfigFile.run?.max_concurrent_nodes ??
        DEFAULT_MAX_CONCURRENT_NODES,
    });

    const worktreeConfig = new WorktreeConfig({
      hooksDirPath: projectHooksDirPath,
      include: worktree.include ?? [],
      exclude: worktree.exclude ?? [],
      hook: {
        'post-create': worktree?.hook?.['post-create'] ?? [],
        'pre-remove': worktree?.hook?.['pre-remove'] ?? [],
        'post-remove': worktree?.hook?.['post-remove'] ?? [],
      },
    });

    const mergedConfig = new MergedConfig({
      version,
      run: runConfig,
      worktree: worktreeConfig,
    });
    return mergedConfig;
  }

  static fromFile(hooksDirPath: string, mergedConfigFile: MergedConfigFile): MergedConfig {
    const { version, run, worktree } = mergedConfigFile;

    const runConfig = new RunConfig({ maxConcurrentNodes: run.max_concurrent_nodes });

    const worktreeConfig = new WorktreeConfig({
      hooksDirPath,
      include: worktree.include,
      exclude: worktree.exclude,
      hook: worktree.hook,
    });
    const mergedConfig = new MergedConfig({
      version,
      run: runConfig,
      worktree: worktreeConfig,
    });
    return mergedConfig;
  }

  get run(): RunConfig {
    return this._run;
  }

  get worktree(): WorktreeConfig {
    return this._worktree;
  }

  toFile(): MergedConfigFile {
    const run = { max_concurrent_nodes: this._run.maxConcurrentNodes };

    const worktree: MergedConfigFile['worktree'] = {
      include: this._worktree.include,
      exclude: this._worktree.exclude,
      hook: {
        'post-create': this._worktree.listHookFiles('post-create'),
        'pre-remove': this._worktree.listHookFiles('pre-remove'),
        'post-remove': this._worktree.listHookFiles('post-remove'),
      },
    };

    const mergedConfigFile: MergedConfigFile = { version: this._version, worktree, run };
    return mergedConfigFile;
  }
}
