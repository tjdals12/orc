import type { Kysely } from 'kysely';

import type { Database, WorkflowRunStatus } from '#database/schema.js';
import { WorkflowRunRepository } from '#workflow-run/repository.js';
import { WorkflowRunError } from '#workflow-run/error.js';

import { WorkflowRunLoader } from './workflow-run-loader.js';

export type WorkflowCancellingResult = {
  outcome: 'cancelling';
  workflowRunId: string;
};

export type WorkflowCancelledResult = {
  outcome: 'cancelled';
  workflowRunId: string;
};

export type WorkflowCancelNoopResult = {
  outcome: 'noop';
  workflowRunId: string;
  status: WorkflowRunStatus;
};

export type WorkflowCancelResult =
  WorkflowCancellingResult | WorkflowCancelledResult | WorkflowCancelNoopResult;

export class WorkflowCancelHandler {
  private readonly _workflowRunRepository: WorkflowRunRepository;
  private readonly _loader: WorkflowRunLoader;

  constructor(database: Kysely<Database>) {
    this._workflowRunRepository = new WorkflowRunRepository(database);
    this._loader = new WorkflowRunLoader(database);
  }

  async execute(args: { workflowRunId: string }): Promise<WorkflowCancelResult> {
    const workflowRun = await this._workflowRunRepository.findById(args.workflowRunId);
    if (!workflowRun) {
      throw new WorkflowRunError(`No workflow run "${args.workflowRunId}".`);
    }

    if (workflowRun.status === 'paused') {
      const cancelled = await this._workflowRunRepository.update(
        { id: workflowRun.id, status: 'paused' },
        { status: 'cancelled', finished_at: new Date().toISOString() },
      );
      if (!cancelled) {
        const result = await this.buildNoop(workflowRun.id, workflowRun.status);
        return result;
      }

      const workflowRunRecorder = await this._loader.buildRecorder(workflowRun.id, {
        onEvent: () => {},
        onLog: () => {},
        onHookLog: () => {},
      });
      await workflowRunRecorder.recordEvent({ type: 'run_cancelled' });

      const result: WorkflowCancelledResult = {
        outcome: 'cancelled',
        workflowRunId: workflowRun.id,
      };
      return result;
    }

    const cancelling = await this._workflowRunRepository.update(
      { id: args.workflowRunId, status: { in: ['pending', 'running'] } },
      { status: 'cancelled' },
    );
    if (!cancelling) {
      const result = await this.buildNoop(workflowRun.id, workflowRun.status);
      return result;
    }

    const result: WorkflowCancellingResult = {
      outcome: 'cancelling',
      workflowRunId: args.workflowRunId,
    };
    return result;
  }

  private async buildNoop(
    workflowRunId: string,
    fallbackStatus: WorkflowRunStatus,
  ): Promise<WorkflowCancelNoopResult> {
    const current = await this._workflowRunRepository.findById(workflowRunId);
    const currentStatus = current === null ? fallbackStatus : current.status;
    const noop: WorkflowCancelNoopResult = {
      outcome: 'noop',
      workflowRunId,
      status: currentStatus,
    };
    return noop;
  }
}
