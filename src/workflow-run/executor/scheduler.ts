import { collectDependencyGraph } from '#workflow/graph.js';
import type { WorkflowNode } from '#workflow/node/workflow-node.js';

import type { WorkflowRunNode } from '../repository.js';
import type { FinishedNode } from './types.js';

export class WorkflowRunScheduler {
  private readonly _runningSlots = new Map<string, Promise<FinishedNode>>();
  private _launchingStopped = false;

  private readonly _dependentsByNodeId: Map<string, string[]>;
  private readonly _dependencyCountByNodeId: Map<string, number>;
  private readonly _maxConcurrentNodes: number;
  private readonly _runNode: (nodeId: string) => Promise<FinishedNode>;
  private readonly _readyNodeIds: string[];

  constructor(
    dependentsByNodeId: Map<string, string[]>,
    dependencyCountByNodeId: Map<string, number>,
    maxConcurrentNodes: number,
    runNode: (nodeId: string) => Promise<FinishedNode>,
    readyNodeIds: string[],
  ) {
    this._dependentsByNodeId = dependentsByNodeId;
    this._dependencyCountByNodeId = dependencyCountByNodeId;
    this._maxConcurrentNodes = maxConcurrentNodes;
    this._runNode = runNode;
    this._readyNodeIds = readyNodeIds;
  }

  static forRun(args: {
    workflowNodes: WorkflowNode[];
    workflowRunNodes: WorkflowRunNode[];
    maxConcurrentNodes: number;
    runNode: (nodeId: string) => Promise<FinishedNode>;
  }): WorkflowRunScheduler {
    const { workflowNodes, workflowRunNodes, maxConcurrentNodes, runNode } = args;

    const { dependentsByNodeId, dependencyCountByNodeId } = collectDependencyGraph(workflowNodes);

    const succeededNodes = workflowRunNodes.filter(
      (workflowRunNode) => workflowRunNode.status === 'succeeded',
    );
    for (const succeededNode of succeededNodes) {
      const dependentIds = dependentsByNodeId.get(succeededNode.node_id) ?? [];
      for (const dependentId of dependentIds) {
        const currentCount = dependencyCountByNodeId.get(dependentId) ?? 0;
        dependencyCountByNodeId.set(dependentId, currentCount - 1);
      }
    }

    const readyNodeIds: string[] = [];
    for (const workflowRunNode of workflowRunNodes) {
      if (workflowRunNode.status !== 'pending' && workflowRunNode.status !== 'rejected') continue;

      const dependencyCount = dependencyCountByNodeId.get(workflowRunNode.node_id) ?? 0;
      if (dependencyCount !== 0) continue;

      readyNodeIds.push(workflowRunNode.node_id);
    }

    const runScheduler = new WorkflowRunScheduler(
      dependentsByNodeId,
      dependencyCountByNodeId,
      maxConcurrentNodes,
      runNode,
      readyNodeIds,
    );
    return runScheduler;
  }

  launchReadyNodes(): void {
    while (!this._launchingStopped && this._runningSlots.size < this._maxConcurrentNodes) {
      const nodeId = this._readyNodeIds.shift();
      if (!nodeId) break;
      this._runningSlots.set(nodeId, this._runNode(nodeId));
    }
  }

  hasRunningNodes(): boolean {
    const hasRunningNodes = this._runningSlots.size > 0;
    return hasRunningNodes;
  }

  async takeFinishedNode(): Promise<FinishedNode> {
    if (this._runningSlots.size === 0) {
      throw new Error('The run scheduler has no running node to take.');
    }

    const runningNodes = this._runningSlots.values();
    const finishedNode = await Promise.race(runningNodes);

    this._runningSlots.delete(finishedNode.nodeId);

    return finishedNode;
  }

  scheduleAfter(nodeId: string): void {
    const dependentIds = this._dependentsByNodeId.get(nodeId) ?? [];
    for (const dependentId of dependentIds) {
      const currentCount = this._dependencyCountByNodeId.get(dependentId) ?? 0;
      const remainingCount = currentCount - 1;
      this._dependencyCountByNodeId.set(dependentId, remainingCount);
      if (remainingCount === 0) {
        this._readyNodeIds.push(dependentId);
      }
    }
  }

  stopLaunching(): void {
    this._launchingStopped = true;
  }
}
