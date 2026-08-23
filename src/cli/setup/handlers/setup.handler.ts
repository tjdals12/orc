import fs from 'node:fs';

import {
  buildConfigPath,
  buildDatabasePath,
  buildHomeDirPath,
  buildSetupStampPath,
} from '#shared/path.js';
import { loadConfig } from '#installation/config/load.js';
import { createDefaultConfig } from '#installation/config/create.js';
import { tryLoadSetupStamp } from '#installation/setup-stamp/load.js';
import { writeSetupStamp } from '#installation/setup-stamp/write.js';
import { SETUP_VERSION } from '#installation/setup-stamp/schema.js';
import { createDatabase } from '#database/create.js';
import { applyMigrations } from '#database/migrate.js';

type SetupOutcome = 'initialized' | 'updated' | 'unchanged';

export type SetupStep =
  | { kind: 'home-dir'; path: string; changed: boolean }
  | { kind: 'config'; path: string; changed: boolean }
  | { kind: 'database'; path: string; changed: boolean }
  | { kind: 'migrations'; appliedCount: number };

export type SetupResult = {
  outcome: SetupOutcome;
};

export class SetupHandler {
  constructor(private readonly _onStep: (step: SetupStep) => void) {}

  async execute(): Promise<SetupResult> {
    const homeDirPath = buildHomeDirPath();
    const homeDirExisted = fs.existsSync(homeDirPath);
    fs.mkdirSync(homeDirPath, { recursive: true });
    this._onStep({ kind: 'home-dir', path: homeDirPath, changed: !homeDirExisted });

    const configPath = buildConfigPath();
    const config = loadConfig(configPath);
    if (config === null) {
      createDefaultConfig(configPath);
    }
    this._onStep({ kind: 'config', path: configPath, changed: config === null });

    const databasePath = buildDatabasePath();
    const databaseExisted = fs.existsSync(databasePath);
    const database = createDatabase(databasePath);
    this._onStep({ kind: 'database', path: databasePath, changed: !databaseExisted });

    let appliedMigrations: string[];
    try {
      appliedMigrations = await applyMigrations(database);
    } finally {
      await database.destroy();
    }
    this._onStep({ kind: 'migrations', appliedCount: appliedMigrations.length });

    const setupStampPath = buildSetupStampPath();
    const priorSetupStamp = tryLoadSetupStamp(setupStampPath);
    writeSetupStamp(setupStampPath);

    let outcome: SetupOutcome = 'unchanged';
    if (priorSetupStamp === null) {
      outcome = 'initialized';
    } else if (appliedMigrations.length > 0) {
      outcome = 'updated';
    } else if (priorSetupStamp.setupVersion < SETUP_VERSION) {
      outcome = 'updated';
    }

    const result: SetupResult = { outcome };
    return result;
  }
}
