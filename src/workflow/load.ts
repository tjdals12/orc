import { parse as parseYaml } from 'yaml';

import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import { WorkflowSchema, type WorkflowFile } from './schema.js';
import { Workflow } from './workflow.js';
import { InvalidWorkflowError, NotFoundWorkflowError, WorkflowError } from './error.js';
import { collectAncestorSetsByNodeId, collectDependencyGraph } from './graph.js';
import { tokenizeText } from './node/text-token.js';

type BrokenWorkflow = {
  file: string;
  message: string;
};

type WorkflowScan = {
  workflows: WorkflowFile[];
  brokenWorkflows: BrokenWorkflow[];
};

function buildInvalidWorkflowError(filePath: string, findings: string[]): InvalidWorkflowError {
  const message = `Invalid workflow at ${filePath}.\n${findings.join('\n')}`;
  const invalidWorkflowError = new InvalidWorkflowError(message, findings);
  return invalidWorkflowError;
}

function formatIssuePath(issuePath: PropertyKey[]): string {
  let formatted = '';
  for (const segment of issuePath) {
    if (typeof segment === 'number') {
      formatted += `[${segment}]`;
    } else {
      formatted += formatted.length === 0 ? String(segment) : `.${String(segment)}`;
    }
  }
  return formatted;
}

type TextScan = {
  artifactNames: string[];
  referencesInput: boolean;
  referencesReason: boolean;
  unclosedArtifactReference: boolean;
};

function scanText(text: string): TextScan {
  const { tokens, unclosedArtifactReference } = tokenizeText(text);

  const artifactNames: string[] = [];
  let referencesInput = false;
  let referencesReason = false;
  for (const token of tokens) {
    if (token.kind === 'input') {
      referencesInput = true;
    }
    if (token.kind === 'reason') {
      referencesReason = true;
    }
    if (token.kind === 'artifact' && !artifactNames.includes(token.name)) {
      artifactNames.push(token.name);
    }
  }

  return { artifactNames, referencesInput, referencesReason, unclosedArtifactReference };
}

