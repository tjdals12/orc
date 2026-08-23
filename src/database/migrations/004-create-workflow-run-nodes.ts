import type { Kysely } from 'kysely';

export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createTable('workflow_run_nodes')
    .addColumn('id', 'text', (column) => column.primaryKey())
    .addColumn('workflow_run_id', 'text', (column) =>
      column.notNull().references('workflow_runs.id').onDelete('cascade'),
    )
    .addColumn('node_id', 'text', (column) => column.notNull())
    .addColumn('position', 'integer', (column) => column.notNull())
    .addColumn('status', 'text', (column) => column.notNull())
    .addColumn('attempt', 'integer', (column) => column.notNull())
    .addColumn('message', 'text')
    .addColumn('reason', 'text')
    .addColumn('started_at', 'text')
    .addColumn('finished_at', 'text')
    .addUniqueConstraint('workflow_run_nodes_workflow_run_id_node_id_unique', [
      'workflow_run_id',
      'node_id',
    ])
    .execute();
}
