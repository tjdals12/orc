import { execFile } from 'node:child_process';
import util, { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function runGit(
  args: string[],
  options: { cwd: string; maxBuffer?: number },
): Promise<string> {
  const { cwd, maxBuffer } = options;
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    ...(maxBuffer === undefined ? {} : { maxBuffer }),
    env: {
      ...process.env,
      LC_ALL: 'C',
    },
  });
  return stdout;
}

export function buildGitFailureDetail(e: unknown): string {
  const stderr = e && typeof e === 'object' && 'stderr' in e ? String(e.stderr).trim() : '';
  if (stderr.length > 0) {
    return stderr;
  }

  const detail = e instanceof Error ? e.message : util.inspect(e);
  return detail;
}

export async function hasHeadCommit(repoPath: string): Promise<boolean> {
  try {
    await runGit(['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: repoPath });
    return true;
  } catch {
    return false;
  }
}

export async function hasBranch(args: { repoPath: string; branch: string }): Promise<boolean> {
  const { repoPath, branch } = args;
  try {
    await runGit(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: repoPath });
    return true;
  } catch {
    return false;
  }
}

export async function addWorktree(args: {
  repoPath: string;
  worktreePath: string;
  branch: string;
  base: string;
}): Promise<void> {
  const { repoPath, worktreePath, branch, base } = args;
  await runGit(['worktree', 'add', worktreePath, '-b', branch, base], { cwd: repoPath });
}

export async function removeWorktree(args: {
  repoPath: string;
  worktreePath: string;
}): Promise<void> {
  const { repoPath, worktreePath } = args;
  await runGit(['worktree', 'remove', '--force', worktreePath], { cwd: repoPath });
}

export async function deleteBranch(
  args: { repoPath: string; branch: string },
  options: { force: boolean },
): Promise<void> {
  const { repoPath, branch } = args;
  const flag = options.force ? '-D' : '-d';
  await runGit(['-c', 'advice.forceDeleteBranch=false', 'branch', flag, branch], { cwd: repoPath });
}

export async function pruneWorktreeRegistrations(repoPath: string): Promise<void> {
  try {
    await runGit(['worktree', 'prune'], { cwd: repoPath });
  } catch {
    return;
  }
}

export async function listIgnoredFilePaths(repoPath: string): Promise<string[]> {
  const stdout = await runGit(['ls-files', '--others', '--ignored', '--exclude-standard', '-z'], {
    cwd: repoPath,
    maxBuffer: 64 * 1024 * 1024,
  });
  const filePaths = stdout.split('\0').filter((filePath) => filePath.length > 0);
  return filePaths;
}
