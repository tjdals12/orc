import type { Kysely } from 'kysely';

import type { Database } from '#database/schema.js';

import {
  WorkflowRunEventRepository,
  WorkflowRunHookLogRepository,
  WorkflowRunNodeLogRepository,
} from './repository.js';

export class WorkflowRunSequenceReader {
  private readonly _workflowRunEventRepository: WorkflowRunEventRepository;
  private readonly _workflowRunNodeLogRepository: WorkflowRunNodeLogRepository;
  private readonly _workflowRunHookLogRepository: WorkflowRunHookLogRepository;

  constructor(database: Kysely<Database>) {
    this._workflowRunEventRepository = new WorkflowRunEventRepository(database);
    this._workflowRunNodeLogRepository = new WorkflowRunNodeLogRepository(database);
    this._workflowRunHookLogRepository = new WorkflowRunHookLogRepository(database);
  }

  async findLastSequence(workflowRunId: string): Promise<number | null> {
    const maxSequences = await Promise.all([
      this._workflowRunEventRepository.findMaxSequenceByWorkflowRunId(workflowRunId),
      this._workflowRunNodeLogRepository.findMaxSequenceByWorkflowRunId(workflowRunId),
      this._workflowRunHookLogRepository.findMaxSequenceByWorkflowRunId(workflowRunId),
    ]);

    const writtenSequences = maxSequences.filter((maxSequence) => maxSequence !== null);
    if (writtenSequences.length === 0) {
      return null;
    }
    return Math.max(...writtenSequences);
  }
}
