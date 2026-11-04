import type { Kysely } from 'kysely';

export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema.alterTable('workflow_runs').addColumn('base_branch', 'text').execute();
}
