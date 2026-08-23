import type { Kysely } from 'kysely';

export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createTable('workflow_run_hook_logs')
    .addColumn('id', 'text', (column) => column.primaryKey())
    .addColumn('workflow_run_id', 'text', (column) =>
      column.notNull().references('workflow_runs.id').onDelete('cascade'),
    )
    .addColumn('sequence', 'integer', (column) => column.notNull())
    .addColumn('type', 'text', (column) => column.notNull())
    .addColumn('phase', 'text', (column) => column.notNull())
    .addColumn('file', 'text', (column) => column.notNull())
    .addColumn('data', 'text', (column) => column.notNull())
    .addColumn('created_at', 'text', (column) => column.notNull())
    .addUniqueConstraint('workflow_run_hook_logs_workflow_run_id_sequence_unique', [
      'workflow_run_id',
      'sequence',
    ])
    .execute();
}
