import type {
  WorkflowRunEventType,
  WorkflowRunHookLogType,
  WorkflowRunNodeLogType,
  WorktreeHookPhase,
} from '#database/schema.js';
import type { AgentOutput, AgentSession } from './agent-node/provider.js';
import type { WorkflowRunEvent, WorkflowRunHookLog, WorkflowRunNodeLog } from './repository.js';
import type { LoopVerdictKind } from './types.js';

type RecordWorkflowRunEventInput =
  | { type: 'node_started'; nodeId: string }
  | { type: 'node_succeeded'; nodeId: string }
  | { type: 'node_failed'; nodeId: string; reason: string }
  | { type: 'agent_session_started'; nodeId: string; session: AgentSession }
  | { type: 'iteration_started'; nodeId: string; iteration: number; maxIterations: number }
  | { type: 'iteration_completed'; nodeId: string; iteration: number; verdict: LoopVerdictKind }
  | { type: 'decision_requested'; nodeId: string }
  | { type: 'decision_approved'; nodeId: string }
  | { type: 'decision_rejected'; nodeId: string; reason: string | null }
  | { type: 'run_started' }
  | { type: 'run_succeeded' }
  | { type: 'run_failed'; reason: string | null }
  | { type: 'run_cancelled' }
  | { type: 'run_resumed' }
  | { type: 'run_paused' }
  | { type: 'worktree_creating' }
  | { type: 'files_copying' }
  | { type: 'hook_started'; file: string };

type WorkflowRunEventFields = {
  type: WorkflowRunEventType;
  nodeId: string | null;
  data: Record<string, unknown> | null;
};

type SaveWorkflowRunEventInput = WorkflowRunEventFields & { sequence: number };

type RecordWorkflowRunNodeLogInput =
  | { type: 'bash_output'; nodeId: string; stream: 'stdout' | 'stderr'; text: string }
  | { type: 'agent_output'; nodeId: string; output: AgentOutput };

type WorkflowRunNodeLogFields = {
  type: WorkflowRunNodeLogType;
  nodeId: string;
  data: Record<string, unknown>;
};

type SaveWorkflowRunNodeLogInput = WorkflowRunNodeLogFields & { sequence: number };

type RecordWorkflowRunHookLogInput = {
  type: 'bash_output';
  phase: WorktreeHookPhase;
  file: string;
  stream: 'stdout' | 'stderr';
  text: string;
};

type WorkflowRunHookLogFields = {
  type: WorkflowRunHookLogType;
  phase: WorktreeHookPhase;
  file: string;
  data: Record<string, unknown>;
};

type SaveWorkflowRunHookLogInput = WorkflowRunHookLogFields & { sequence: number };

export class WorkflowRunRecorder {
  private _nextSequence: number;

  private readonly _saveEvent: (input: SaveWorkflowRunEventInput) => Promise<WorkflowRunEvent>;
  private readonly _onEvent: (event: WorkflowRunEvent) => void;

  private readonly _saveLog: (input: SaveWorkflowRunNodeLogInput) => Promise<WorkflowRunNodeLog>;
  private readonly _onLog: (log: WorkflowRunNodeLog) => void;

  private readonly _saveHookLog: (
    input: SaveWorkflowRunHookLogInput,
  ) => Promise<WorkflowRunHookLog>;
  private readonly _onHookLog: (hookLog: WorkflowRunHookLog) => void;

  constructor(args: {
    initialSequence: number;
    saveEvent: (input: SaveWorkflowRunEventInput) => Promise<WorkflowRunEvent>;
    onEvent: (event: WorkflowRunEvent) => void;
    saveLog: (input: SaveWorkflowRunNodeLogInput) => Promise<WorkflowRunNodeLog>;
    onLog: (log: WorkflowRunNodeLog) => void;
    saveHookLog: (input: SaveWorkflowRunHookLogInput) => Promise<WorkflowRunHookLog>;
    onHookLog: (hookLog: WorkflowRunHookLog) => void;
  }) {
    const { initialSequence, saveEvent, onEvent, saveLog, onLog, saveHookLog, onHookLog } = args;

    this._nextSequence = initialSequence;

    this._saveEvent = saveEvent;
    this._onEvent = onEvent;

    this._saveLog = saveLog;
    this._onLog = onLog;

    this._saveHookLog = saveHookLog;
    this._onHookLog = onHookLog;
  }

