import type { Kysely } from 'kysely';

export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createTable('projects')
    .addColumn('id', 'text', (column) => column.primaryKey())
    .addColumn('name', 'text', (column) => column.notNull().unique())
    .addColumn('path', 'text', (column) => column.notNull().unique())
    .addColumn('created_at', 'text', (column) => column.notNull())
    .execute();
}
