import { spawn } from 'node:child_process';

import type { Kysely } from 'kysely';

import type { Database } from '#database/schema.js';
import type { Workflow } from '#workflow/workflow.js';
import {
  WorkflowRunRepository,
  type WorkflowRun,
  type WorkflowRunNode,
} from '#workflow-run/repository.js';
import { WorkflowRunError } from '#workflow-run/error.js';
import type { WorkflowRunRecorder } from '#workflow-run/recorder.js';
import { WorkflowRunExecutor } from '#workflow-run/executor/run-executor.js';
import type { WorkflowRunExecutionState } from '#workflow-run/executor/types.js';
import type { WorkflowExecutionResult } from '#workflow-run/executor/types.js';

import { WorkflowRunStateWriter } from './workflow-run-state-writer.js';
import { ProcessGroupRegistry } from '#shared/process-group-registry.js';

type ProvisionedWorkflowRun = {
  cwd: string;
  artifactsDirPath: string;
  workflow: Workflow;
  workflowRun: WorkflowRun;
  workflowRunNodes: WorkflowRunNode[];
  maxConcurrentNodes: number;
};

export class WorkflowRunLauncher {
  private readonly _workflowRunRepository: WorkflowRunRepository;
  private readonly _workflowRunStateWriter: WorkflowRunStateWriter;
  private readonly _onCancelling: () => void;

  constructor(database: Kysely<Database>, onCancelling: () => void) {
    this._workflowRunRepository = new WorkflowRunRepository(database);
    this._workflowRunStateWriter = new WorkflowRunStateWriter(database);
    this._onCancelling = onCancelling;
  }

  spawnWorker(workflowRunId: string): number {
    const entryPath = process.argv[1];
    if (entryPath === undefined) {
      throw new WorkflowRunError('Failed to resolve the CLI entry point for the worker.');
    }

    const child = spawn(
      process.execPath,
      [...process.execArgv, entryPath, 'workflow', '__worker', workflowRunId],
      {
        detached: true,
        stdio: 'ignore',
      },
    );
    child.unref();

    const workerPid = child.pid;
    if (workerPid === undefined) {
      throw new WorkflowRunError('Failed to start the workflow run worker.');
    }
    return workerPid;
  }

  async attach(
    provisioned: ProvisionedWorkflowRun,
    workflowRunRecorder: WorkflowRunRecorder,
  ): Promise<WorkflowExecutionResult> {
    const killNodesAndExit = (): void => {
      ProcessGroupRegistry.killAll();
      process.exit(130);
    };

    const requestCancellation = (): void => {
      void this._workflowRunRepository.update(
        { id: provisioned.workflowRun.id, status: { in: ['pending', 'running'] } },
        { status: 'cancelled' },
      );
      this._onCancelling();
      process.once('SIGINT', killNodesAndExit);
      process.once('SIGTERM', killNodesAndExit);
    };
    process.once('SIGINT', requestCancellation);
    process.once('SIGTERM', requestCancellation);

    const workflowRunExecutor = new WorkflowRunExecutor(
      this._workflowRunStateWriter,
      workflowRunRecorder,
      () => this.checkRunState(provisioned.workflowRun.id),
    );

    try {
      const executionResult = await workflowRunExecutor.execute(provisioned);
      return executionResult;
    } finally {
      process.off('SIGINT', requestCancellation);
      process.off('SIGTERM', requestCancellation);
      process.off('SIGINT', killNodesAndExit);
      process.off('SIGTERM', killNodesAndExit);
    }
  }

  private async checkRunState(workflowRunId: string): Promise<WorkflowRunExecutionState> {
    const workflowRun = await this._workflowRunRepository.findById(workflowRunId);
    if (!workflowRun) {
      return 'deleted';
    }

    if (workflowRun.status === 'cancelled') {
      return 'cancelled';
    }

    return 'running';
  }
}
