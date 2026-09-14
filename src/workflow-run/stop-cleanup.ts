import { discardGitChanges } from '#shared/git.js';
import type { WorkflowNode } from '#workflow/node/workflow-node.js';

import { discardNodeArtifacts } from './artifacts.js';

export async function cleanupStoppedRun(args: {
  cwd: string;
  artifactsDirPath: string;
  workflowNodes: WorkflowNode[];
  interruptedNodeIds: string[];
}): Promise<string | null> {
  const { cwd, artifactsDirPath, workflowNodes, interruptedNodeIds } = args;
  const gitCleanup = await discardGitChanges(cwd);
  discardNodeArtifacts(artifactsDirPath, workflowNodes, interruptedNodeIds);

  if (gitCleanup.outcome === 'discarded') {
    return null;
  }
  if (gitCleanup.reason === 'not-git') {
    return 'Filesystem changes were preserved because the execution environment is not a Git worktree.';
  }
  return 'Filesystem changes were preserved because the Git worktree has no HEAD commit.';
}
