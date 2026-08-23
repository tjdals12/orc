import type { Kysely, Selectable, Transaction, Updateable } from 'kysely';

import { randomUUID } from 'node:crypto';

import type {
  Database,
  WorkflowRunEventsTable,
  WorkflowRunEventType,
  WorkflowRunHookLogsTable,
  WorkflowRunHookLogType,
  WorkflowRunNodeLogsTable,
  WorkflowRunNodeLogType,
  WorkflowRunNodesTable,
  WorkflowRunNodeStatus,
  WorkflowRunsTable,
  WorkflowRunStatus,
  WorktreeHookPhase,
} from '#database/schema.js';

type RepositoryWriteOptions = {
  transaction?: Transaction<Database>;
};

type SequenceCriteria = {
  gt: number;
};

export type WorkflowRun = Selectable<WorkflowRunsTable>;

export type WorkflowRunWithProjectName = WorkflowRun & { project_name: string };

type CreateWorkflowRunInput = {
  projectId: string;
  workflowId: string;
  input: string | null;
};

type WorkflowRunStatusMatch = WorkflowRunStatus | { in: WorkflowRunStatus[] };

type WorkflowRunMatch = Pick<WorkflowRun, 'id'> & { status?: WorkflowRunStatusMatch };

type WorkflowRunNodeStatusMatch = WorkflowRunNodeStatus | { in: WorkflowRunNodeStatus[] };

type WorkflowRunNodeMatch = {
  id: string;
  workflowRunId: string;
  status?: WorkflowRunNodeStatusMatch;
};

export class WorkflowRunRepository {
  constructor(private readonly database: Kysely<Database>) {}

  async findById(id: string): Promise<WorkflowRun | null> {
    const workflowRun = await this.database
      .selectFrom('workflow_runs')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return workflowRun ?? null;
  }

  async findManyWithProjectName(options: {
    limit: number;
    projectId?: string;
  }): Promise<WorkflowRunWithProjectName[]> {
    let query = this.database
      .selectFrom('workflow_runs')
      .innerJoin('projects', 'projects.id', 'workflow_runs.project_id')
      .selectAll('workflow_runs')
      .select('projects.name as project_name');
    if (options.projectId !== undefined) {
      query = query.where('workflow_runs.project_id', '=', options.projectId);
    }
    const workflowRuns = await query
      .orderBy('workflow_runs.created_at', 'desc')
      .limit(options.limit)
      .execute();
    return workflowRuns;
  }

  async count(criteria: { projectId?: string } = {}): Promise<number> {
    const { projectId } = criteria;
    let query = this.database
      .selectFrom('workflow_runs')
      .select(({ fn }) => fn.countAll<number>().as('count'));
    if (projectId !== undefined) {
      query = query.where('project_id', '=', projectId);
    }
    const row = await query.executeTakeFirstOrThrow();
    return row.count;
  }

  async findManyByProjectId(projectId: string): Promise<WorkflowRun[]> {
    const workflowRuns = await this.database
      .selectFrom('workflow_runs')
      .selectAll()
      .where('project_id', '=', projectId)
      .orderBy('created_at', 'asc')
      .execute();
    return workflowRuns;
  }

  async create(
    values: CreateWorkflowRunInput,
    options: RepositoryWriteOptions = {},
  ): Promise<WorkflowRun> {
    const { projectId, workflowId, input } = values;
    const executor = options.transaction ?? this.database;
    const workflowRun: WorkflowRun = {
      id: randomUUID(),
      project_id: projectId,
      workflow_id: workflowId,
      input,
      execution_environment_id: null,
      status: 'pending',
      pid: null,
      started_at: null,
      finished_at: null,
      created_at: new Date().toISOString(),
    };
    await executor.insertInto('workflow_runs').values(workflowRun).execute();
    return workflowRun;
  }

  async update(
    where: WorkflowRunMatch,
    patch: Updateable<WorkflowRunsTable>,
    options: RepositoryWriteOptions = {},
  ): Promise<boolean> {
    const executor = options.transaction ?? this.database;
    let query = executor.updateTable('workflow_runs').set(patch).where('id', '=', where.id);
    if (where.status !== undefined) {
      query =
        typeof where.status === 'string'
          ? query.where('status', '=', where.status)
          : query.where('status', 'in', where.status.in);
    }
    const result = await query.executeTakeFirst();
    const updated = result.numUpdatedRows > 0n;
    return updated;
  }

  async updateOrThrow(
    where: Pick<WorkflowRun, 'id'>,
    patch: Updateable<WorkflowRunsTable>,
    options: RepositoryWriteOptions = {},
  ): Promise<void> {
    const updated = await this.update(where, patch, options);
    if (!updated) {
      throw new Error(`No workflow run with id ${where.id}`);
    }
  }

