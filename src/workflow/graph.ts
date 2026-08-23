import type { WorkflowNode } from './node/workflow-node.js';

type WorkflowDependencyGraph = {
  rootNodeIds: string[];
  dependencyCountByNodeId: Map<string, number>;
  dependentsByNodeId: Map<string, string[]>;
};

export function collectDependencyGraph(nodes: WorkflowNode[]): WorkflowDependencyGraph {
  const dependencyCountByNodeId = new Map<string, number>();
  const dependentsByNodeId = new Map<string, string[]>();

  for (const node of nodes) {
    const dependsOn = node.dependsOn;
    dependencyCountByNodeId.set(node.id, dependsOn.length);
    for (const dependencyId of dependsOn) {
      const dependents = dependentsByNodeId.get(dependencyId) ?? [];
      dependents.push(node.id);
      dependentsByNodeId.set(dependencyId, dependents);
    }
  }

  const rootNodeIds = nodes.filter((node) => node.dependsOn.length === 0).map((node) => node.id);

  const workflowDependencyGraph: WorkflowDependencyGraph = {
    rootNodeIds,
    dependencyCountByNodeId,
    dependentsByNodeId,
  };
  return workflowDependencyGraph;
}

export function collectAncestorSetsByNodeId(nodes: WorkflowNode[]): Map<string, Set<string>> {
  const dependsOnByNodeId = new Map<string, string[]>();
  for (const node of nodes) {
    dependsOnByNodeId.set(node.id, node.dependsOn);
  }

  const ancestorSetByNodeId = new Map<string, Set<string>>();

  const resolveAncestorSet = (nodeId: string): Set<string> => {
    const memoizedAncestorSet = ancestorSetByNodeId.get(nodeId);
    if (memoizedAncestorSet !== undefined) return memoizedAncestorSet;

    const ancestorSet = new Set<string>();
    const dependencyIds = dependsOnByNodeId.get(nodeId) ?? [];
    for (const dependencyId of dependencyIds) {
      ancestorSet.add(dependencyId);
      const dependencyAncestorSet = resolveAncestorSet(dependencyId);
      for (const ancestorId of dependencyAncestorSet) {
        ancestorSet.add(ancestorId);
      }
    }

    ancestorSetByNodeId.set(nodeId, ancestorSet);
    return ancestorSet;
  };

  for (const node of nodes) {
    resolveAncestorSet(node.id);
  }

  return ancestorSetByNodeId;
}
