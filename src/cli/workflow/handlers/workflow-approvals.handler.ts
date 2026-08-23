import type { Kysely } from 'kysely';

import type { Database, WorkflowRunNodeStatus } from '#database/schema.js';
import { WorkflowRunNodeRepository, WorkflowRunRepository } from '#workflow-run/repository.js';
import { WorkflowRunError } from '#workflow-run/error.js';

export type WorkflowApprovalEntry = {
  nodeId: string;
  status: WorkflowRunNodeStatus;
  message: string;
  reason: string | null;
};

export type WorkflowApprovalsResult = {
  workflowRunId: string;
  approvals: WorkflowApprovalEntry[];
};

export class WorkflowApprovalsHandler {
  private readonly _workflowRunRepository: WorkflowRunRepository;
  private readonly _workflowRunNodeRepository: WorkflowRunNodeRepository;

  constructor(database: Kysely<Database>) {
    this._workflowRunRepository = new WorkflowRunRepository(database);
    this._workflowRunNodeRepository = new WorkflowRunNodeRepository(database);
  }

  async execute(args: {
    workflowRunId: string;
    nodeId: string | null;
  }): Promise<WorkflowApprovalsResult> {
    const workflowRun = await this._workflowRunRepository.findById(args.workflowRunId);
    if (!workflowRun) {
      throw new WorkflowRunError(`No workflow run "${args.workflowRunId}".`);
    }

    if (args.nodeId !== null) {
      const workflowRunNode = await this._workflowRunNodeRepository.findByNodeId(
        args.workflowRunId,
        args.nodeId,
      );
      if (!workflowRunNode) {
        throw new WorkflowRunError(
          `No node "${args.nodeId}" in workflow run ${args.workflowRunId}.`,
        );
      }
      if (workflowRunNode.message === null) {
        throw new WorkflowRunError(
          `Node "${workflowRunNode.node_id}" in workflow run ${workflowRunNode.workflow_run_id} has no approval request.`,
        );
      }

      const result: WorkflowApprovalsResult = {
        workflowRunId: workflowRunNode.workflow_run_id,
        approvals: [
          {
            nodeId: workflowRunNode.node_id,
            status: workflowRunNode.status,
            message: workflowRunNode.message,
            reason: workflowRunNode.reason,
          },
        ],
      };
      return result;
    }

    const workflowRunNodes = await this._workflowRunNodeRepository.findManyByWorkflowRunId(
      workflowRun.id,
    );

    const approvals: WorkflowApprovalEntry[] = [];
    for (const workflowRunNode of workflowRunNodes) {
      const { node_id: nodeId, status, message, reason } = workflowRunNode;
      if (message === null) {
        continue;
      }
      approvals.push({
        nodeId,
        status,
        message,
        reason,
      });
    }

    const result: WorkflowApprovalsResult = {
      workflowRunId: workflowRun.id,
      approvals,
    };
    return result;
  }

  toJson(result: WorkflowApprovalsResult) {
    const document = {
      workflow_run_id: result.workflowRunId,
      approvals: result.approvals.map(({ nodeId: node_id, status, message, reason }) => ({
        node_id,
        status,
        message,
        reason,
      })),
    };
    return document;
  }
}
