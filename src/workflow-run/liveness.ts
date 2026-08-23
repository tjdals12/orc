import os from 'node:os';

import type { WorkflowRun } from './repository.js';

export type WorkflowRunLiveness = 'alive' | 'dead' | 'inactive';

function hasProcess(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function resolveWorkflowRunLiveness(workflowRun: WorkflowRun): WorkflowRunLiveness {
  if (workflowRun.status !== 'running') {
    return 'inactive';
  }

  const bootedAtMs = Date.now() - os.uptime() * 1000;
  const startedAtMs = workflowRun.started_at === null ? null : Date.parse(workflowRun.started_at);
  if (startedAtMs !== null && startedAtMs < bootedAtMs) {
    return 'dead';
  }

  if (workflowRun.pid === null) {
    return 'dead';
  }

  const processIsRunning = hasProcess(workflowRun.pid);
  return processIsRunning ? 'alive' : 'dead';
}
