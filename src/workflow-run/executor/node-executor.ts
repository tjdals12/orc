import util from 'node:util';

import type { AgentNode } from '#workflow/node/agent-node.js';
import type { BashNode } from '#workflow/node/bash-node.js';
import type { WorkflowNode } from '#workflow/node/workflow-node.js';

import { runAgentNode, runAgentOnReject } from '../agent-node/runner.js';
import { runBashNode } from '../bash-node-runner.js';
import type { WorkflowRunRecorder } from '../recorder.js';
import type { WorkflowRunNode } from '../repository.js';
import type { ApprovalNodeRunResult, NodeRunResult } from '../types.js';
import type { FinishedNode, WorkflowRunNodeStateWriter } from './types.js';
import type { ApprovalNode } from '#workflow/node/approval-node.js';
import {
  collectArtifactNames,
  findMissingArtifacts,
  readArtifactText,
  renderText,
} from '#workflow-run/artifacts.js';

export class WorkflowRunNodeExecutor {
  private readonly _workflowRunStateWriter: WorkflowRunNodeStateWriter;
  private readonly _workflowRunRecorder: WorkflowRunRecorder;
  private readonly _cwd: string;
  private readonly _artifactsDirPath: string;
  private readonly _input: string;
  private readonly _signal: AbortSignal;

  constructor(args: {
    workflowRunStateWriter: WorkflowRunNodeStateWriter;
    workflowRunRecorder: WorkflowRunRecorder;
    cwd: string;
    artifactsDirPath: string;
    input: string;
    signal: AbortSignal;
  }) {
    this._workflowRunStateWriter = args.workflowRunStateWriter;
    this._workflowRunRecorder = args.workflowRunRecorder;
    this._cwd = args.cwd;
    this._artifactsDirPath = args.artifactsDirPath;
    this._input = args.input;
    this._signal = args.signal;
  }

  async execute(
    workflowNode: WorkflowNode,
    workflowRunNode: WorkflowRunNode,
  ): Promise<FinishedNode> {
    await this.startNode(workflowRunNode);

    const missingConsumedArtifacts = findMissingArtifacts(
      this._artifactsDirPath,
      workflowNode.consumes,
    );
    if (missingConsumedArtifacts.length > 0) {
      const reason = `Artifacts not available: ${missingConsumedArtifacts.join(', ')}`;
      await this.failNode(workflowRunNode, reason);

      const finishedNode: FinishedNode = {
        outcome: 'failed',
        nodeId: workflowRunNode.node_id,
        reason,
      };
      return finishedNode;
    }

    if (workflowNode.type === 'approval') {
      if (workflowRunNode.status === 'rejected') {
        const onRejectRunResult = await this.executeOnReject(workflowNode, workflowRunNode);
        if (onRejectRunResult.outcome === 'failed') {
          await this.failNode(workflowRunNode, onRejectRunResult.reason);

          const finishedNode: FinishedNode = {
            outcome: 'failed',
            nodeId: workflowRunNode.node_id,
            reason: onRejectRunResult.reason,
          };
          return finishedNode;
        }
      }

      const approvalNodeRunResult = this.executeApprovalNode(workflowNode);
      if (approvalNodeRunResult.outcome === 'failed') {
        await this.failNode(workflowRunNode, approvalNodeRunResult.reason);

        const finishedNode: FinishedNode = {
          outcome: 'failed',
          nodeId: workflowRunNode.node_id,
          reason: approvalNodeRunResult.reason,
        };
        return finishedNode;
      }

      await this.requestDecision(workflowRunNode, approvalNodeRunResult.message);

      const finishedNode: FinishedNode = {
        outcome: 'awaiting-decision',
        nodeId: workflowRunNode.node_id,
        message: approvalNodeRunResult.message,
      };
      return finishedNode;
    }

    const nodeRunResult = await this.executeWorkflowNode(workflowNode);

    if (nodeRunResult.outcome === 'failed') {
      await this.failNode(workflowRunNode, nodeRunResult.reason);

      const finishedNode: FinishedNode = {
        outcome: 'failed',
        nodeId: workflowRunNode.node_id,
        reason: nodeRunResult.reason,
      };
      return finishedNode;
    }

    const missingProducedArtifacts = findMissingArtifacts(
      this._artifactsDirPath,
      workflowNode.produces,
    );
    if (missingProducedArtifacts.length > 0) {
      const reason = `Artifacts not produced: ${missingProducedArtifacts.join(', ')}`;
      await this.failNode(workflowRunNode, reason);

      const finishedNode: FinishedNode = {
        outcome: 'failed',
        nodeId: workflowRunNode.node_id,
        reason,
      };
      return finishedNode;
    }

    await this.succeedNode(workflowRunNode);

    const finishedNode: FinishedNode = {
      outcome: 'succeeded',
      nodeId: workflowRunNode.node_id,
    };
    return finishedNode;
  }

