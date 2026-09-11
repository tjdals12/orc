import type { Kysely } from 'kysely';

import type { Database } from '#database/schema.js';
import {
  WorkflowRunNodeRepository,
  WorkflowRunRepository,
  type WorkflowRun,
  type WorkflowRunNode,
} from '#workflow-run/repository.js';

export class WorkflowRunStateWriter {
  private readonly _database: Kysely<Database>;
  private readonly _workflowRunRepository: WorkflowRunRepository;
  private readonly _workflowRunNodeRepository: WorkflowRunNodeRepository;

  constructor(database: Kysely<Database>) {
    this._database = database;
    this._workflowRunRepository = new WorkflowRunRepository(database);
    this._workflowRunNodeRepository = new WorkflowRunNodeRepository(database);
  }

  async markRunStarted(workflowRun: Pick<WorkflowRun, 'id' | 'started_at'>): Promise<boolean> {
    const started = await this._workflowRunRepository.update(
      {
        id: workflowRun.id,
        status: 'pending',
      },
      {
        status: 'running',
        pid: process.pid,
        started_at: workflowRun.started_at ?? new Date().toISOString(),
      },
    );
    return started;
  }

  async markPendingRunCancelled(workflowRunId: string): Promise<void> {
    await this._workflowRunRepository.updateOrThrow(
      { id: workflowRunId },
      { status: 'cancelled', finished_at: new Date().toISOString() },
    );
  }

  async markPendingRunFailed(workflowRunId: string): Promise<void> {
    await this._workflowRunRepository.updateOrThrow(
      { id: workflowRunId },
      { status: 'failed', finished_at: new Date().toISOString() },
    );
  }

  async markRunFailed(workflowRunId: string): Promise<boolean> {
    const failed = await this._workflowRunRepository.update(
      {
        id: workflowRunId,
        status: 'running',
      },
      {
        status: 'failed',
        finished_at: new Date().toISOString(),
      },
    );
    return failed;
  }

  async markRunSucceeded(workflowRunId: string): Promise<boolean> {
    const succeeded = await this._workflowRunRepository.update(
      {
        id: workflowRunId,
        status: 'running',
      },
      { status: 'succeeded', finished_at: new Date().toISOString() },
    );
    return succeeded;
  }

  async markRunPaused(workflowRunId: string): Promise<boolean> {
    const paused = await this._workflowRunRepository.update(
      {
        id: workflowRunId,
        status: 'running',
      },
      {
        status: 'paused',
      },
    );
    return paused;
  }

  async markRunStopped(
    workflowRunId: string,
    workflowRunNodes: Pick<WorkflowRunNode, 'id' | 'workflow_run_id'>[],
  ): Promise<void> {
    const finishedAt = new Date().toISOString();
    await this._database.transaction().execute(async (transaction) => {
      const stopped = await this._workflowRunRepository.update(
        { id: workflowRunId, status: 'stopping' },
        { status: 'stopped', pid: null, finished_at: finishedAt },
        { transaction },
      );
      if (!stopped) {
        throw new Error(`Workflow run ${workflowRunId} is no longer stopping.`);
      }

      for (const workflowRunNode of workflowRunNodes) {
        const nodeStopped = await this._workflowRunNodeRepository.update(
          {
            id: workflowRunNode.id,
            workflowRunId: workflowRunNode.workflow_run_id,
            status: 'running',
          },
          { status: 'stopped', finished_at: finishedAt },
          { transaction },
        );
        if (!nodeStopped) {
          throw new Error(`Workflow run node ${workflowRunNode.id} is no longer running.`);
        }
      }
    });
  }

  async markRunStopFailed(workflowRunId: string): Promise<void> {
    const stopFailed = await this._workflowRunRepository.update(
      { id: workflowRunId, status: 'stopping' },
      { status: 'stop_failed', pid: null, finished_at: new Date().toISOString() },
    );
    if (!stopFailed) {
      throw new Error(`Workflow run ${workflowRunId} is no longer stopping.`);
    }
  }

  async markRunFinished(workflowRunId: string): Promise<void> {
    await this._workflowRunRepository.updateOrThrow(
      {
        id: workflowRunId,
      },
      { finished_at: new Date().toISOString() },
    );
  }

  async markNodeStarted(
    workflowRunNode: Pick<WorkflowRunNode, 'id' | 'workflow_run_id'>,
  ): Promise<void> {
    await this._workflowRunNodeRepository.updateOrThrow(
      {
        id: workflowRunNode.id,
        workflowRunId: workflowRunNode.workflow_run_id,
      },
      {
        status: 'running',
        started_at: new Date().toISOString(),
      },
    );
  }

  async markNodeFailed(
    workflowRunNode: Pick<WorkflowRunNode, 'id' | 'workflow_run_id'>,
  ): Promise<void> {
    await this._workflowRunNodeRepository.updateOrThrow(
      {
        id: workflowRunNode.id,
        workflowRunId: workflowRunNode.workflow_run_id,
      },
      {
        status: 'failed',
        finished_at: new Date().toISOString(),
      },
    );
  }

  async markNodeAwaitingDecision(
    workflowRunNode: Pick<WorkflowRunNode, 'id' | 'workflow_run_id'>,
    message: string,
  ): Promise<void> {
    await this._workflowRunNodeRepository.updateOrThrow(
      {
        id: workflowRunNode.id,
        workflowRunId: workflowRunNode.workflow_run_id,
      },
      {
        status: 'awaiting_decision',
        message,
        reason: null,
      },
    );
  }

  async markNodeSucceeded(
    workflowRunNode: Pick<WorkflowRunNode, 'id' | 'workflow_run_id'>,
  ): Promise<void> {
    await this._workflowRunNodeRepository.updateOrThrow(
      {
        id: workflowRunNode.id,
        workflowRunId: workflowRunNode.workflow_run_id,
      },
      {
        status: 'succeeded',
        finished_at: new Date().toISOString(),
      },
    );
  }
}
