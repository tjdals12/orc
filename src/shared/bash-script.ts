import { spawn } from 'node:child_process';
import type { ChildProcess, ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import util from 'node:util';

import { relayOutputLines } from './process-output-relay.js';
import { ProcessGroupRegistry } from './process-group-registry.js';

type BashExit =
  | { kind: 'spawn-failed'; message: string }
  | { kind: 'exited'; code: number | null; signal: NodeJS.Signals | null };

function waitForBashExit(child: ChildProcess): Promise<BashExit> {
  return new Promise((resolve) => {
    child.once('error', (error) => {
      resolve({ kind: 'spawn-failed', message: error.message });
    });
    child.once('close', (code, signal) => {
      resolve({ kind: 'exited', code, signal });
    });
  });
}

type RecordBashOutput = (stream: 'stdout' | 'stderr', text: string) => Promise<void>;

export type BashScriptOptions = {
  cwd: string;
  env?: Record<string, string>;
  recordOutput: RecordBashOutput;
} & ({ detached: true; signal: AbortSignal } | { detached?: false });

type BashScriptResult =
  | { outcome: 'spawn-failed'; message: string }
  | { outcome: 'killed'; signal: NodeJS.Signals }
  | { outcome: 'exited'; code: number | null };

export async function runBashScript(
  script: string,
  options: BashScriptOptions,
): Promise<BashScriptResult> {
  const { cwd, env, recordOutput } = options;

  let child: ChildProcessByStdio<null, Readable, Readable>;
  try {
    child = spawn('bash', ['-c', script], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: options.detached ?? false,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : util.inspect(e);
    const bashScriptResult: BashScriptResult = { outcome: 'spawn-failed', message };
    return bashScriptResult;
  }

  const stopOnAbort = (): void => {
    ProcessGroupRegistry.stop(child);
  };
  if (options.detached) {
    ProcessGroupRegistry.register(child);
    options.signal.addEventListener('abort', stopOnAbort, { once: true });
  }

  const exitReported = waitForBashExit(child);
  const stdoutRelayed = relayOutputLines(child.stdout, (text) => recordOutput('stdout', text));
  const stderrRelayed = relayOutputLines(child.stderr, (text) => recordOutput('stderr', text));
  const [exit] = await Promise.all([exitReported, stdoutRelayed, stderrRelayed]);

  if (options.detached) {
    options.signal.removeEventListener('abort', stopOnAbort);
  }

  if (exit.kind === 'spawn-failed') {
    const bashScriptResult: BashScriptResult = { outcome: 'spawn-failed', message: exit.message };
    return bashScriptResult;
  }
  if (exit.signal !== null) {
    const bashScriptResult: BashScriptResult = { outcome: 'killed', signal: exit.signal };
    return bashScriptResult;
  }

  const bashScriptResult: BashScriptResult = { outcome: 'exited', code: exit.code };
  return bashScriptResult;
}