  private executeApprovalNode(workflowNode: ApprovalNode): ApprovalNodeRunResult {
    let artifactTextByName: Map<string, string>;
    try {
      artifactTextByName = this.readConsumedArtifactTexts(
        this._artifactsDirPath,
        workflowNode.message,
      );
    } catch (e) {
      const reason = e instanceof Error ? e.message : util.inspect(e);
      const approvalNodeRunResult: ApprovalNodeRunResult = {
        outcome: 'failed',
        reason,
      };
      return approvalNodeRunResult;
    }

    const message = renderText(workflowNode.message, {
      artifactTextByName,
      artifactsDirPath: this._artifactsDirPath,
      input: this._input,
    });

    const approvalNodeRunResult: ApprovalNodeRunResult = {
      outcome: 'succeeded',
      message,
    };
    return approvalNodeRunResult;
  }

  private async executeOnReject(
    workflowNode: ApprovalNode,
    workflowRunNode: WorkflowRunNode,
  ): Promise<NodeRunResult> {
    const onReject = workflowNode.onReject;
    if (onReject === null) {
      throw new Error(`Node "${workflowRunNode.node_id}" was rejected but declares no on_reject.`);
    }

    if (onReject.type === 'bash') {
      const nodeRunResult = await runBashNode(onReject, {
        cwd: this._cwd,
        env: {
          ARTIFACTS_DIR: this._artifactsDirPath,
          INPUT: this._input,
        },
        detached: true,
        signal: this._signal,
        recordOutput: async (stream, text) => {
          await this._workflowRunRecorder.recordLog({
            type: 'bash_output',
            nodeId: workflowRunNode.node_id,
            stream,
            text,
          });
        },
      });
      return nodeRunResult;
    }

    if (onReject.type === 'agent') {
      let artifactTextByName: Map<string, string>;
      try {
        artifactTextByName = this.readConsumedArtifactTexts(
          this._artifactsDirPath,
          onReject.prompt,
        );
      } catch (e) {
        const reason = e instanceof Error ? e.message : util.inspect(e);
        const nodeRunResult: NodeRunResult = {
          outcome: 'failed',
          reason,
        };
        return nodeRunResult;
      }

      const prompt = renderText(onReject.prompt, {
        artifactTextByName,
        artifactsDirPath: this._artifactsDirPath,
        input: this._input,
        reason: workflowRunNode.reason ?? undefined,
      });

      const nodeRunResult = await runAgentOnReject(onReject, {
        prompt,
        cwd: this._cwd,
        abortSignal: this._signal,
        recordOutput: async (output) => {
          await this._workflowRunRecorder.recordLog({
            type: 'agent_output',
            nodeId: workflowRunNode.node_id,
            output,
          });
        },
        recordSession: async (session) => {
          await this._workflowRunRecorder.recordEvent({
            type: 'agent_session_started',
            nodeId: workflowRunNode.node_id,
            session,
          });
        },
      });
      return nodeRunResult;
    }

    onReject satisfies never;
    throw new Error('Unknown on_reject type');
  }

  private async executeWorkflowNode(workflowNode: BashNode | AgentNode): Promise<NodeRunResult> {
    if (workflowNode.type === 'bash') {
      const nodeRunResult = await this.executeBashNode(workflowNode);
      return nodeRunResult;
    }

    if (workflowNode.type === 'agent') {
      const nodeRunResult = await this.executeAgentNode(workflowNode);
      return nodeRunResult;
    }

    workflowNode satisfies never;
    throw new Error('Unknown workflow node type');
  }

