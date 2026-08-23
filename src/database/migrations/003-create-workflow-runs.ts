import type { Kysely } from 'kysely';

export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createTable('workflow_runs')
    .addColumn('id', 'text', (column) => column.primaryKey())
    .addColumn('project_id', 'text', (column) => column.notNull().references('projects.id'))
    .addColumn('workflow_id', 'text', (column) => column.notNull())
    .addColumn('input', 'text')
    .addColumn('execution_environment_id', 'text', (column) =>
      column.references('execution_environments.id'),
    )
    .addColumn('status', 'text', (column) => column.notNull())
    .addColumn('pid', 'integer')
    .addColumn('started_at', 'text')
    .addColumn('finished_at', 'text')
    .addColumn('created_at', 'text', (column) => column.notNull())
    .execute();
}
