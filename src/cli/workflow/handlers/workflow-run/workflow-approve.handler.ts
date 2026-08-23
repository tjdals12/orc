import type { Kysely } from 'kysely';

import type { Database, WorkflowRunNodeStatus } from '#database/schema.js';
import { WorkflowRunNodeRepository, WorkflowRunRepository } from '#workflow-run/repository.js';
import { WorkflowRunError } from '#workflow-run/error.js';

import { WorkflowRunLoader } from './workflow-run-loader.js';
import { findMissingArtifacts } from '#workflow-run/artifacts.js';

export type WorkflowApprovedResult = {
  outcome: 'approved';
  workflowRunId: string;
  nodeId: string;
};

export type WorkflowApproveNoopResult = {
  outcome: 'noop';
  workflowRunId: string;
  nodeId: string;
};

export type WorkflowApproveResult = WorkflowApprovedResult | WorkflowApproveNoopResult;

export class WorkflowApproveHandler {
  private readonly _workflowRunRepository: WorkflowRunRepository;
  private readonly _workflowRunNodeRepository: WorkflowRunNodeRepository;
  private readonly _loader: WorkflowRunLoader;

  constructor(database: Kysely<Database>) {
    this._workflowRunRepository = new WorkflowRunRepository(database);
    this._workflowRunNodeRepository = new WorkflowRunNodeRepository(database);
    this._loader = new WorkflowRunLoader(database);
  }

  async execute(args: { workflowRunId: string; nodeId: string }): Promise<WorkflowApproveResult> {
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

    const { workflow, artifactsDirPath } = this._loader.loadSpec(workflowRun);

    const approvalNode = workflow.findApprovalNode(workflowRunNode.node_id);
    const onReject = approvalNode?.onReject ?? null;

    const openStatuses: WorkflowRunNodeStatus[] =
      onReject === null ? ['awaiting_decision'] : ['awaiting_decision', 'rejected'];

    if (openStatuses.includes(workflowRunNode.status)) {
      if (approvalNode && approvalNode.produces.length > 0) {
        const missingArtifacts = findMissingArtifacts(artifactsDirPath, approvalNode.produces);
        if (missingArtifacts.length > 0) {
          throw new WorkflowRunError(
            `Node "${workflowRunNode.node_id}" in workflow run ${workflowRunNode.workflow_run_id} expects your response in: ${missingArtifacts.join(', ')}. Leave the file(s) in ${artifactsDirPath} and approve again.`,
          );
        }
      }
    }

    const approved = await this._workflowRunNodeRepository.update(
      {
        id: workflowRunNode.id,
        workflowRunId: workflowRunNode.workflow_run_id,
        status: { in: openStatuses },
      },
      {
        status: 'succeeded',
        reason: null,
        finished_at: new Date().toISOString(),
      },
    );
    if (!approved) {
      const currentWorkflowRunNode = await this._workflowRunNodeRepository.findByNodeId(
        workflowRunNode.workflow_run_id,
        workflowRunNode.node_id,
      );
      const targetWorkflowRunNode = currentWorkflowRunNode ?? workflowRunNode;
      if (targetWorkflowRunNode.status === 'succeeded' && targetWorkflowRunNode.message !== null) {
        const result: WorkflowApproveNoopResult = {
          outcome: 'noop',
          workflowRunId: targetWorkflowRunNode.workflow_run_id,
          nodeId: targetWorkflowRunNode.node_id,
        };
        return result;
      }
      if (targetWorkflowRunNode.status === 'rejected') {
        throw new WorkflowRunError(
          `Node "${targetWorkflowRunNode.node_id}" in workflow run ${targetWorkflowRunNode.workflow_run_id} was already rejected.`,
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
      type: 'decision_approved',
      nodeId: workflowRunNode.node_id,
    });

    const result: WorkflowApprovedResult = {
      outcome: 'approved',
      workflowRunId: workflowRunNode.workflow_run_id,
      nodeId: workflowRunNode.node_id,
    };
    return result;
  }

  toJson(result: WorkflowApproveResult) {
    const document = {
      outcome: result.outcome,
      workflow_run_id: result.workflowRunId,
      node_id: result.nodeId,
    };
    return document;
  }
}
