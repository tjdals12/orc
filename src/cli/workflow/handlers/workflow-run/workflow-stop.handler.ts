import util from 'node:util';

import type { Kysely } from 'kysely';

import type { Database } from '#database/schema.js';
import { resolveWorkflowRunLiveness } from '#workflow-run/liveness.js';
import { WorkflowRunRepository } from '#workflow-run/repository.js';
import { WorkflowRunError } from '#workflow-run/error.js';

import type { WorkflowRunLauncher } from './workflow-run-launcher.js';
import { WorkflowRunLoader } from './workflow-run-loader.js';

export type WorkflowStopResult = {
  outcome: 'stopping' | 'noop';
  workflowRunId: string;
  status: 'stopping' | 'stopped';
  finalizerPid: number | null;
};

export class WorkflowStopHandler {
  private readonly _workflowRunRepository: WorkflowRunRepository;
  private readonly _launcher: WorkflowRunLauncher;
  private readonly _loader: WorkflowRunLoader;

  constructor(database: Kysely<Database>, launcher: WorkflowRunLauncher) {
    this._workflowRunRepository = new WorkflowRunRepository(database);
    this._launcher = launcher;
    this._loader = new WorkflowRunLoader(database);
  }

  async execute(args: { workflowRunId: string }): Promise<WorkflowStopResult> {
    const workflowRun = await this._workflowRunRepository.findById(args.workflowRunId);
    if (!workflowRun) {
      throw new WorkflowRunError(`No workflow run "${args.workflowRunId}".`);
    }

    if (workflowRun.status === 'stopped') {
      const result = this.buildResult('noop', workflowRun.id, 'stopped', null);
      return result;
    }
    if (workflowRun.status === 'stopping') {
      const liveness = resolveWorkflowRunLiveness(workflowRun);
      let finalizerPid = null;
      if (liveness === 'dead') {
        finalizerPid = await this.spawnStopFinalizer(workflowRun.id);
      }

      const outcome = finalizerPid === null ? 'noop' : 'stopping';
      const result = this.buildResult(outcome, workflowRun.id, 'stopping', finalizerPid);
      return result;
    }

    if (
      workflowRun.status !== 'pending' &&
      workflowRun.status !== 'running' &&
      workflowRun.status !== 'stop_failed'
    ) {
      throw new WorkflowRunError(
        `Workflow run ${workflowRun.id} is ${workflowRun.status} and cannot be stopped.`,
      );
    }
    const stopping = await this._workflowRunRepository.update(
      { id: workflowRun.id, status: workflowRun.status },
      { status: 'stopping', finished_at: null },
    );
    if (!stopping) {
      const current = await this._workflowRunRepository.findById(workflowRun.id);
      if (current?.status === 'stopping' || current?.status === 'stopped') {
        const result = this.buildResult('noop', workflowRun.id, current.status, null);
        return result;
      }
      throw new WorkflowRunError(
        `Workflow run ${workflowRun.id} changed state. Check "orc workflow status ${workflowRun.id}" and try again.`,
      );
    }

    const liveness = resolveWorkflowRunLiveness(workflowRun);
    const needsFinalizer = workflowRun.status === 'stop_failed' || liveness === 'dead';
    let finalizerPid = null;
    if (needsFinalizer) {
      finalizerPid = await this.spawnStopFinalizer(workflowRun.id);
    }
    const result = this.buildResult('stopping', workflowRun.id, 'stopping', finalizerPid);
    return result;
  }

  toJson(result: WorkflowStopResult) {
    return {
      workflow_run_id: result.workflowRunId,
      status: result.status,
      finalizer_pid: result.finalizerPid,
    };
  }

  private buildResult(
    outcome: WorkflowStopResult['outcome'],
    workflowRunId: string,
    status: WorkflowStopResult['status'],
    finalizerPid: number | null,
  ): WorkflowStopResult {
    return { outcome, workflowRunId, status, finalizerPid };
  }

  private async spawnStopFinalizer(workflowRunId: string): Promise<number> {
    try {
      return this._launcher.spawnStopFinalizer(workflowRunId);
    } catch (e) {
      const reason = e instanceof Error ? e.message : util.inspect(e);
      const stopFailed = await this._workflowRunRepository.update(
        { id: workflowRunId, status: 'stopping' },
        { status: 'stop_failed', pid: null, finished_at: new Date().toISOString() },
      );
      if (stopFailed) {
        const recorder = await this._loader.buildRecorder(workflowRunId, {
          onEvent: () => {},
          onLog: () => {},
          onHookLog: () => {},
        });
        await recorder.recordEvent({ type: 'run_stop_failed', reason });
      }
      throw e;
    }
  }
}
