import type { Kysely } from 'kysely';

import type { Database } from '#database/schema.js';
import {
  WorkflowRunEventRepository,
  WorkflowRunHookLogRepository,
  WorkflowRunNodeLogRepository,
} from '#workflow-run/repository.js';
import { resolveEntrySequence, type WorkflowRunStreamEntry } from '#workflow-run/follow.js';

export class WorkflowStreamCollector {
  private readonly _workflowRunEventRepository: WorkflowRunEventRepository;
  private readonly _workflowRunNodeLogRepository: WorkflowRunNodeLogRepository;
  private readonly _workflowRunHookLogRepository: WorkflowRunHookLogRepository;

  constructor(database: Kysely<Database>) {
    this._workflowRunEventRepository = new WorkflowRunEventRepository(database);
    this._workflowRunNodeLogRepository = new WorkflowRunNodeLogRepository(database);
    this._workflowRunHookLogRepository = new WorkflowRunHookLogRepository(database);
  }

  async collectEntries(
    workflowRunId: string,
    cursor: number | null,
  ): Promise<WorkflowRunStreamEntry[]> {
    const criteria = cursor === null ? {} : { sequence: { gt: cursor } };

    const workflowRunEvents = await this._workflowRunEventRepository.findManyByWorkflowRunId(
      workflowRunId,
      criteria,
    );
    const workflowRunNodeLogs = await this._workflowRunNodeLogRepository.findManyByWorkflowRunId(
      workflowRunId,
      criteria,
    );
    const workflowRunHookLogs = await this._workflowRunHookLogRepository.findManyByWorkflowRunId(
      workflowRunId,
      criteria,
    );

    const workflowRunEventEntries: WorkflowRunStreamEntry[] = workflowRunEvents.map((event) => ({
      kind: 'event',
      event,
    }));
    const workflowRunNodeLogEntries: WorkflowRunStreamEntry[] = workflowRunNodeLogs.map((log) => ({
      kind: 'log',
      log,
    }));
    const workflowRunHookLogEntries: WorkflowRunStreamEntry[] = workflowRunHookLogs.map(
      (hookLog) => ({
        kind: 'hook_log',
        hookLog,
      }),
    );

    const entries = [
      ...workflowRunEventEntries,
      ...workflowRunNodeLogEntries,
      ...workflowRunHookLogEntries,
    ].sort((a, b) => resolveEntrySequence(a) - resolveEntrySequence(b));
    return entries;
  }
}