function collectWorkflowFindings(workflow: Workflow, fileName: string): string[] {
  const findings: string[] = [];

  if (workflow.id !== fileName) {
    findings.push(`id "${workflow.id}" does not match the file name "${fileName}"`);
  }

  for (const node of workflow.nodes) {
    const text = node.readText();

    const nodeScan = scanText(text);

    if (nodeScan.referencesInput && workflow.input === null) {
      findings.push(`node "${node.id}" references $INPUT but the workflow declares no input`);
    }

    if (nodeScan.referencesReason) {
      findings.push(
        `node "${node.id}" references $REASON which is only available in an on_reject prompt`,
      );
    }

    if (node.type === 'agent') {
      if (nodeScan.unclosedArtifactReference) {
        findings.push(`node "${node.id}" has an unclosed $ARTIFACT( reference`);
      }

      const consumedNames = node.consumes;
      const artifactNames = nodeScan.artifactNames;
      for (const artifactName of artifactNames) {
        if (!consumedNames.includes(artifactName)) {
          findings.push(
            `node "${node.id}" references artifact "${artifactName}" which it does not consume`,
          );
        }
      }
    }

    if (node.type === 'approval') {
      if (nodeScan.unclosedArtifactReference) {
        findings.push(`node "${node.id}" has an unclosed $ARTIFACT( reference`);
      }

      const consumedNames = node.consumes;
      const artifactNames = nodeScan.artifactNames;
      for (const artifactName of artifactNames) {
        if (!consumedNames.includes(artifactName)) {
          findings.push(
            `node "${node.id}" references artifact "${artifactName}" which it does not consume`,
          );
        }
      }

      if (node.onReject !== null) {
        const onReject = node.onReject;
        const onRejectText = onReject.type === 'agent' ? onReject.prompt : onReject.script;
        const onRejectScan = scanText(onRejectText);

        if (onRejectScan.referencesInput && workflow.input === null) {
          findings.push(
            `node "${node.id}" on_reject references $INPUT but the workflow declares no input`,
          );
        }

        if (onReject.type === 'agent') {
          if (onRejectScan.unclosedArtifactReference) {
            findings.push(`node "${node.id}" on_reject has an unclosed $ARTIFACT( reference`);
          }

          const consumedNames = node.consumes;
          const artifactNames = onRejectScan.artifactNames;
          for (const artifactName of artifactNames) {
            if (!consumedNames.includes(artifactName)) {
              findings.push(
                `node "${node.id}" on_reject references artifact "${artifactName}" which the node does not consume`,
              );
            }
          }
        }

        if (onReject.type === 'bash' && onRejectScan.referencesReason) {
          findings.push(
            `node "${node.id}" on_reject script references $REASON but a bash on_reject receives no reason`,
          );
        }
      }
    }
  }

  const nodeIds = workflow.listNodeIds();
  const nodeIdSet = new Set(nodeIds);
  const dependencyFindings: string[] = [];
  for (const node of workflow.nodes) {
    const dependsOn = node.dependsOn;

    const unknownDependencyIds = dependsOn.filter((dependencyId) => !nodeIdSet.has(dependencyId));
    if (unknownDependencyIds.length > 0) {
      dependencyFindings.push(
        `node "${node.id}" depends on unknown node ids: ${unknownDependencyIds.join(', ')}`,
      );
    }

    if (dependsOn.includes(node.id)) {
      dependencyFindings.push(`node "${node.id}" depends on itself`);
    }

    const duplicatedDependencyIds = dependsOn.filter(
      (dependencyId, index) => dependsOn.indexOf(dependencyId) !== index,
    );
    if (duplicatedDependencyIds.length > 0) {
      const listed = [...new Set(duplicatedDependencyIds)].join(', ');
      dependencyFindings.push(`node "${node.id}" repeats depends_on entries: ${listed}`);
    }
  }
  findings.push(...dependencyFindings);

  // The cycle walk is meaningful only when every depends_on reference is sound.
  let dependencyOrderIsSound = dependencyFindings.length === 0;
  if (dependencyOrderIsSound) {
    const { rootNodeIds, dependencyCountByNodeId, dependentsByNodeId } = collectDependencyGraph(
      workflow.nodes,
    );
    const visitingStack = [...rootNodeIds];
    const visitedNodeIds = new Set<string>();
    while (visitingStack.length > 0) {
      const nodeId = visitingStack.pop();
      if (nodeId === undefined) break;
      visitedNodeIds.add(nodeId);
      const dependentIds = dependentsByNodeId.get(nodeId) ?? [];
      for (const dependentId of dependentIds) {
        const currentCount = dependencyCountByNodeId.get(dependentId) ?? 0;
        const remainingCount = currentCount - 1;
        dependencyCountByNodeId.set(dependentId, remainingCount);
        if (remainingCount === 0) visitingStack.push(dependentId);
      }
    }
    if (visitedNodeIds.size < workflow.nodes.length) {
      const cyclicNodeIds = nodeIds.filter((nodeId) => !visitedNodeIds.has(nodeId));
      findings.push(`depends_on cycle involving: ${cyclicNodeIds.join(', ')}`);
      dependencyOrderIsSound = false;
    }
  }

  const producerNodeIdByArtifactName = new Map<string, string>();
  for (const node of workflow.nodes) {
    const produces = node.produces;
    const consumes = node.consumes;

    const duplicatedProducesEntries = produces.filter(
      (name, index) => produces.indexOf(name) !== index,
    );
    if (duplicatedProducesEntries.length > 0) {
      const listed = [...new Set(duplicatedProducesEntries)].join(', ');
      findings.push(`node "${node.id}" repeats produces entries: ${listed}`);
    }

    const duplicatedConsumesEntries = consumes.filter(
      (name, index) => consumes.indexOf(name) !== index,
    );
    if (duplicatedConsumesEntries.length > 0) {
      const listed = [...new Set(duplicatedConsumesEntries)].join(', ');
      findings.push(`node "${node.id}" repeats consumes entries: ${listed}`);
    }

    for (const artifactName of produces) {
      const existingProducerNodeId = producerNodeIdByArtifactName.get(artifactName);
      if (existingProducerNodeId !== undefined) {
        findings.push(
          `nodes "${existingProducerNodeId}" and "${node.id}" both produce "${artifactName}"`,
        );
        continue;
      }
      producerNodeIdByArtifactName.set(artifactName, node.id);
    }
  }

  // The ancestor sets assume acyclicity, so this check sits behind the cycle walk.
  const ancestorSetByNodeId = dependencyOrderIsSound
    ? collectAncestorSetsByNodeId(workflow.nodes)
    : null;
  for (const node of workflow.nodes) {
    const consumes = node.consumes;
    for (const artifactName of consumes) {
      const producerNodeId = producerNodeIdByArtifactName.get(artifactName);
      if (producerNodeId === undefined) {
        findings.push(`node "${node.id}" consumes "${artifactName}" which no node produces`);
        continue;
      }
      if (ancestorSetByNodeId === null) continue;
      const ancestorNodeIds = ancestorSetByNodeId.get(node.id) ?? new Set<string>();
      if (!ancestorNodeIds.has(producerNodeId)) {
        findings.push(
          `node "${node.id}" consumes "${artifactName}" but does not depend on its producer "${producerNodeId}"`,
        );
      }
    }
  }

  return findings;
}

