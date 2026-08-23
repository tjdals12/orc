import type {
  WorkflowRun,
  WorkflowRunEvent,
  WorkflowRunHookLog,
  WorkflowRunNode,
  WorkflowRunNodeLog,
} from '#workflow-run/repository.js';
import type { WorkflowExecutionResult } from '#workflow-run/executor/types.js';

export type WorkflowRunPlan = {
  projectName: string;
  workflowId: string;
  workflowRunId: string;
  workflowRunNodeCount: number;
  artifactsDirPath: string | null;
  nodeLabels: string[];
};

export type WorkflowRunProgress = {
  onEvent: (event: WorkflowRunEvent) => void;
  onLog: (log: WorkflowRunNodeLog) => void;
  onHookLog: (hookLog: WorkflowRunHookLog) => void;
};

export type WorkflowRunInput =
  | {
      kind: 'inline';
      text: string;
    }
  | { kind: 'file'; path: string };

export type WorkflowRunOutcome =
  | { kind: 'detached'; workerPid: number }
  | { kind: 'provisioning-failed'; reason: string }
  | { kind: 'cancelled' }
  | { kind: 'executed'; execution: WorkflowExecutionResult };

export type WorkflowRunResult = {
  run: WorkflowRun;
  nodes: WorkflowRunNode[];
  outcome: WorkflowRunOutcome;
};
