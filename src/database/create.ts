import SQLite from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';

import type { Database } from './schema.js';

export function createDatabase(databasePath: string): Kysely<Database> {
  const sqlite = new SQLite(databasePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const database = new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) });
  return database;
}
