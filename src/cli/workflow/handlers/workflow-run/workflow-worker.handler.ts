import util from 'node:util';

import type { Kysely } from 'kysely';

import type { Database } from '#database/schema.js';
import {
  WorkflowRunNodeRepository,
  WorkflowRunRepository,
  type WorkflowRun,
} from '#workflow-run/repository.js';
import { WorkflowRunError } from '#workflow-run/error.js';
import type { WorkflowRunRecorder } from '#workflow-run/recorder.js';
import { WorkflowRunExecutor } from '#workflow-run/executor/run-executor.js';
import type { WorkflowRunExecutionState } from '#workflow-run/executor/types.js';
import {
  ExecutionEnvironmentRepository,
  type ExecutionEnvironment,
} from '#execution-environment/repository.js';

import { WorkflowRunLoader } from './workflow-run-loader.js';
import { WorkflowRunStateWriter } from './workflow-run-state-writer.js';

export class WorkflowWorkerHandler {
  private readonly _workflowRunRepository: WorkflowRunRepository;
  private readonly _workflowRunNodeRepository: WorkflowRunNodeRepository;
  private readonly _executionEnvironmentRepository: ExecutionEnvironmentRepository;
  private readonly _workflowRunStateWriter: WorkflowRunStateWriter;
  private readonly _loader: WorkflowRunLoader;

  constructor(database: Kysely<Database>) {
    this._workflowRunRepository = new WorkflowRunRepository(database);
    this._workflowRunNodeRepository = new WorkflowRunNodeRepository(database);
    this._workflowRunStateWriter = new WorkflowRunStateWriter(database);
    this._executionEnvironmentRepository = new ExecutionEnvironmentRepository(database);
    this._loader = new WorkflowRunLoader(database);
  }

  async execute(args: { workflowRunId: string }): Promise<void> {
    const workflowRun = await this._workflowRunRepository.findById(args.workflowRunId);
    if (!workflowRun) {
      throw new WorkflowRunError(`No workflow run "${args.workflowRunId}".`);
    }

    const workflowRunRecorder = await this._loader.buildRecorder(workflowRun.id, {
      onEvent: () => {},
      onLog: () => {},
      onHookLog: () => {},
    });

    try {
      await this.runPreparedWorkflow(workflowRun, workflowRunRecorder);
    } catch (e) {
      await this.markRunFailed(workflowRun.id, workflowRunRecorder, e);
      throw e;
    }
  }

  private async runPreparedWorkflow(
    workflowRun: WorkflowRun,
    workflowRunRecorder: WorkflowRunRecorder,
  ): Promise<void> {
    const { workflow, mergedConfig, artifactsDirPath } = this._loader.loadSpec(workflowRun);

    const executionEnvironment = await this.findExecutionEnvironmentOrThrow(workflowRun);

    const workflowRunNodes = await this._workflowRunNodeRepository.findManyByWorkflowRunId(
      workflowRun.id,
    );

    const workflowRunExecutor = new WorkflowRunExecutor(
      this._workflowRunStateWriter,
      workflowRunRecorder,
      () => this.checkRunState(workflowRun.id),
    );

    await workflowRunExecutor.execute({
      cwd: executionEnvironment.path,
      artifactsDirPath,
      workflow,
      workflowRun,
      workflowRunNodes,
      maxConcurrentNodes: mergedConfig.run.maxConcurrentNodes,
    });
  }

  private async markRunFailed(
    workflowRunId: string,
    workflowRunRecorder: WorkflowRunRecorder,
    cause: unknown,
  ): Promise<void> {
    const reason = cause instanceof Error ? cause.message : util.inspect(cause);

    await this._workflowRunRepository.updateOrThrow(
      { id: workflowRunId },
      {
        status: 'failed',
        finished_at: new Date().toISOString(),
      },
    );

    await workflowRunRecorder.recordEvent({
      type: 'run_failed',
      reason,
    });
  }

  private async findExecutionEnvironmentOrThrow(
    workflowRun: WorkflowRun,
  ): Promise<ExecutionEnvironment> {
    const executionEnvironmentId = workflowRun.execution_environment_id;
    if (executionEnvironmentId === null) {
      throw new WorkflowRunError(`Workflow run ${workflowRun.id} has no execution environment.`);
    }

    const executionEnvironment =
      await this._executionEnvironmentRepository.findById(executionEnvironmentId);
    if (!executionEnvironment) {
      throw new WorkflowRunError(`No execution environment with id ${executionEnvironmentId}.`);
    }

    return executionEnvironment;
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
