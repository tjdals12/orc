import type { Kysely } from 'kysely';

export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createTable('workflow_run_node_logs')
    .addColumn('id', 'text', (column) => column.primaryKey())
    .addColumn('workflow_run_id', 'text', (column) =>
      column.notNull().references('workflow_runs.id').onDelete('cascade'),
    )
    .addColumn('sequence', 'integer', (column) => column.notNull())
    .addColumn('type', 'text', (column) => column.notNull())
    .addColumn('node_id', 'text', (column) => column.notNull())
    .addColumn('data', 'text', (column) => column.notNull())
    .addColumn('created_at', 'text', (column) => column.notNull())
    .addUniqueConstraint('workflow_run_node_logs_workflow_run_id_sequence_unique', [
      'workflow_run_id',
      'sequence',
    ])
    .addForeignKeyConstraint(
      'workflow_run_node_logs_workflow_run_id_node_id_fk',
      ['workflow_run_id', 'node_id'],
      'workflow_run_nodes',
      ['workflow_run_id', 'node_id'],
      (constraint) => constraint.onDelete('cascade'),
    )
    .execute();
}