  private async executeBashNode(node: BashNode): Promise<NodeRunResult> {
    const nodeRunResult = await runBashNode(node, {
      cwd: this._cwd,
      env: {
        ARTIFACTS_DIR: this._artifactsDirPath,
        INPUT: this._input,
      },
      detached: true,
      signal: this._signal,
      recordOutput: async (stream, text) => {
        await this._workflowRunRecorder.recordLog({
          type: 'bash_output',
          nodeId: node.id,
          stream,
          text,
        });
      },
    });
    return nodeRunResult;
  }

  private async executeAgentNode(node: AgentNode): Promise<NodeRunResult> {
    let artifactTextByName: Map<string, string>;
    try {
      artifactTextByName = this.readConsumedArtifactTexts(this._artifactsDirPath, node.prompt);
    } catch (e) {
      const reason = e instanceof Error ? e.message : util.inspect(e);
      const nodeRunResult: NodeRunResult = {
        outcome: 'failed',
        reason,
      };
      return nodeRunResult;
    }

    const prompt = renderText(node.prompt, {
      artifactTextByName,
      artifactsDirPath: this._artifactsDirPath,
      input: this._input,
    });

    const nodeRunResult = await runAgentNode(node, {
      prompt,
      cwd: this._cwd,
      abortSignal: this._signal,
      bashCheckOptions: {
        cwd: this._cwd,
        env: { ARTIFACTS_DIR: this._artifactsDirPath, INPUT: this._input },
        detached: true,
        signal: this._signal,
        recordOutput: async (stream, text) => {
          await this._workflowRunRecorder.recordLog({
            type: 'bash_output',
            nodeId: node.id,
            stream,
            text,
          });
        },
      },
      recordOutput: async (output) => {
        await this._workflowRunRecorder.recordLog({
          type: 'agent_output',
          nodeId: node.id,
          output,
        });
      },
      recordSession: async (session) => {
        await this._workflowRunRecorder.recordEvent({
          type: 'agent_session_started',
          nodeId: node.id,
          session,
        });
      },
      recordIteration: async (iteration, maxIterations) => {
        await this._workflowRunRecorder.recordEvent({
          type: 'iteration_started',
          nodeId: node.id,
          iteration,
          maxIterations,
        });
      },
      recordIterationCompleted: async (iteration, verdict) => {
        await this._workflowRunRecorder.recordEvent({
          type: 'iteration_completed',
          nodeId: node.id,
          iteration,
          verdict,
        });
      },
    });

    return nodeRunResult;
  }

  private readConsumedArtifactTexts(artifactsDirPath: string, text: string): Map<string, string> {
    const artifactTextByName = new Map<string, string>();
    const artifactNames = collectArtifactNames(text);
    for (const artifactName of artifactNames) {
      const artifactText = readArtifactText(artifactsDirPath, artifactName);
      artifactTextByName.set(artifactName, artifactText);
    }
    return artifactTextByName;
  }

  private async startNode(workflowRunNode: WorkflowRunNode): Promise<void> {
    await this._workflowRunStateWriter.markNodeStarted(workflowRunNode);
    await this._workflowRunRecorder.recordEvent({
      type: 'node_started',
      nodeId: workflowRunNode.node_id,
    });
  }

  private async succeedNode(workflowRunNode: WorkflowRunNode): Promise<void> {
    await this._workflowRunStateWriter.markNodeSucceeded(workflowRunNode);
    await this._workflowRunRecorder.recordEvent({
      type: 'node_succeeded',
      nodeId: workflowRunNode.node_id,
    });
  }

  private async requestDecision(workflowRunNode: WorkflowRunNode, message: string) {
    await this._workflowRunStateWriter.markNodeAwaitingDecision(workflowRunNode, message);
    await this._workflowRunRecorder.recordEvent({
      type: 'decision_requested',
      nodeId: workflowRunNode.node_id,
    });
  }

  private async failNode(workflowRunNode: WorkflowRunNode, reason: string): Promise<void> {
    await this._workflowRunStateWriter.markNodeFailed(workflowRunNode);
    await this._workflowRunRecorder.recordEvent({
      type: 'node_failed',
      nodeId: workflowRunNode.node_id,
      reason,
    });
  }
}
