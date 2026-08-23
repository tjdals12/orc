import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const COMMAND_TIMEOUT_MS = 10_000;

type CliCommandOutput = { stdout: string; stderr: string };

function readCommandOutput(e: unknown): CliCommandOutput {
  if (e === null || typeof e !== 'object') {
    return { stdout: '', stderr: '' };
  }

  const stdout = 'stdout' in e ? String(e.stdout) : '';
  const stderr = 'stderr' in e ? String(e.stderr) : '';
  const output = { stdout, stderr };
  return output;
}

export async function tryRunCliCommand(command: string, args: string[]): Promise<CliCommandOutput> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: COMMAND_TIMEOUT_MS,
      env: {
        ...process.env,
        LC_ALL: 'C',
      },
    });
    const output = { stdout, stderr };
    return output;
  } catch (e) {
    const output = readCommandOutput(e);
    return output;
  }
}

export async function tryRunInteractiveCliCommand(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        LC_ALL: 'C',
      },
    });
    child.on('error', () => resolve());
    child.on('close', () => resolve());
  });
}
