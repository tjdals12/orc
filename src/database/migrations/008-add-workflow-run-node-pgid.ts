import type { Kysely } from 'kysely';

export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema.alterTable('workflow_run_nodes').addColumn('pgid', 'integer').execute();
}
