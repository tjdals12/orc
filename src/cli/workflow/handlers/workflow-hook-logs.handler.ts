import type { Kysely } from 'kysely';

import type { Database } from '#database/schema.js';
import { ExecutionEnvironmentRepository } from '#execution-environment/repository.js';
import {
  WorkflowRunEventRepository,
  WorkflowRunHookLogRepository,
  WorkflowRunRepository,
  type WorkflowRunHookLog,
} from '#workflow-run/repository.js';
import { WorkflowRunError } from '#workflow-run/error.js';
import { parseHookStartedEventData } from '#workflow-run/events.js';

export type WorkflowHookLogsResult = {
  workflowId: string;
  workflowRunId: string;
  hookLogs: WorkflowRunHookLog[];
  ranInPlace: boolean;
};

export class WorkflowHookLogsHandler {
  private readonly _workflowRunRepository: WorkflowRunRepository;
  private readonly _workflowRunEventRepository: WorkflowRunEventRepository;
  private readonly _workflowRunHookLogRepository: WorkflowRunHookLogRepository;
  private readonly _executionEnvironmentRepository: ExecutionEnvironmentRepository;

  constructor(database: Kysely<Database>) {
    this._workflowRunRepository = new WorkflowRunRepository(database);
    this._workflowRunEventRepository = new WorkflowRunEventRepository(database);
    this._workflowRunHookLogRepository = new WorkflowRunHookLogRepository(database);
    this._executionEnvironmentRepository = new ExecutionEnvironmentRepository(database);
  }

  async execute(args: {
    workflowRunId: string;
    file: string | null;
  }): Promise<WorkflowHookLogsResult> {
    const workflowRun = await this._workflowRunRepository.findById(args.workflowRunId);
    if (!workflowRun) {
      throw new WorkflowRunError(`No workflow run "${args.workflowRunId}".`);
    }

    if (args.file !== null) {
      const workflowRunEvents = await this._workflowRunEventRepository.findManyByWorkflowRunId(
        args.workflowRunId,
      );
      const hookStartedFiles = workflowRunEvents
        .filter((workflowRunEvent) => workflowRunEvent.type === 'hook_started')
        .map((workflowRunEvent) => parseHookStartedEventData(workflowRunEvent.data).file);
      const hookExists = hookStartedFiles.includes(args.file);
      if (!hookExists) {
        throw new WorkflowRunError(
          `No hook "${args.file}" in workflow run "${args.workflowRunId}".`,
        );
      }
    }

    const criteria = args.file === null ? {} : { file: args.file };
    const workflowRunHookLogs = await this._workflowRunHookLogRepository.findManyByWorkflowRunId(
      args.workflowRunId,
      criteria,
    );

    let ranInPlace = false;
    const environmentId = workflowRun.execution_environment_id;
    if (workflowRunHookLogs.length === 0 && args.file === null && environmentId !== null) {
      const executionEnvironment =
        await this._executionEnvironmentRepository.findById(environmentId);
      ranInPlace = executionEnvironment !== null && executionEnvironment.kind === 'in-place';
    }

    const result: WorkflowHookLogsResult = {
      workflowId: workflowRun.workflow_id,
      workflowRunId: workflowRun.id,
      hookLogs: workflowRunHookLogs,
      ranInPlace,
    };
    return result;
  }

  toJson(result: WorkflowHookLogsResult) {
    const hookLogs = result.hookLogs.map((workflowRunHookLog) => ({
      ...workflowRunHookLog,
      data: JSON.parse(workflowRunHookLog.data) as unknown,
    }));
    return hookLogs;
  }
}
