import type { Kysely, Selectable, Transaction } from 'kysely';

import { randomUUID } from 'node:crypto';

import type { Database, ExecutionEnvironmentsTable } from '#database/schema.js';

type RepositoryWriteOptions = {
  transaction?: Transaction<Database>;
};

export type ExecutionEnvironment = Selectable<ExecutionEnvironmentsTable>;

type CreateExecutionEnvironmentInput =
  { kind: 'in-place'; path: string } | { kind: 'worktree'; path: string; branch: string };

export class ExecutionEnvironmentRepository {
  constructor(private readonly database: Kysely<Database>) {}

  async findById(id: string): Promise<ExecutionEnvironment | null> {
    const executionEnvironment = await this.database
      .selectFrom('execution_environments')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return executionEnvironment ?? null;
  }

  async findByPath(path: string): Promise<ExecutionEnvironment | null> {
    const executionEnvironment = await this.database
      .selectFrom('execution_environments')
      .selectAll()
      .where('path', '=', path)
      .executeTakeFirst();
    return executionEnvironment ?? null;
  }

  async create(
    input: CreateExecutionEnvironmentInput,
    options: RepositoryWriteOptions = {},
  ): Promise<ExecutionEnvironment> {
    const { kind, path } = input;
    const branch = kind === 'worktree' ? input.branch : null;
    const executor = options.transaction ?? this.database;
    const executionEnvironment: ExecutionEnvironment = {
      id: randomUUID(),
      kind,
      path,
      branch,
      created_at: new Date().toISOString(),
    };
    await executor.insertInto('execution_environments').values(executionEnvironment).execute();
    return executionEnvironment;
  }

  async deleteUnreferencedById(id: string, options: RepositoryWriteOptions = {}): Promise<void> {
    const executor = options.transaction ?? this.database;
    await executor
      .deleteFrom('execution_environments')
      .where('id', '=', id)
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('workflow_runs')
              .select('workflow_runs.id')
              .whereRef('workflow_runs.execution_environment_id', '=', 'execution_environments.id'),
          ),
        ),
      )
      .execute();
  }
}
