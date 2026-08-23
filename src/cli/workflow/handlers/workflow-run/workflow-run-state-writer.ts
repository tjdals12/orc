import type { Kysely } from 'kysely';

import type { Database } from '#database/schema.js';
import {
  WorkflowRunNodeRepository,
  WorkflowRunRepository,
  type WorkflowRun,
  type WorkflowRunNode,
} from '#workflow-run/repository.js';

export class WorkflowRunStateWriter {
  private readonly _workflowRunRepository: WorkflowRunRepository;
  private readonly _workflowRunNodeRepository: WorkflowRunNodeRepository;

  constructor(database: Kysely<Database>) {
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
