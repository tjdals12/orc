import {
  WorkflowRunEventRepository,
  WorkflowRunNodeRepository,
  WorkflowRunRepository,
  type WorkflowRun,
  type WorkflowRunEvent,
  type WorkflowRunNode,
} from '#workflow-run/repository.js';
import type { Kysely } from 'kysely';

import type { Database } from '#database/schema.js';
import {
  ExecutionEnvironmentRepository,
  type ExecutionEnvironment,
} from '#execution-environment/repository.js';
import { WorkflowRunError } from '#workflow-run/error.js';
import { resolveWorkflowRunLiveness } from '#workflow-run/liveness.js';

export type WorkflowStatusResult = {
  run: WorkflowRun;
  runIsDead: boolean;
  environment: ExecutionEnvironment | null;
  nodes: WorkflowRunNode[];
  events: WorkflowRunEvent[];
};

export class WorkflowStatusHandler {
  private readonly _workflowRunRepository: WorkflowRunRepository;
  private readonly _workflowRunNodeRepository: WorkflowRunNodeRepository;
  private readonly _workflowRunEventRepository: WorkflowRunEventRepository;
  private readonly _executionEnvironmentRepository: ExecutionEnvironmentRepository;

  constructor(database: Kysely<Database>) {
    this._workflowRunRepository = new WorkflowRunRepository(database);
    this._workflowRunNodeRepository = new WorkflowRunNodeRepository(database);
    this._workflowRunEventRepository = new WorkflowRunEventRepository(database);
    this._executionEnvironmentRepository = new ExecutionEnvironmentRepository(database);
  }

  async execute(args: { workflowRunId: string }): Promise<WorkflowStatusResult> {
    const workflowRun = await this._workflowRunRepository.findById(args.workflowRunId);
    if (!workflowRun) {
      throw new WorkflowRunError(`No workflow run "${args.workflowRunId}".`);
    }

    const workflowRunNodes = await this._workflowRunNodeRepository.findManyByWorkflowRunId(
      args.workflowRunId,
    );

    const workflowRunEvents = await this._workflowRunEventRepository.findManyByWorkflowRunId(
      args.workflowRunId,
    );

    let environment: ExecutionEnvironment | null = null;
    if (workflowRun.execution_environment_id !== null) {
      environment = await this._executionEnvironmentRepository.findById(
        workflowRun.execution_environment_id,
      );
    }

    const liveness = resolveWorkflowRunLiveness(workflowRun);
    const runIsDead = liveness === 'dead';

    const result: WorkflowStatusResult = {
      run: workflowRun,
      runIsDead,
      environment,
      nodes: workflowRunNodes,
      events: workflowRunEvents,
    };
    return result;
  }

  toJson(result: WorkflowStatusResult) {
    const events = result.events.map((workflowRunEvent) => ({
      ...workflowRunEvent,
      data: workflowRunEvent.data === null ? null : (JSON.parse(workflowRunEvent.data) as unknown),
    }));

    const document = {
      run: result.run,
      environment: result.environment,
      nodes: result.nodes,
      events,
    };
    return document;
  }
}
