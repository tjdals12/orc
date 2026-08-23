import type { Kysely } from 'kysely';

export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createTable('execution_environments')
    .addColumn('id', 'text', (column) => column.primaryKey())
    .addColumn('kind', 'text', (column) => column.notNull())
    .addColumn('path', 'text', (column) => column.notNull().unique())
    .addColumn('branch', 'text')
    .addColumn('created_at', 'text', (column) => column.notNull())
    .execute();
}
