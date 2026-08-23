import type { Workflow } from '#workflow/workflow.js';

import type { WorkflowRunRecorder } from '../recorder.js';
import type { WorkflowRun, WorkflowRunNode } from '../repository.js';

import { WorkflowRunCancellationWatch } from './cancellation-watch.js';
import { WorkflowRunNodeExecutor } from './node-executor.js';
import { WorkflowRunScheduler } from './scheduler.js';
import type {
  FinishedNode,
  PendingApproval,
  WorkflowExecutionResult,
  WorkflowRunExecutionState,
  WorkflowRunNodeStateWriter,
  WorkflowRunStateWriter,
} from './types.js';

export class WorkflowRunExecutor {
  private readonly _workflowRunStateWriter: WorkflowRunStateWriter & WorkflowRunNodeStateWriter;
  private readonly _workflowRunRecorder: WorkflowRunRecorder;
  private readonly _checkWorkflowRunState: () => Promise<WorkflowRunExecutionState>;

  constructor(
    workflowRunStateWriter: WorkflowRunStateWriter & WorkflowRunNodeStateWriter,
    workflowRunRecorder: WorkflowRunRecorder,
    checkWorkflowRunState: () => Promise<WorkflowRunExecutionState>,
  ) {
    this._workflowRunStateWriter = workflowRunStateWriter;
    this._workflowRunRecorder = workflowRunRecorder;
    this._checkWorkflowRunState = checkWorkflowRunState;
  }

  async execute(args: {
    workflow: Workflow;
    workflowRun: WorkflowRun;
    workflowRunNodes: WorkflowRunNode[];
    maxConcurrentNodes: number;
    artifactsDirPath: string;
    cwd: string;
  }): Promise<WorkflowExecutionResult> {
    const { workflow, workflowRun, workflowRunNodes, maxConcurrentNodes, artifactsDirPath, cwd } =
      args;
    const workflowNodes = workflow.nodes;
    const workflowNodeById = new Map(
      workflowNodes.map((workflowNode) => [workflowNode.id, workflowNode]),
    );
    const workflowRunNodeByNodeId = new Map(
      workflowRunNodes.map((workflowRunNode) => [workflowRunNode.node_id, workflowRunNode]),
    );

    const startedMs = Date.now();

    const started = await this.startRun(workflowRun);
    if (!started) {
      await this.cancelRun(workflowRun);
      const workflowExecutionResult: WorkflowExecutionResult = {
        outcome: 'cancelled',
      };
      return workflowExecutionResult;
    }

    let firstFailure: { nodeId: string; reason: string } | null = null;
    let firstUnexpectedError: { error: unknown } | null = null;

    const pendingApprovals: PendingApproval[] = [];
    for (const workflowRunNode of workflowRunNodes) {
      if (workflowRunNode.status === 'awaiting_decision') {
        pendingApprovals.push({
          nodeId: workflowRunNode.node_id,
          message: workflowRunNode.message ?? '',
        });
      }
    }

    const cancellationWatch = new WorkflowRunCancellationWatch(this._checkWorkflowRunState);

    const nodeExecutor = new WorkflowRunNodeExecutor({
      workflowRunStateWriter: this._workflowRunStateWriter,
      workflowRunRecorder: this._workflowRunRecorder,
      cwd,
      artifactsDirPath,
      input: workflowRun.input ?? '',
      signal: cancellationWatch.signal,
    });

    const runNode = async (nodeId: string): Promise<FinishedNode> => {
      try {
        const workflowNode = workflowNodeById.get(nodeId);
        if (!workflowNode) {
          throw new Error(`No workflow node for node ${nodeId}`);
        }

        const workflowRunNode = workflowRunNodeByNodeId.get(nodeId);
        if (!workflowRunNode) {
          throw new Error(`No workflow run node for node ${nodeId}`);
        }

        const finishedNode = await nodeExecutor.execute(workflowNode, workflowRunNode);
        return finishedNode;
      } catch (e) {
        const finishedNode: FinishedNode = { outcome: 'errored', nodeId, error: e };
        return finishedNode;
      }
    };

    const scheduler = WorkflowRunScheduler.forRun({
      workflowNodes,
      workflowRunNodes,
      maxConcurrentNodes,
      runNode,
    });

    cancellationWatch.start();
    try {
      scheduler.launchReadyNodes();

      while (scheduler.hasRunningNodes()) {
        const finishedNode = await scheduler.takeFinishedNode();

        await cancellationWatch.observe();
        if (cancellationWatch.hasStopped()) {
          scheduler.stopLaunching();
        }

        if (finishedNode.outcome === 'succeeded') {
          scheduler.scheduleAfter(finishedNode.nodeId);
        } else if (finishedNode.outcome === 'awaiting-decision') {
          pendingApprovals.push({
            nodeId: finishedNode.nodeId,
            message: finishedNode.message,
          });
        } else if (finishedNode.outcome === 'failed') {
          if (firstFailure === null) {
            firstFailure = { nodeId: finishedNode.nodeId, reason: finishedNode.reason };
          }
          scheduler.stopLaunching();
        } else if (finishedNode.outcome === 'errored') {
          if (firstUnexpectedError === null) {
            firstUnexpectedError = { error: finishedNode.error };
          }
          scheduler.stopLaunching();
        } else {
          finishedNode satisfies never;
        }

        scheduler.launchReadyNodes();
      }
    } finally {
      cancellationWatch.stop();
    }

    const unexpectedError = firstUnexpectedError ?? cancellationWatch.unexpectedError;
    if (unexpectedError !== null) {
      throw unexpectedError.error;
    }

    if (cancellationWatch.isCancelled()) {
      await this.cancelRun(workflowRun);
      const workflowExecutionResult: WorkflowExecutionResult = {
        outcome: 'cancelled',
      };
      return workflowExecutionResult;
    }

    if (firstFailure !== null) {
      const failed = await this.failRun(workflowRun);
      if (!failed) {
        await this.cancelRun(workflowRun);
        const workflowExecutionResult: WorkflowExecutionResult = {
          outcome: 'cancelled',
        };
        return workflowExecutionResult;
      }

      const workflowExecutionResult: WorkflowExecutionResult = {
        outcome: 'failed',
        nodeId: firstFailure.nodeId,
        reason: firstFailure.reason,
      };
      return workflowExecutionResult;
    }

    if (pendingApprovals.length > 0) {
      const paused = await this.pauseRun(workflowRun);
      if (!paused) {
        await this.cancelRun(workflowRun);
        const workflowExecutionResult: WorkflowExecutionResult = {
          outcome: 'cancelled',
        };
        return workflowExecutionResult;
      }

      const workflowExecutionResult: WorkflowExecutionResult = {
        outcome: 'paused',
        approvals: pendingApprovals,
      };
      return workflowExecutionResult;
    }

    const succeeded = await this.succeedRun(workflowRun);
    if (!succeeded) {
      await this.cancelRun(workflowRun);
      const workflowExecutionResult: WorkflowExecutionResult = {
        outcome: 'cancelled',
      };
      return workflowExecutionResult;
    }

    const finishedMs = Date.now();

    const workflowExecutionResult: WorkflowExecutionResult = {
      outcome: 'succeeded',
      nodeCount: workflowNodes.length,
      elapsedSeconds: (finishedMs - startedMs) / 1000,
    };
    return workflowExecutionResult;
  }

