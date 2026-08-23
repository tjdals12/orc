import type { Kysely } from 'kysely';

import type { Database, WorkflowRunNodeStatus } from '#database/schema.js';

import { WorkflowRunNodeRepository, WorkflowRunRepository } from '#workflow-run/repository.js';
import { WorkflowRunError } from '#workflow-run/error.js';

import { WorkflowRunLoader } from './workflow-run-loader.js';

export type WorkflowRejectedResult = {
  outcome: 'rejected';
  workflowRunId: string;
  nodeId: string;
  runCancelled: boolean;
  hasOnReject: boolean;
};

export type WorkflowRejectNoopResult = {
  outcome: 'noop';
  workflowRunId: string;
  nodeId: string;
  hasOnReject: boolean;
};

export type WorkflowRejectResult = WorkflowRejectedResult | WorkflowRejectNoopResult;

export class WorkflowRejectHandler {
  private readonly _workflowRunRepository: WorkflowRunRepository;
  private readonly _workflowRunNodeRepository: WorkflowRunNodeRepository;
  private readonly _loader: WorkflowRunLoader;

  constructor(database: Kysely<Database>) {
    this._workflowRunRepository = new WorkflowRunRepository(database);
    this._workflowRunNodeRepository = new WorkflowRunNodeRepository(database);
    this._loader = new WorkflowRunLoader(database);
  }

  async execute(args: {
    workflowRunId: string;
    nodeId: string;
    reason: string | null;
  }): Promise<WorkflowRejectResult> {
    const workflowRun = await this._workflowRunRepository.findById(args.workflowRunId);
    if (!workflowRun) {
      throw new WorkflowRunError(`No workflow run "${args.workflowRunId}".`);
    }

    const workflowRunNode = await this._workflowRunNodeRepository.findByNodeId(
      args.workflowRunId,
      args.nodeId,
    );
    if (!workflowRunNode) {
      throw new WorkflowRunError(`No node "${args.nodeId}" in workflow run ${args.workflowRunId}.`);
    }

    const { workflow } = this._loader.loadSpec(workflowRun);

    const approvalNode = workflow.findApprovalNode(workflowRunNode.node_id);
    const onReject = approvalNode?.onReject ?? null;
    const hasOnReject = onReject !== null;

    if (hasOnReject && onReject.referencesReason() && !args.reason) {
      throw new WorkflowRunError(
        `Node "${workflowRunNode.node_id}" in workflow run ${workflowRunNode.workflow_run_id} runs an on_reject that references $REASON. Pass --reason <text>.`,
      );
    }

    const openStatuses: WorkflowRunNodeStatus[] = hasOnReject
      ? ['awaiting_decision', 'rejected']
      : ['awaiting_decision'];

    const nodeRejected = await this._workflowRunNodeRepository.update(
      {
        id: workflowRunNode.id,
        workflowRunId: workflowRunNode.workflow_run_id,
        status: { in: openStatuses },
      },
      hasOnReject
        ? {
            status: 'rejected',
            reason: args.reason,
          }
        : {
            status: 'rejected',
            finished_at: new Date().toISOString(),
          },
    );
    if (!nodeRejected) {
      const currentWorkflowRunNode = await this._workflowRunNodeRepository.findByNodeId(
        workflowRunNode.workflow_run_id,
        workflowRunNode.node_id,
      );
      const targetWorkflowRunNode = currentWorkflowRunNode ?? workflowRunNode;
      if (targetWorkflowRunNode.status === 'rejected') {
        const result: WorkflowRejectNoopResult = {
          outcome: 'noop',
          workflowRunId: workflowRunNode.workflow_run_id,
          nodeId: workflowRunNode.node_id,
          hasOnReject,
        };
        return result;
      }
      if (targetWorkflowRunNode.status === 'succeeded' && targetWorkflowRunNode.message !== null) {
        throw new WorkflowRunError(
          `Node "${targetWorkflowRunNode.node_id}" in workflow run ${targetWorkflowRunNode.workflow_run_id} was already approved.`,
        );
      }
      throw new WorkflowRunError(
        `Node "${targetWorkflowRunNode.node_id}" in workflow run ${targetWorkflowRunNode.workflow_run_id} is not awaiting a decision. Check "orc workflow approvals ${targetWorkflowRunNode.workflow_run_id}".`,
      );
    }

    const workflowRunRecorder = await this._loader.buildRecorder(workflowRunNode.workflow_run_id, {
      onEvent: () => {},
      onLog: () => {},
      onHookLog: () => {},
    });
    await workflowRunRecorder.recordEvent({
      type: 'decision_rejected',
      nodeId: workflowRunNode.node_id,
      reason: args.reason,
    });

    let runCancelled = false;
    if (!hasOnReject) {
      runCancelled = await this._workflowRunRepository.update(
        {
          id: workflowRunNode.workflow_run_id,
          status: 'paused',
        },
        {
          status: 'cancelled',
          finished_at: new Date().toISOString(),
        },
      );
      if (runCancelled) {
        await workflowRunRecorder.recordEvent({
          type: 'run_cancelled',
        });
      }
    }

    const result: WorkflowRejectedResult = {
      outcome: 'rejected',
      workflowRunId: workflowRunNode.workflow_run_id,
      nodeId: workflowRunNode.node_id,
      runCancelled,
      hasOnReject,
    };
    return result;
  }

  toJson(result: WorkflowRejectResult) {
    const document = {
      outcome: result.outcome,
      workflow_run_id: result.workflowRunId,
      node_id: result.nodeId,
      has_on_reject: result.hasOnReject,
      run_cancelled: result.outcome === 'rejected' ? result.runCancelled : false,
    };
    return document;
  }
}