  async deleteById(id: string, options: RepositoryWriteOptions = {}): Promise<void> {
    const executor = options.transaction ?? this.database;
    await executor.deleteFrom('workflow_runs').where('id', '=', id).execute();
  }
}

export type WorkflowRunNode = Selectable<WorkflowRunNodesTable>;

type CreateManyWorkflowRunNodeInput = {
  workflowRunId: string;
  nodeId: string;
  position: number;
};

export class WorkflowRunNodeRepository {
  constructor(private readonly database: Kysely<Database>) {}

  async findManyByWorkflowRunId(workflowRunId: string): Promise<WorkflowRunNode[]> {
    const workflowRunNodes = await this.database
      .selectFrom('workflow_run_nodes')
      .selectAll()
      .where('workflow_run_id', '=', workflowRunId)
      .orderBy('position', 'asc')
      .execute();
    return workflowRunNodes;
  }

  async findByNodeId(workflowRunId: string, nodeId: string): Promise<WorkflowRunNode | null> {
    const workflowRunNode = await this.database
      .selectFrom('workflow_run_nodes')
      .selectAll()
      .where('workflow_run_id', '=', workflowRunId)
      .where('node_id', '=', nodeId)
      .executeTakeFirst();
    return workflowRunNode ?? null;
  }

  async createMany(
    inputs: CreateManyWorkflowRunNodeInput[],
    options: RepositoryWriteOptions = {},
  ): Promise<WorkflowRunNode[]> {
    const executor = options.transaction ?? this.database;
    const workflowRunNodes: WorkflowRunNode[] = inputs.map((input) => {
      const { workflowRunId, nodeId, position } = input;
      return {
        id: randomUUID(),
        workflow_run_id: workflowRunId,
        node_id: nodeId,
        position,
        status: 'pending',
        attempt: 1,
        message: null,
        reason: null,
        started_at: null,
        finished_at: null,
      };
    });
    await executor.insertInto('workflow_run_nodes').values(workflowRunNodes).execute();
    return workflowRunNodes;
  }

  async update(
    where: WorkflowRunNodeMatch,
    patch: Updateable<WorkflowRunNodesTable>,
    options: RepositoryWriteOptions = {},
  ): Promise<boolean> {
    const executor = options.transaction ?? this.database;
    let query = executor
      .updateTable('workflow_run_nodes')
      .set(patch)
      .where('id', '=', where.id)
      .where('workflow_run_id', '=', where.workflowRunId);
    if (where.status !== undefined) {
      query =
        typeof where.status === 'string'
          ? query.where('status', '=', where.status)
          : query.where('status', 'in', where.status.in);
    }
    const result = await query.executeTakeFirst();
    const updated = result.numUpdatedRows > 0n;
    return updated;
  }

  async updateOrThrow(
    where: { id: string; workflowRunId: string },
    patch: Updateable<WorkflowRunNodesTable>,
    options: RepositoryWriteOptions = {},
  ): Promise<void> {
    const updated = await this.update(where, patch, options);
    if (!updated) {
      throw new Error(
        `No workflow run node with id ${where.id} in workflow run ${where.workflowRunId}`,
      );
    }
  }
}

export type WorkflowRunEvent = Selectable<WorkflowRunEventsTable>;

type CreateWorkflowRunEventInput = {
  workflowRunId: string;
  sequence: number;
  nodeId: string | null;
  type: WorkflowRunEventType;
  data: Record<string, unknown> | null;
};

export class WorkflowRunEventRepository {
  constructor(private readonly database: Kysely<Database>) {}

  async findManyByWorkflowRunId(
    workflowRunId: string,
    criteria: { sequence?: SequenceCriteria } = {},
  ): Promise<WorkflowRunEvent[]> {
    let query = this.database
      .selectFrom('workflow_run_events')
      .selectAll()
      .where('workflow_run_id', '=', workflowRunId);
    if (criteria.sequence !== undefined) {
      query = query.where('sequence', '>', criteria.sequence.gt);
    }
    const workflowRunEvents = await query.orderBy('sequence', 'asc').execute();
    return workflowRunEvents;
  }

  async findMaxSequenceByWorkflowRunId(workflowRunId: string): Promise<number | null> {
    const row = await this.database
      .selectFrom('workflow_run_events')
      .select((eb) => eb.fn.max<number | null>('sequence').as('max_sequence'))
      .where('workflow_run_id', '=', workflowRunId)
      .executeTakeFirst();
    const maxSequence = row?.max_sequence ?? null;
    return maxSequence;
  }

  async create(
    input: CreateWorkflowRunEventInput,
    options: RepositoryWriteOptions = {},
  ): Promise<WorkflowRunEvent> {
    const { workflowRunId, sequence, nodeId, type, data } = input;
    const executor = options.transaction ?? this.database;
    const workflowRunEvent: WorkflowRunEvent = {
      id: randomUUID(),
      workflow_run_id: workflowRunId,
      sequence,
      node_id: nodeId,
      type,
      data: data === null ? data : JSON.stringify(data),
      created_at: new Date().toISOString(),
    };
    await executor.insertInto('workflow_run_events').values(workflowRunEvent).execute();
    return workflowRunEvent;
  }
}

