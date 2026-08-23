import picomatch from 'picomatch';

import util from 'node:util';
import path from 'node:path';
import fs from 'node:fs';

import {
  addWorktree,
  buildGitFailureDetail,
  deleteBranch,
  hasBranch,
  listIgnoredFilePaths,
  pruneWorktreeRegistrations,
  removeWorktree,
} from '#shared/git.js';

import { ExecutionEnvironmentError } from './error.js';
import {
  renderWorktreeHooks,
  runWorktreeHook,
  tryRunWorktreeHooks,
  type RecordHookOutput,
} from './worktree-hook.js';

function buildRemoveFailureMessage(worktreePath: string, e: unknown): string {
  const message = `Failed to remove the worktree at ${worktreePath}. ${buildGitFailureDetail(e)}`;
  return message;
}

function buildDeleteBranchFailureMessage(branch: string, e: unknown): string {
  const message = `Failed to delete the branch "${branch}". ${buildGitFailureDetail(e)}`;
  return message;
}

function expandDirectoryPatterns(patterns: string[]): string[] {
  const expanded: string[] = [];
  for (const pattern of patterns) {
    const directoryPattern = pattern.replace(/\/+$/, '');
    if (directoryPattern.length > 0) {
      expanded.push(directoryPattern);
      expanded.push(`${directoryPattern}/**`);
    }
  }
  return expanded;
}