function readWorkflow(filePath: string): { file: WorkflowFile; workflow: Workflow } {
  const raw = fs.readFileSync(filePath, 'utf-8');

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (e) {
    const message = e instanceof Error ? e.message : util.inspect(e);
    throw buildInvalidWorkflowError(filePath, [message]);
  }

  const result = WorkflowSchema.safeParse(parsed);
  if (result.error) {
    const findings = result.error.issues.map((issue) => {
      const issuePath = formatIssuePath(issue.path);
      const finding = issuePath.length === 0 ? issue.message : `${issuePath}: ${issue.message}`;
      return finding;
    });
    throw buildInvalidWorkflowError(filePath, findings);
  }

  const workflow = Workflow.fromFile(filePath, result.data);

  const nodeIds = workflow.listNodeIds();
  const duplicatedNodeIds = nodeIds.filter((nodeId, index) => nodeIds.indexOf(nodeId) !== index);
  if (duplicatedNodeIds.length > 0) {
    const listed = [...new Set(duplicatedNodeIds)].join(', ');
    throw buildInvalidWorkflowError(filePath, [`duplicate node ids: ${listed}`]);
  }

  const findings = collectWorkflowFindings(workflow, path.basename(filePath, '.yml'));
  if (findings.length > 0) {
    throw buildInvalidWorkflowError(filePath, findings);
  }

  const read = { file: result.data, workflow };
  return read;
}

export function loadWorkflowOrThrow(workflowPath: string): Workflow {
  const workflowExists = fs.existsSync(workflowPath);
  if (!workflowExists) {
    const id = path.basename(workflowPath, '.yml');
    throw new NotFoundWorkflowError(`No workflow "${id}" at ${workflowPath}.`);
  }

  const { workflow } = readWorkflow(workflowPath);
  return workflow;
}

export function loadWorkflows(workflowsDirPath: string): WorkflowScan {
  const exists = fs.existsSync(workflowsDirPath);
  if (!exists) {
    return {
      workflows: [],
      brokenWorkflows: [],
    };
  }

  const fileNames = fs
    .readdirSync(workflowsDirPath)
    .filter((fileName) => fileName.endsWith('.yml'))
    .sort();

  const workflows: WorkflowFile[] = [];
  const brokenWorkflows: BrokenWorkflow[] = [];

  for (const fileName of fileNames) {
    const filePath = path.join(workflowsDirPath, fileName);
    try {
      const { file } = readWorkflow(filePath);
      workflows.push(file);
    } catch (e) {
      if (e instanceof WorkflowError) {
        brokenWorkflows.push({ file: fileName, message: e.message });
      } else {
        throw e;
      }
    }
  }

  return { workflows, brokenWorkflows };
}

export function countWorkflowFiles(workflowsDirPath: string): number {
  const exists = fs.existsSync(workflowsDirPath);
  if (!exists) {
    return 0;
  }

  const fileNames = fs
    .readdirSync(workflowsDirPath)
    .filter((fileName) => fileName.endsWith('.yml'));
  const workflowFileCount = fileNames.length;
  return workflowFileCount;
}
