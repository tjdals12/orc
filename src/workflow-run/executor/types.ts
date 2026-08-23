import type { WorkflowRun, WorkflowRunNode } from '../repository.js';

export type PendingApproval = { nodeId: string; message: string };

export type WorkflowExecutionResult =
  | { outcome: 'succeeded'; nodeCount: number; elapsedSeconds: number }
  | { outcome: 'failed'; nodeId: string; reason: string }
  | { outcome: 'paused'; approvals: PendingApproval[] }
  | { outcome: 'cancelled' };

export type FinishedNode =
  | { outcome: 'succeeded'; nodeId: string }
  | { outcome: 'awaiting-decision'; nodeId: string; message: string }
  | { outcome: 'failed'; nodeId: string; reason: string }
  | { outcome: 'errored'; nodeId: string; error: unknown };

export type WorkflowRunExecutionState = 'running' | 'cancelled' | 'deleted';

export type WorkflowRunStateWriter = {
  markRunStarted: (workflowRun: Pick<WorkflowRun, 'id' | 'started_at'>) => Promise<boolean>;
  markRunFailed: (workflowRunId: string) => Promise<boolean>;
  markRunSucceeded: (workflowRunId: string) => Promise<boolean>;
  markRunPaused: (workflowRunId: string) => Promise<boolean>;
  markRunFinished: (workflowRunId: string) => Promise<void>;
};

export type WorkflowRunNodeStateWriter = {
  markNodeStarted: (
    workflowRunNode: Pick<WorkflowRunNode, 'id' | 'workflow_run_id'>,
  ) => Promise<void>;
  markNodeFailed: (
    workflowRunNode: Pick<WorkflowRunNode, 'id' | 'workflow_run_id'>,
  ) => Promise<void>;
  markNodeAwaitingDecision: (
    workflowRunNode: Pick<WorkflowRunNode, 'id' | 'workflow_run_id'>,
    message: string,
  ) => Promise<void>;
  markNodeSucceeded: (
    workflowRunNode: Pick<WorkflowRunNode, 'id' | 'workflow_run_id'>,
  ) => Promise<void>;
};