  private async startRun(workflowRun: WorkflowRun): Promise<boolean> {
    const started = await this._workflowRunStateWriter.markRunStarted(workflowRun);
    if (started) {
      await this._workflowRunRecorder.recordEvent({ type: 'run_started' });
    }
    return started;
  }

  private async succeedRun(workflowRun: WorkflowRun): Promise<boolean> {
    const succeeded = await this._workflowRunStateWriter.markRunSucceeded(workflowRun.id);
    if (succeeded) {
      await this._workflowRunRecorder.recordEvent({ type: 'run_succeeded' });
    }
    return succeeded;
  }

  private async failRun(workflowRun: WorkflowRun): Promise<boolean> {
    const failed = await this._workflowRunStateWriter.markRunFailed(workflowRun.id);
    if (failed) {
      await this._workflowRunRecorder.recordEvent({ type: 'run_failed', reason: null });
    }
    return failed;
  }

  private async pauseRun(workflowRun: WorkflowRun): Promise<boolean> {
    const paused = await this._workflowRunStateWriter.markRunPaused(workflowRun.id);
    if (paused) {
      await this._workflowRunRecorder.recordEvent({ type: 'run_paused' });
    }
    return paused;
  }

  private async cancelRun(workflowRun: WorkflowRun): Promise<void> {
    await this._workflowRunStateWriter.markRunFinished(workflowRun.id);
    await this._workflowRunRecorder.recordEvent({ type: 'run_cancelled' });
  }
}
