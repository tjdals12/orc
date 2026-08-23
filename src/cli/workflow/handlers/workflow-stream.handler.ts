import type { Kysely } from 'kysely';

import type { Database } from '#database/schema.js';
import {
  WorkflowRunEventRepository,
  WorkflowRunHookLogRepository,
  WorkflowRunNodeLogRepository,
  WorkflowRunRepository,
} from '#workflow-run/repository.js';
import { WorkflowRunError } from '#workflow-run/error.js';
import {
  followWorkflowRun,
  resolveEntrySequence,
  type WorkflowRunFollowOutcome,
  type WorkflowRunState,
  type WorkflowRunStreamEntry,
} from '#workflow-run/follow.js';
import { resolveWorkflowRunLiveness } from '#workflow-run/liveness.js';

type WorkflowStreamPlan = {
  workflowId: string;
  workflowRunId: string;
};

type WorkflowStreamProgress = {
  onEntries: (entries: WorkflowRunStreamEntry[]) => void;
};

export type WorkflowStreamResult = {
  workflowId: string;
  workflowRunId: string;
  entries: WorkflowRunStreamEntry[];
};

export type WorkflowStreamFollowResult = {
  outcome: WorkflowRunFollowOutcome;
  entryCount: number;
};

class WorkflowStreamSerializer {
  toEntry(entry: WorkflowRunStreamEntry): unknown {
    if (entry.kind === 'event') {
      const { kind, event } = entry;
      return {
        kind,
        ...event,
        data: event.data === null ? null : (JSON.parse(event.data) as unknown),
      };
    }
    if (entry.kind === 'log') {
      const { kind, log } = entry;
      return {
        kind,
        ...log,
        data: JSON.parse(log.data) as unknown,
      };
    }
    const { kind, hookLog } = entry;
    return {
      kind,
      ...hookLog,
      data: JSON.parse(hookLog.data) as unknown,
    };
  }

  toEntries(entries: WorkflowRunStreamEntry[]): unknown[] {
    const documents = entries.map((entry) => this.toEntry(entry));
    return documents;
  }
}

class WorkflowStreamCollector {
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

export class WorkflowStreamHandler {
  private readonly _workflowStreamSerializer: WorkflowStreamSerializer;
  private readonly _workflowStreamCollector: WorkflowStreamCollector;
  private readonly _workflowRunRepository: WorkflowRunRepository;

  constructor(database: Kysely<Database>) {
    this._workflowStreamSerializer = new WorkflowStreamSerializer();
    this._workflowStreamCollector = new WorkflowStreamCollector(database);
    this._workflowRunRepository = new WorkflowRunRepository(database);
  }

  async execute(args: { workflowRunId: string }): Promise<WorkflowStreamResult> {
    const workflowRun = await this._workflowRunRepository.findById(args.workflowRunId);
    if (!workflowRun) {
      throw new WorkflowRunError(`No workflow run "${args.workflowRunId}".`);
    }

    const entries = await this._workflowStreamCollector.collectEntries(workflowRun.id, null);

    const result: WorkflowStreamResult = {
      workflowRunId: workflowRun.id,
      workflowId: workflowRun.workflow_id,
      entries,
    };
    return result;
  }

  toJson(result: WorkflowStreamResult): unknown[] {
    const documents = this._workflowStreamSerializer.toEntries(result.entries);
    return documents;
  }
}

export class WorkflowStreamFollowHandler {
  private readonly _pollIntervalMs = 250;
  private readonly _drainGraceMs = 10_000;

  private readonly _workflowStreamSerializer: WorkflowStreamSerializer;
  private readonly _workflowStreamCollector: WorkflowStreamCollector;
  private readonly _workflowRunRepository: WorkflowRunRepository;
  private readonly _beginStream: (plan: WorkflowStreamPlan) => WorkflowStreamProgress;

  constructor(
    database: Kysely<Database>,
    beginStream: (plan: WorkflowStreamPlan) => WorkflowStreamProgress,
  ) {
    this._workflowStreamSerializer = new WorkflowStreamSerializer();
    this._workflowStreamCollector = new WorkflowStreamCollector(database);
    this._workflowRunRepository = new WorkflowRunRepository(database);
    this._beginStream = beginStream;
  }

  async execute(args: { workflowRunId: string }): Promise<WorkflowStreamFollowResult> {
    const workflowRun = await this._workflowRunRepository.findById(args.workflowRunId);
    if (!workflowRun) {
      throw new WorkflowRunError(`No workflow run "${args.workflowRunId}".`);
    }

    let entryCount = 0;
    const progress = this._beginStream({
      workflowRunId: workflowRun.id,
      workflowId: workflowRun.workflow_id,
    });

    const onEntries = (entries: WorkflowRunStreamEntry[]): void => {
      entryCount += entries.length;
      progress.onEntries(entries);
    };

    const outcome = await followWorkflowRun(
      (cursor) => this._workflowStreamCollector.collectEntries(workflowRun.id, cursor),
      () => this.checkRunState(workflowRun.id),
      onEntries,
      { pollIntervalMs: this._pollIntervalMs, drainGraceMs: this._drainGraceMs },
    );

    const result: WorkflowStreamFollowResult = {
      outcome,
      entryCount,
    };
    return result;
  }

  private async checkRunState(workflowRunId: string): Promise<WorkflowRunState> {
    const workflowRun = await this._workflowRunRepository.findById(workflowRunId);
    if (!workflowRun) {
      return 'deleted';
    }
    if (workflowRun.status !== 'pending' && workflowRun.status !== 'running') {
      return 'ended';
    }

    const liveness = resolveWorkflowRunLiveness(workflowRun);
    if (liveness === 'dead') {
      return 'dead';
    }

    return 'running';
  }

  toEntryJson(entry: WorkflowRunStreamEntry): unknown {
    const document = this._workflowStreamSerializer.toEntry(entry);
    return document;
  }
}
