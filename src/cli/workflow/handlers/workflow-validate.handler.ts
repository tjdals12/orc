import { buildProjectPaths, buildWorkflowPath } from '#shared/path.js';
import { InvalidWorkflowError } from '#workflow/error.js';
import { loadWorkflowOrThrow } from '#workflow/load.js';

export type WorkflowValidateResult =
  | { verdict: 'valid'; workflowId: string; nodeCount: number }
  | { verdict: 'invalid'; workflowId: string; findings: string[] };

export class WorkflowValidateHandler {
  execute(projectPath: string, args: { workflowId: string }): WorkflowValidateResult {
    const { workflowsDirPath } = buildProjectPaths(projectPath);
    const workflowPath = buildWorkflowPath(workflowsDirPath, args.workflowId);

    let result: WorkflowValidateResult;
    try {
      const workflow = loadWorkflowOrThrow(workflowPath);
      result = { verdict: 'valid', workflowId: workflow.id, nodeCount: workflow.nodes.length };
    } catch (e) {
      if (!(e instanceof InvalidWorkflowError)) throw e;
      result = { verdict: 'invalid', workflowId: args.workflowId, findings: e.findings };
    }
    return result;
  }

  toJson(result: WorkflowValidateResult): {
    id: string;
    valid: boolean;
    nodeCount: number | null;
    findings: string[];
  } {
    if (result.verdict === 'valid') {
      const document = {
        id: result.workflowId,
        valid: true,
        nodeCount: result.nodeCount,
        findings: [],
      };
      return document;
    }
    const document = {
      id: result.workflowId,
      valid: false,
      nodeCount: null,
      findings: result.findings,
    };
    return document;
  }
}
