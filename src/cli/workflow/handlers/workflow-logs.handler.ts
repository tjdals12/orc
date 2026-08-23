import type { Kysely } from 'kysely';

import type { Database } from '#database/schema.js';
import {
  WorkflowRunNodeLogRepository,
  WorkflowRunNodeRepository,
  WorkflowRunRepository,
  type WorkflowRunNodeLog,
} from '#workflow-run/repository.js';
import { WorkflowRunError } from '#workflow-run/error.js';

export type WorkflowLogsResult = {
  workflowId: string;
  workflowRunId: string;
  logs: WorkflowRunNodeLog[];
};

export class WorkflowLogsHandler {
  private readonly _workflowRunRepository: WorkflowRunRepository;
  private readonly _workflowRunNodeRepository: WorkflowRunNodeRepository;
  private readonly _workflowRunNodeLogRepository: WorkflowRunNodeLogRepository;

  constructor(database: Kysely<Database>) {
    this._workflowRunRepository = new WorkflowRunRepository(database);
    this._workflowRunNodeRepository = new WorkflowRunNodeRepository(database);
    this._workflowRunNodeLogRepository = new WorkflowRunNodeLogRepository(database);
  }

  async execute(args: {
    workflowRunId: string;
    nodeId: string | null;
  }): Promise<WorkflowLogsResult> {
    const workflowRun = await this._workflowRunRepository.findById(args.workflowRunId);
    if (!workflowRun) {
      throw new WorkflowRunError(`No workflow run "${args.workflowRunId}".`);
    }

    if (args.nodeId !== null) {
      const workflowRunNodes = await this._workflowRunNodeRepository.findManyByWorkflowRunId(
        args.workflowRunId,
      );
      const nodeExists = workflowRunNodes.some(
        (workflowRunNode) => workflowRunNode.node_id === args.nodeId,
      );
      if (!nodeExists) {
        throw new WorkflowRunError(
          `No node "${args.nodeId}" in workflow run "${args.workflowRunId}".`,
        );
      }
    }

    const criteria = args.nodeId === null ? {} : { nodeId: args.nodeId };
    const workflowRunNodeLogs = await this._workflowRunNodeLogRepository.findManyByWorkflowRunId(
      args.workflowRunId,
      criteria,
    );

    const result: WorkflowLogsResult = {
      workflowId: workflowRun.workflow_id,
      workflowRunId: workflowRun.id,
      logs: workflowRunNodeLogs,
    };
    return result;
  }

  toJson(result: WorkflowLogsResult) {
    const logs = result.logs.map((workflowRunNodeLog) => ({
      ...workflowRunNodeLog,
      data: JSON.parse(workflowRunNodeLog.data) as unknown,
    }));
    return logs;
  }
}
