import type { Kysely } from 'kysely';

import type { Database, WorkflowRunEventType } from '#database/schema.js';
import { parseEventDetail } from '#workflow-run/events.js';
import type { WorkflowExecutionResult } from '#workflow-run/executor/types.js';
import { WorkflowRunError } from '#workflow-run/error.js';
import {
  WorkflowRunEventRepository,
  WorkflowRunNodeRepository,
  WorkflowRunRepository,
  type WorkflowRun,
  type WorkflowRunEvent,
  type WorkflowRunNode,
} from '#workflow-run/repository.js';

const terminalEventTypes: WorkflowRunEventType[] = [
  'run_succeeded',
  'run_failed',
  'run_cancelled',
  'run_paused',
  'run_stopped',
  'run_stop_failed',
];

export class WorkflowExecutionResultLoader {
  private readonly _workflowRunRepository: WorkflowRunRepository;
  private readonly _workflowRunNodeRepository: WorkflowRunNodeRepository;
  private readonly _workflowRunEventRepository: WorkflowRunEventRepository;

  constructor(database: Kysely<Database>) {
    this._workflowRunRepository = new WorkflowRunRepository(database);
    this._workflowRunNodeRepository = new WorkflowRunNodeRepository(database);
    this._workflowRunEventRepository = new WorkflowRunEventRepository(database);
  }

  async load(workflowRunId: string): Promise<WorkflowExecutionResult> {
    const workflowRun = await this._workflowRunRepository.findById(workflowRunId);
    if (workflowRun === null) {
      throw new WorkflowRunError(`No workflow run "${workflowRunId}".`);
    }

    const workflowRunNodes = await this._workflowRunNodeRepository.findManyByWorkflowRunId(
      workflowRun.id,
    );
    const workflowRunEvents = await this._workflowRunEventRepository.findManyByWorkflowRunId(
      workflowRun.id,
    );
    const currentEvents = this.listCurrentExecutionEvents(workflowRunEvents);

    switch (workflowRun.status) {
      case 'succeeded':
        this.findTerminalEventOrThrow(workflowRun, currentEvents, 'run_succeeded');
        return this.buildSucceededResult(workflowRun, workflowRunNodes);
      case 'paused':
        this.findTerminalEventOrThrow(workflowRun, currentEvents, 'run_paused');
        return this.buildPausedResult(workflowRun, workflowRunNodes);
      case 'failed': {
        const terminalEvent = this.findTerminalEventOrThrow(
          workflowRun,
          currentEvents,
          'run_failed',
        );
        return this.buildFailedResult(workflowRun, workflowRunNodes, currentEvents, terminalEvent);
      }
      case 'cancelled':
        this.findTerminalEventOrThrow(workflowRun, currentEvents, 'run_cancelled');
        return { outcome: 'cancelled' };
      case 'stopped': {
        const terminalEvent = this.findTerminalEventOrThrow(
          workflowRun,
          currentEvents,
          'run_stopped',
        );
        return this.buildStoppedResult(workflowRunNodes, terminalEvent);
      }
      case 'stop_failed': {
        const terminalEvent = this.findTerminalEventOrThrow(
          workflowRun,
          currentEvents,
          'run_stop_failed',
        );
        return this.buildStopFailedResult(workflowRun, terminalEvent);
      }
      case 'pending':
      case 'running':
      case 'stopping':
        throw new WorkflowRunError(
          `Workflow run ${workflowRun.id} is ${workflowRun.status}; it has no terminal result.`,
        );
    }
  }

  private listCurrentExecutionEvents(events: WorkflowRunEvent[]): WorkflowRunEvent[] {
    let firstCurrentEventIndex = 0;
    for (const [index, event] of events.entries()) {
      if (event.type === 'run_resumed') {
        firstCurrentEventIndex = index + 1;
      }
    }
    return events.slice(firstCurrentEventIndex);
  }

  private findTerminalEventOrThrow(
    workflowRun: WorkflowRun,
    events: WorkflowRunEvent[],
    expectedType: WorkflowRunEventType,
  ): WorkflowRunEvent {
    const terminalEvent = events.findLast((event) => terminalEventTypes.includes(event.type));
    if (terminalEvent === undefined || terminalEvent.type !== expectedType) {
      throw new WorkflowRunError(
        `Workflow run ${workflowRun.id} is ${workflowRun.status} but has no ${expectedType} event.`,
      );
    }
    return terminalEvent;
  }

