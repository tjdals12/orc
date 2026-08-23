import { Environment } from 'minijinja-js';

import { createHash } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import util from 'node:util';
import { ExecutionEnvironmentError } from './error.js';
import { runBashScript } from '#shared/bash-script.js';

function sanitize(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized;
}

const PORT_FLOOR = 1024;
const PORT_CEILING = 65535;

function hashPort(value: string): number {
  const digest = createHash('sha256').update(value).digest();
  const range = PORT_CEILING - PORT_FLOOR + 1;
  const port = PORT_FLOOR + (digest.readUInt32BE(0) % range);
  return port;
}

function createEnvironment(): Environment {
  const environment = new Environment();
  environment.undefinedBehavior = 'strict';
  environment.addFilter('sanitize', (value: unknown) => sanitize(String(value)));
  environment.addFilter('hash_port', (value: unknown) => hashPort(String(value)));
  return environment;
}

type WorktreeHookContext = {
  repoPath: string;
  worktreePath: string;
  branch: string;
};

type RenderedWorktreeHook = {
  file: string;
  script: string;
};

export function renderWorktreeHooks(args: {
  hooksDirPath: string;
  files: string[];
  context: WorktreeHookContext;
}): RenderedWorktreeHook[] {
  const { hooksDirPath, files, context } = args;

  const environment = createEnvironment();

  const renderedWorktreeHooks = files.map<RenderedWorktreeHook>((file) => {
    const hookFilePath = path.join(hooksDirPath, file);

    let source: string;
    try {
      source = fs.readFileSync(hookFilePath, 'utf-8');
    } catch (e) {
      const message = e instanceof Error ? e.message : util.inspect(e);
      throw new ExecutionEnvironmentError(`Cannot read the hook at ${hookFilePath}. ${message}`);
    }

    let script: string;
    try {
      script = environment.renderStr(source, {
        repo: path.basename(context.repoPath),
        worktree_path: context.worktreePath,
        branch: context.branch,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : util.inspect(e);
      throw new ExecutionEnvironmentError(
        `Failed to render the hook at ${hookFilePath}. ${message}`,
      );
    }

    return {
      file,
      script,
    };
  });

  return renderedWorktreeHooks;
}

type RecordOutput = (stream: 'stdout' | 'stderr', text: string) => Promise<void>;

export type RecordHookOutput = (
  file: string,
  stream: 'stdout' | 'stderr',
  text: string,
) => Promise<void>;

export async function runWorktreeHook(
  hook: RenderedWorktreeHook,
  options: { cwd: string; recordOutput: RecordOutput },
): Promise<void> {
  const { cwd, recordOutput } = options;
  const { file, script } = hook;

  const lastStderr: { line: string | null } = { line: null };
  const bashScriptResult = await runBashScript(script, {
    cwd,
    recordOutput: async (stream, text) => {
      if (stream === 'stderr' && text.length > 0) {
        lastStderr.line = text;
      }
      await recordOutput(stream, text);
    },
  });

  if (bashScriptResult.outcome === 'spawn-failed') {
    throw new ExecutionEnvironmentError(
      `Failed to spawn bash for the hook "${file}". ${bashScriptResult.message}`,
    );
  }

  const detail = lastStderr.line === null ? '' : ` ${lastStderr.line}`;
  if (bashScriptResult.outcome === 'killed') {
    throw new ExecutionEnvironmentError(
      `Hook "${file}" was killed by ${bashScriptResult.signal}.${detail}`,
    );
  }
  if (bashScriptResult.code !== 0) {
    throw new ExecutionEnvironmentError(
      `Hook "${file}" exited with code ${bashScriptResult.code}.${detail}`,
    );
  }
}

type WorktreeHookFailure = {
  file: string;
  message: string;
};

export async function tryRunWorktreeHooks(
  args: {
    hooksDirPath: string;
    files: string[];
    context: WorktreeHookContext;
    cwd: string;
  },
  options: {
    recordHookOutput: RecordHookOutput;
  },
): Promise<WorktreeHookFailure[]> {
  const { hooksDirPath, files, context, cwd } = args;
  const { recordHookOutput } = options;

  const failures: WorktreeHookFailure[] = [];
  for (const file of files) {
    try {
      const renderedHooks = renderWorktreeHooks({ hooksDirPath, files: [file], context });
      for (const renderedHook of renderedHooks) {
        await runWorktreeHook(renderedHook, {
          cwd,
          recordOutput: (stream, text) => recordHookOutput(file, stream, text),
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : util.inspect(e);
      failures.push({ file, message });
    }
  }
  return failures;
}