  async recordEvent(input: RecordWorkflowRunEventInput): Promise<void> {
    const currentSequence = this._nextSequence;
    this._nextSequence += 1;

    const eventFields = this.buildEventFields(input);
    const event = await this._saveEvent({
      sequence: currentSequence,
      ...eventFields,
    });

    this._onEvent(event);
  }

  async recordLog(input: RecordWorkflowRunNodeLogInput): Promise<void> {
    const currentSequence = this._nextSequence;
    this._nextSequence += 1;

    const logFields = this.buildLogFields(input);
    const log = await this._saveLog({
      sequence: currentSequence,
      ...logFields,
    });

    this._onLog(log);
  }

  async recordHookLog(input: RecordWorkflowRunHookLogInput): Promise<void> {
    const currentSequence = this._nextSequence;
    this._nextSequence += 1;

    const hookLogFields = this.buildHookLogFields(input);
    const hookLog = await this._saveHookLog({
      sequence: currentSequence,
      ...hookLogFields,
    });

    this._onHookLog(hookLog);
  }

  private buildEventFields(input: RecordWorkflowRunEventInput): WorkflowRunEventFields {
    switch (input.type) {
      case 'node_started':
      case 'node_succeeded':
        return { type: input.type, nodeId: input.nodeId, data: null };
      case 'node_failed':
        return { type: input.type, nodeId: input.nodeId, data: { reason: input.reason } };
      case 'agent_session_started':
        return { type: input.type, nodeId: input.nodeId, data: { ...input.session } };
      case 'iteration_started':
        return {
          type: input.type,
          nodeId: input.nodeId,
          data: { iteration: input.iteration, max_iterations: input.maxIterations },
        };
      case 'iteration_completed':
        return {
          type: input.type,
          nodeId: input.nodeId,
          data: { iteration: input.iteration, verdict: input.verdict },
        };
      case 'decision_requested':
      case 'decision_approved':
        return {
          type: input.type,
          nodeId: input.nodeId,
          data: null,
        };
      case 'decision_rejected':
        return {
          type: input.type,
          nodeId: input.nodeId,
          data: input.reason === null ? null : { reason: input.reason },
        };
      case 'run_started':
      case 'run_succeeded':
      case 'run_cancelled':
      case 'run_resumed':
      case 'run_paused':
      case 'worktree_creating':
      case 'files_copying':
        return {
          type: input.type,
          nodeId: null,
          data: null,
        };
      case 'run_failed':
        return {
          type: input.type,
          nodeId: null,
          data: input.reason === null ? null : { reason: input.reason },
        };
      case 'hook_started':
        return {
          type: input.type,
          nodeId: null,
          data: { file: input.file },
        };
    }
  }

  private buildLogFields(input: RecordWorkflowRunNodeLogInput): WorkflowRunNodeLogFields {
    switch (input.type) {
      case 'bash_output':
        return {
          type: input.type,
          nodeId: input.nodeId,
          data: {
            stream: input.stream,
            text: input.text,
          },
        };
      case 'agent_output':
        return {
          type: input.type,
          nodeId: input.nodeId,
          data: { ...input.output },
        };
    }
  }

  private buildHookLogFields(input: RecordWorkflowRunHookLogInput): WorkflowRunHookLogFields {
    switch (input.type) {
      case 'bash_output':
        return {
          type: input.type,
          phase: input.phase,
          file: input.file,
          data: {
            stream: input.stream,
            text: input.text,
          },
        };
    }
  }
}
