import type { Kysely } from 'kysely';
import { FileMigrationProvider, Migrator } from 'kysely/migration';

import url from 'node:url';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import util from 'node:util';

import type { Database } from './schema.js';

const migrationFolder = url.fileURLToPath(new URL('./migrations', import.meta.url));

const migrationProvider = new FileMigrationProvider({
  fs: fsPromises,
  path,
  migrationFolder,
  import: (filePath) => import(url.pathToFileURL(filePath).href),
});

export async function applyMigrations(database: Kysely<Database>): Promise<string[]> {
  const migrator = new Migrator({ db: database, provider: migrationProvider });
  const { error, results = [] } = await migrator.migrateToLatest();

  if (error) {
    const failed = results.find((result) => result.status === 'Error');
    const at = failed ? ` at ${failed.migrationName}` : '';
    const cause = error instanceof Error ? error.message : util.inspect(error);
    throw new Error(`Migration failed${at}.\n${cause}`);
  }

  const applied = results.map((result) => result.migrationName);
  return applied;
}
