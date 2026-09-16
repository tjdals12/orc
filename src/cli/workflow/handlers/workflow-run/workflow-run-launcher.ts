import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

import type { Kysely } from 'kysely';

import type { Database, WorkflowRunStatus } from '#database/schema.js';
import { WorkflowRunRepository } from '#workflow-run/repository.js';
import { WorkflowRunError } from '#workflow-run/error.js';
import type { WorkflowRunRecorder } from '#workflow-run/recorder.js';

import { ProcessGroupRegistry } from '#shared/process-group-registry.js';

type DetachedCommand = {
  child: ChildProcess;
  pid: number;
};

type EndedWorkflowRunStatus = Exclude<WorkflowRunStatus, 'pending' | 'running' | 'stopping'>;

export type WorkflowWorkerLaunchResult =
  | { outcome: 'running'; workerPid: number }
  | { outcome: 'ended'; workerPid: number; status: EndedWorkflowRunStatus }
  | { outcome: 'interrupted' };

export class WorkflowRunLauncher {
  private readonly _workflowRunRepository: WorkflowRunRepository;

  constructor(database: Kysely<Database>) {
    this._workflowRunRepository = new WorkflowRunRepository(database);
  }

  spawnStopFinalizer(workflowRunId: string): number {
    const command = this.spawnDetachedCommand(
      '__stop-finalizer',
      workflowRunId,
      'workflow stop finalizer',
    );
    return command.pid;
  }

  async launchWorker(args: {
    workflowRunId: string;
    workflowRunRecorder: WorkflowRunRecorder;
    signal?: AbortSignal;
  }): Promise<WorkflowWorkerLaunchResult> {
    const { workflowRunId, workflowRunRecorder, signal } = args;
    const command = this.spawnDetachedCommand('__worker', workflowRunId, 'workflow run worker');

    const workerState: {
      error: Error | null;
      exit: { code: number | null; signal: NodeJS.Signals | null } | null;
    } = { error: null, exit: null };
    command.child.once('error', (error) => {
      workerState.error = error;
    });
    command.child.once('exit', (code, exitSignal) => {
      workerState.exit = { code, signal: exitSignal };
    });

    while (true) {
      const workflowRun = await this._workflowRunRepository.findById(workflowRunId);
      if (workflowRun === null) {
        ProcessGroupRegistry.kill(command.child);
        throw new WorkflowRunError(`No workflow run "${workflowRunId}".`);
      }

      if (workflowRun.status === 'running') {
        if (workflowRun.pid !== command.pid) {
          ProcessGroupRegistry.kill(command.child);
          const recordedPid = workflowRun.pid === null ? 'no PID' : `process ${workflowRun.pid}`;
          throw new WorkflowRunError(
            `Workflow run ${workflowRun.id} was claimed with ${recordedPid} instead of process ${command.pid}.`,
          );
        }
        return { outcome: 'running', workerPid: command.pid };
      }

      if (workflowRun.status !== 'pending' && workflowRun.status !== 'stopping') {
        return {
          outcome: 'ended',
          workerPid: command.pid,
          status: workflowRun.status,
        };
      }

      const interrupted = signal !== undefined && signal.aborted;
      if (interrupted) {
        if (workflowRun.status === 'pending') {
          const cancelled = await this._workflowRunRepository.update(
            { id: workflowRun.id, status: 'pending' },
            { status: 'cancelled', finished_at: new Date().toISOString() },
          );
          if (cancelled) {
            ProcessGroupRegistry.kill(command.child);
            await workflowRunRecorder.recordEvent({ type: 'run_cancelled' });
          }
        }
        return { outcome: 'interrupted' };
      }

      const { error: workerError, exit: workerExit } = workerState;
      if (workerError !== null) {
        const reason = `Failed to start the workflow run worker. ${workerError.message}`;
        if (workflowRun.status === 'stopping') {
          throw new WorkflowRunError(reason);
        }

        const failed = await this._workflowRunRepository.update(
          { id: workflowRun.id, status: 'pending' },
          { status: 'failed', finished_at: new Date().toISOString() },
        );
        if (failed) {
          await workflowRunRecorder.recordEvent({ type: 'run_failed', reason });
          throw new WorkflowRunError(reason);
        }
      } else if (workerExit !== null) {
        let exitDetail: string;
        if (workerExit.signal !== null) {
          exitDetail = workerExit.signal;
        } else if (workerExit.code !== null) {
          exitDetail = `code ${workerExit.code}`;
        } else {
          exitDetail = 'code unknown';
        }
        const reason = `The workflow run worker exited before claiming run ${workflowRun.id} (${exitDetail}).`;
        if (workflowRun.status === 'stopping') {
          throw new WorkflowRunError(reason);
        }

        const failed = await this._workflowRunRepository.update(
          { id: workflowRun.id, status: 'pending' },
          { status: 'failed', finished_at: new Date().toISOString() },
        );
        if (failed) {
          await workflowRunRecorder.recordEvent({ type: 'run_failed', reason });
          throw new WorkflowRunError(reason);
        }
      } else {
        try {
          await setTimeout(100, undefined, { signal });
        } catch (e) {
          const pollWasInterrupted = e instanceof Error && e.name === 'AbortError';
          if (!pollWasInterrupted) {
            throw e;
          }
        }
      }
    }
  }

  private spawnDetachedCommand(
    command: string,
    workflowRunId: string,
    processName: string,
  ): DetachedCommand {
    const entryPath = process.argv[1];
    if (entryPath === undefined) {
      throw new WorkflowRunError(`Failed to resolve the CLI entry point for the ${processName}.`);
    }

    const child = spawn(
      process.execPath,
      [...process.execArgv, entryPath, 'workflow', command, workflowRunId],
      {
        detached: true,
        stdio: 'ignore',
      },
    );
    child.unref();

    const workerPid = child.pid;
    if (workerPid === undefined) {
      throw new WorkflowRunError(`Failed to start the ${processName}.`);
    }
    return { child, pid: workerPid };
  }
}
