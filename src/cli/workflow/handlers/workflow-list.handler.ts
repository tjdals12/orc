import { buildProjectPaths } from '#shared/path.js';
import { loadWorkflows } from '#workflow/load.js';
import type { WorkflowFile } from '#workflow/schema.js';

export type WorkflowListResult = {
  workflows: WorkflowFile[];
  brokenWorkflows: { file: string; message: string }[];
};

export class WorkflowListHandler {
  execute(projectPath: string): WorkflowListResult {
    const { workflowsDirPath } = buildProjectPaths(projectPath);
    const workflowScan = loadWorkflows(workflowsDirPath);

    const result: WorkflowListResult = {
      workflows: workflowScan.workflows,
      brokenWorkflows: workflowScan.brokenWorkflows,
    };
    return result;
  }
}
