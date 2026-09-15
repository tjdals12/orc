import { sql, type Kysely } from 'kysely';

export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createTable('workflow_run_node_process_groups')
    .addColumn('workflow_run_node_id', 'text', (column) =>
      column.notNull().references('workflow_run_nodes.id').onDelete('cascade'),
    )
    .addColumn('pgid', 'integer', (column) => column.notNull())
    .addColumn('created_at', 'text', (column) => column.notNull())
    .addPrimaryKeyConstraint('workflow_run_node_process_groups_primary', [
      'workflow_run_node_id',
      'pgid',
    ])
    .execute();

  await sql`
    insert into workflow_run_node_process_groups (workflow_run_node_id, pgid, created_at)
    select id, pgid, ${new Date().toISOString()}
    from workflow_run_nodes
    where pgid is not null
  `.execute(database);
}
