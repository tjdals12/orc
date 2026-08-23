export type ProjectsTable = {
  id: string;
  name: string;
  path: string;
  created_at: string;
};

type ExecutionEnvironmentKind = 'in-place' | 'worktree';
export type ExecutionEnvironmentsTable = {
  id: string;
  kind: ExecutionEnvironmentKind;
  path: string;
  branch: string | null;
  created_at: string;
};

export type WorkflowRunStatus =
  'pending' | 'running' | 'paused' | 'succeeded' | 'failed' | 'cancelled';
export type WorkflowRunsTable = {
  id: string;
  project_id: string;
  workflow_id: string;
  input: string | null;
  execution_environment_id: string | null;
  status: WorkflowRunStatus;
  pid: number | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

export type WorkflowRunNodeStatus =
  'pending' | 'running' | 'awaiting_decision' | 'rejected' | 'succeeded' | 'failed';
export type WorkflowRunNodesTable = {
  id: string;
  workflow_run_id: string;
  node_id: string;
  position: number;
  status: WorkflowRunNodeStatus;
  attempt: number;
  message: string | null;
  reason: string | null;
  started_at: string | null;
  finished_at: string | null;
};

export type WorkflowRunEventType =
  | 'node_started'
  | 'node_succeeded'
  | 'node_failed'
  | 'agent_session_started'
  | 'iteration_started'
  | 'iteration_completed'
  | 'decision_requested'
  | 'decision_approved'
  | 'decision_rejected'
  | 'run_started'
  | 'run_succeeded'
  | 'run_failed'
  | 'run_cancelled'
  | 'run_resumed'
  | 'run_paused'
  | 'worktree_creating'
  | 'files_copying'
  | 'hook_started';
export type WorkflowRunEventsTable = {
  id: string;
  workflow_run_id: string;
  sequence: number;
  node_id: string | null;
  type: WorkflowRunEventType;
  data: string | null;
  created_at: string;
};

export type WorkflowRunNodeLogType = 'bash_output' | 'agent_output';
export type WorkflowRunNodeLogsTable = {
  id: string;
  workflow_run_id: string;
  sequence: number;
  type: WorkflowRunNodeLogType;
  node_id: string;
  data: string;
  created_at: string;
};

export const WORKTREE_HOOK_PHASES = ['post-create', 'pre-remove', 'post-remove'] as const;
export type WorktreeHookPhase = (typeof WORKTREE_HOOK_PHASES)[number];
export type WorkflowRunHookLogType = 'bash_output';
export type WorkflowRunHookLogsTable = {
  id: string;
  workflow_run_id: string;
  sequence: number;
  type: WorkflowRunHookLogType;
  phase: WorktreeHookPhase;
  file: string;
  data: string;
  created_at: string;
};

export type Database = {
  projects: ProjectsTable;
  execution_environments: ExecutionEnvironmentsTable;
  workflow_runs: WorkflowRunsTable;
  workflow_run_nodes: WorkflowRunNodesTable;
  workflow_run_events: WorkflowRunEventsTable;
  workflow_run_node_logs: WorkflowRunNodeLogsTable;
  workflow_run_hook_logs: WorkflowRunHookLogsTable;
};