export type WorkflowRunNodeLog = Selectable<WorkflowRunNodeLogsTable>;

type CreateWorkflowRunNodeLogInput = {
  workflowRunId: string;
  sequence: number;
  type: WorkflowRunNodeLogType;
  nodeId: string;
  data: Record<string, unknown>;
};

export class WorkflowRunNodeLogRepository {
  constructor(private readonly database: Kysely<Database>) {}

  async findManyByWorkflowRunId(
    workflowRunId: string,
    criteria: { nodeId?: string; sequence?: SequenceCriteria } = {},
  ): Promise<WorkflowRunNodeLog[]> {
    let query = this.database
      .selectFrom('workflow_run_node_logs')
      .selectAll()
      .where('workflow_run_id', '=', workflowRunId);
    if (criteria.nodeId !== undefined) {
      query = query.where('node_id', '=', criteria.nodeId);
    }
    if (criteria.sequence !== undefined) {
      query = query.where('sequence', '>', criteria.sequence.gt);
    }
    const workflowRunNodeLogs = await query.orderBy('sequence', 'asc').execute();
    return workflowRunNodeLogs;
  }

  async findMaxSequenceByWorkflowRunId(workflowRunId: string): Promise<number | null> {
    const row = await this.database
      .selectFrom('workflow_run_node_logs')
      .select((eb) => eb.fn.max<number | null>('sequence').as('max_sequence'))
      .where('workflow_run_id', '=', workflowRunId)
      .executeTakeFirst();
    const maxSequence = row?.max_sequence ?? null;
    return maxSequence;
  }

  async create(
    input: CreateWorkflowRunNodeLogInput,
    options: RepositoryWriteOptions = {},
  ): Promise<WorkflowRunNodeLog> {
    const { workflowRunId, sequence, type, nodeId, data } = input;
    const executor = options.transaction ?? this.database;
    const workflowRunNodeLog: WorkflowRunNodeLog = {
      id: randomUUID(),
      workflow_run_id: workflowRunId,
      sequence,
      type,
      node_id: nodeId,
      data: JSON.stringify(data),
      created_at: new Date().toISOString(),
    };
    await executor.insertInto('workflow_run_node_logs').values(workflowRunNodeLog).execute();
    return workflowRunNodeLog;
  }
}

export type WorkflowRunHookLog = Selectable<WorkflowRunHookLogsTable>;

type CreateWorkflowRunHookLogInput = {
  workflowRunId: string;
  sequence: number;
  type: WorkflowRunHookLogType;
  phase: WorktreeHookPhase;
  file: string;
  data: Record<string, unknown>;
};

export class WorkflowRunHookLogRepository {
  constructor(private readonly database: Kysely<Database>) {}

  async findManyByWorkflowRunId(
    workflowRunId: string,
    criteria: { file?: string; sequence?: SequenceCriteria } = {},
  ): Promise<WorkflowRunHookLog[]> {
    let query = this.database
      .selectFrom('workflow_run_hook_logs')
      .selectAll()
      .where('workflow_run_id', '=', workflowRunId);
    if (criteria.file !== undefined) {
      query = query.where('file', '=', criteria.file);
    }
    if (criteria.sequence !== undefined) {
      query = query.where('sequence', '>', criteria.sequence.gt);
    }
    const workflowRunHookLogs = await query.orderBy('sequence', 'asc').execute();
    return workflowRunHookLogs;
  }

  async findMaxSequenceByWorkflowRunId(workflowRunId: string): Promise<number | null> {
    const row = await this.database
      .selectFrom('workflow_run_hook_logs')
      .select((eb) => eb.fn.max<number | null>('sequence').as('max_sequence'))
      .where('workflow_run_id', '=', workflowRunId)
      .executeTakeFirst();
    const maxSequence = row?.max_sequence ?? null;
    return maxSequence;
  }

  async create(
    input: CreateWorkflowRunHookLogInput,
    options: RepositoryWriteOptions = {},
  ): Promise<WorkflowRunHookLog> {
    const { workflowRunId, sequence, type, phase, file, data } = input;
    const executor = options.transaction ?? this.database;
    const workflowRunHookLog: WorkflowRunHookLog = {
      id: randomUUID(),
      workflow_run_id: workflowRunId,
      sequence,
      type,
      phase,
      file,
      data: JSON.stringify(data),
      created_at: new Date().toISOString(),
    };
    await executor.insertInto('workflow_run_hook_logs').values(workflowRunHookLog).execute();
    return workflowRunHookLog;
  }
}