async function copyIgnoredFiles(args: {
  repoPath: string;
  worktreePath: string;
  include: string[];
  exclude: string[];
}): Promise<void> {
  const { repoPath, worktreePath, include, exclude } = args;

  if (include.length === 0) {
    return;
  }

  let ignoredFilePaths: string[];
  try {
    ignoredFilePaths = await listIgnoredFilePaths(repoPath);
  } catch (e) {
    const message = e instanceof Error ? e.message : util.inspect(e);
    throw new ExecutionEnvironmentError(
      `Failed to list the ignored files in ${repoPath}.\n${message}`,
    );
  }

  const isIncluded = picomatch(expandDirectoryPatterns(include), { dot: true });
  const isExcluded = picomatch(expandDirectoryPatterns(exclude), { dot: true });
  const matchedFilePaths = ignoredFilePaths.filter(
    (ignoredFilePath) => isIncluded(ignoredFilePath) && !isExcluded(ignoredFilePath),
  );

  for (const matchedFilePath of matchedFilePaths) {
    const sourcePath = path.join(repoPath, matchedFilePath);
    const targetPath = path.join(worktreePath, matchedFilePath);
    try {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      const sourceStats = fs.lstatSync(sourcePath);
      if (sourceStats.isSymbolicLink()) {
        const sourceLink = fs.readlinkSync(sourcePath);
        fs.symlinkSync(sourceLink, targetPath);
      } else {
        fs.copyFileSync(sourcePath, targetPath);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : util.inspect(e);
      throw new ExecutionEnvironmentError(
        `Failed to copy ${matchedFilePath} into the worktree. ${message}`,
      );
    }
  }
}

export type WorktreeProvisionStep =
  { kind: 'create-worktree' } | { kind: 'copy-ignored-files' } | { kind: 'run-hook'; file: string };

export async function provisionWorktree(
  args: {
    repoPath: string;
    worktreePath: string;
    branch: string;
    base: string;
    hooksDirPath: string;
    include: string[];
    exclude: string[];
    hookFiles: string[];
  },
  options: {
    recordStep: (step: WorktreeProvisionStep) => Promise<void>;
    recordHookOutput: RecordHookOutput;
  },
): Promise<void> {
  const { repoPath, worktreePath, branch, base, hooksDirPath, include, exclude, hookFiles } = args;
  const { recordStep, recordHookOutput } = options;

  const hooks = renderWorktreeHooks({
    hooksDirPath,
    files: hookFiles,
    context: {
      repoPath,
      worktreePath,
      branch,
    },
  });

  await recordStep({ kind: 'create-worktree' });
  try {
    await addWorktree({
      repoPath,
      worktreePath,
      branch,
      base,
    });
  } catch (e) {
    throw new ExecutionEnvironmentError(
      `Failed to create a worktree at ${worktreePath}. ${buildGitFailureDetail(e)}`,
    );
  }

  if (include.length > 0) {
    await recordStep({ kind: 'copy-ignored-files' });
    await copyIgnoredFiles({
      repoPath,
      worktreePath,
      include,
      exclude,
    });
  }

  for (const hook of hooks) {
    await recordStep({ kind: 'run-hook', file: hook.file });
    await runWorktreeHook(hook, {
      cwd: worktreePath,
      recordOutput: (stream, text) => recordHookOutput(hook.file, stream, text),
    });
  }
}

export type WorktreeTeardownStep =
  | { kind: 'run-hooks'; phase: 'pre-remove' | 'post-remove' }
  | { kind: 'remove-worktree' }
  | { kind: 'delete-branch' };

type WorktreeTeardownResult = {
  keptBranch: string | null;
  warnings: string[];
};

export async function teardownWorktree(
  args: {
    repoPath: string;
    worktreePath: string;
    branch: string;
    hooksDirPath: string;
    preRemoveHookFiles: string[];
    postRemoveHookFiles: string[];
    force: boolean;
  },
  options: {
    recordStep: (step: WorktreeTeardownStep) => void;
    recordHookOutput: RecordHookOutput;
  },
): Promise<WorktreeTeardownResult> {
  const {
    repoPath,
    worktreePath,
    branch,
    hooksDirPath,
    preRemoveHookFiles,
    postRemoveHookFiles,
    force,
  } = args;
  const { recordStep, recordHookOutput } = options;

  const context = { repoPath, worktreePath, branch };
  const warnings: string[] = [];

  if (fs.existsSync(worktreePath)) {
    if (preRemoveHookFiles.length > 0) {
      recordStep({ kind: 'run-hooks', phase: 'pre-remove' });
      const preRemoveFailures = await tryRunWorktreeHooks(
        {
          hooksDirPath,
          files: preRemoveHookFiles,
          context,
          cwd: worktreePath,
        },
        { recordHookOutput },
      );
      warnings.push(...preRemoveFailures.map((failure) => failure.message));
    }

    recordStep({ kind: 'remove-worktree' });
    try {
      await removeWorktree({ repoPath, worktreePath });
    } catch (e) {
      warnings.push(buildRemoveFailureMessage(worktreePath, e));
    }
  }

  await pruneWorktreeRegistrations(repoPath);

  let keptBranch: string | null = null;
  const branchExists = await hasBranch({ repoPath, branch });
  if (branchExists) {
    recordStep({ kind: 'delete-branch' });
    try {
      await deleteBranch({ repoPath, branch }, { force });
    } catch (e) {
      const stillExists = await hasBranch({ repoPath, branch });
      if (stillExists) {
        keptBranch = branch;
      } else {
        warnings.push(buildDeleteBranchFailureMessage(branch, e));
      }
    }
  }

  if (postRemoveHookFiles.length > 0) {
    recordStep({ kind: 'run-hooks', phase: 'post-remove' });
    const postRemoveFailures = await tryRunWorktreeHooks(
      {
        hooksDirPath,
        files: postRemoveHookFiles,
        context,
        cwd: repoPath,
      },
      { recordHookOutput },
    );
    warnings.push(...postRemoveFailures.map((failure) => failure.message));
  }

  const result: WorktreeTeardownResult = { keptBranch, warnings };
  return result;
}

export async function tryDiscardWorktree(args: {
  repoPath: string;
  worktreePath: string;
  branch: string;
}): Promise<string[]> {
  const { repoPath, worktreePath, branch } = args;

  const failureMessages: string[] = [];

  if (fs.existsSync(worktreePath)) {
    try {
      await removeWorktree({ repoPath, worktreePath });
    } catch (e) {
      failureMessages.push(buildRemoveFailureMessage(worktreePath, e));
    }
  }

  const branchExists = await hasBranch({ repoPath, branch });
  if (branchExists) {
    try {
      await deleteBranch({ repoPath, branch }, { force: true });
    } catch (e) {
      failureMessages.push(buildDeleteBranchFailureMessage(branch, e));
    }
  }

  return failureMessages;
}
