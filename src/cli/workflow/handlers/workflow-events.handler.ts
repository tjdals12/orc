import type { Kysely } from 'kysely';

import type { Database } from '#database/schema.js';
import {
  WorkflowRunEventRepository,
  WorkflowRunRepository,
  type WorkflowRunEvent,
} from '#workflow-run/repository.js';
import { WorkflowRunError } from '#workflow-run/error.js';

export type WorkflowEventsResult = {
  workflowId: string;
  workflowRunId: string;
  events: WorkflowRunEvent[];
};

export class WorkflowEventsHandler {
  private readonly _workflowRunRepository: WorkflowRunRepository;
  private readonly _workflowRunEventRepository: WorkflowRunEventRepository;

  constructor(database: Kysely<Database>) {
    this._workflowRunRepository = new WorkflowRunRepository(database);
    this._workflowRunEventRepository = new WorkflowRunEventRepository(database);
  }

  async execute(args: { workflowRunId: string }): Promise<WorkflowEventsResult> {
    const workflowRun = await this._workflowRunRepository.findById(args.workflowRunId);
    if (!workflowRun) {
      throw new WorkflowRunError(`No workflow run "${args.workflowRunId}".`);
    }

    const workflowRunEvents = await this._workflowRunEventRepository.findManyByWorkflowRunId(
      workflowRun.id,
    );

    const result: WorkflowEventsResult = {
      workflowId: workflowRun.workflow_id,
      workflowRunId: workflowRun.id,
      events: workflowRunEvents,
    };
    return result;
  }

  toJson(result: WorkflowEventsResult) {
    const events = result.events.map((workflowRunEvent) => ({
      ...workflowRunEvent,
      data: workflowRunEvent.data === null ? null : (JSON.parse(workflowRunEvent.data) as unknown),
    }));
    return events;
  }
}