  private buildSucceededResult(
    workflowRun: WorkflowRun,
    workflowRunNodes: WorkflowRunNode[],
  ): WorkflowExecutionResult {
    const startedAt = workflowRun.started_at;
    const finishedAt = workflowRun.finished_at;
    if (startedAt === null || finishedAt === null) {
      throw this.buildIncompleteResultError(workflowRun);
    }

    const startedMs = Date.parse(startedAt);
    const finishedMs = Date.parse(finishedAt);
    if (Number.isNaN(startedMs) || Number.isNaN(finishedMs) || finishedMs < startedMs) {
      throw this.buildIncompleteResultError(workflowRun);
    }

    return {
      outcome: 'succeeded',
      nodeCount: workflowRunNodes.length,
      elapsedSeconds: (finishedMs - startedMs) / 1000,
    };
  }

  private buildPausedResult(
    workflowRun: WorkflowRun,
    workflowRunNodes: WorkflowRunNode[],
  ): WorkflowExecutionResult {
    const approvals = workflowRunNodes
      .filter((workflowRunNode) => workflowRunNode.status === 'awaiting_decision')
      .map((workflowRunNode) => ({
        nodeId: workflowRunNode.node_id,
        message: workflowRunNode.message ?? '',
      }));
    if (approvals.length === 0) {
      throw this.buildIncompleteResultError(workflowRun);
    }
    return { outcome: 'paused', approvals };
  }

  private buildFailedResult(
    workflowRun: WorkflowRun,
    workflowRunNodes: WorkflowRunNode[],
    currentEvents: WorkflowRunEvent[],
    terminalEvent: WorkflowRunEvent,
  ): WorkflowExecutionResult {
    if (terminalEvent.data !== null) {
      const reason = this.parseRequiredDetail(workflowRun, terminalEvent);
      return { outcome: 'failed', nodeId: null, reason };
    }

    const nodeFailedEvent = currentEvents.find((event) => event.type === 'node_failed');
    if (nodeFailedEvent === undefined || nodeFailedEvent.node_id === null) {
      throw this.buildIncompleteResultError(workflowRun);
    }

    const failedNode = workflowRunNodes.find(
      (workflowRunNode) =>
        workflowRunNode.node_id === nodeFailedEvent.node_id && workflowRunNode.status === 'failed',
    );
    if (failedNode === undefined) {
      throw this.buildIncompleteResultError(workflowRun);
    }

    const reason = this.parseRequiredDetail(workflowRun, nodeFailedEvent);
    return { outcome: 'failed', nodeId: failedNode.node_id, reason };
  }

  private buildStoppedResult(
    workflowRunNodes: WorkflowRunNode[],
    terminalEvent: WorkflowRunEvent,
  ): WorkflowExecutionResult {
    const warning = parseEventDetail(terminalEvent.type, terminalEvent.data);
    const nodeIds = workflowRunNodes
      .filter((workflowRunNode) => workflowRunNode.status === 'stopped')
      .map((workflowRunNode) => workflowRunNode.node_id);
    return { outcome: 'stopped', nodeIds, warning };
  }

  private buildStopFailedResult(
    workflowRun: WorkflowRun,
    terminalEvent: WorkflowRunEvent,
  ): WorkflowExecutionResult {
    const reason = this.parseRequiredDetail(workflowRun, terminalEvent);
    return { outcome: 'stop-failed', reason };
  }

  private parseRequiredDetail(workflowRun: WorkflowRun, event: WorkflowRunEvent): string {
    const detail = parseEventDetail(event.type, event.data);
    if (detail === null) {
      throw this.buildIncompleteResultError(workflowRun);
    }
    return detail;
  }

  private buildIncompleteResultError(workflowRun: WorkflowRun): WorkflowRunError {
    return new WorkflowRunError(
      `Workflow run ${workflowRun.id} has an incomplete ${workflowRun.status} result.`,
    );
  }
}
