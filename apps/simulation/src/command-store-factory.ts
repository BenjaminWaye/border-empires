import { readFile } from "node:fs/promises";

import type { SimulationCommandStore } from "./command-store.js";
import { InMemorySimulationCommandStore } from "./command-store.js";
import { resolveSimulationMigrationPath } from "./migration-path.js";
import { createPostgresSimulationCommandStore } from "./postgres-command-store.js";
import { SqliteSimulationCommandStore } from "./sqlite-command-store.js";
import { openSqliteDatabase } from "./sqlite-db.js";

type CommandStoreFactoryOptions = {
  databaseUrl?: string;
  sqlitePath?: string;
  applySchema?: boolean;
};

export const createSimulationCommandStore = async (
  options: CommandStoreFactoryOptions = {}
): Promise<SimulationCommandStore> => {
  if (options.sqlitePath) {
    const store = new SqliteSimulationCommandStore(openSqliteDatabase(options.sqlitePath));
    if (options.applySchema) await store.applySchema();
    return store;
  }
  if (!options.databaseUrl) return new InMemorySimulationCommandStore();

  const store = createPostgresSimulationCommandStore(options.databaseUrl);
  if (options.applySchema) {
    const migrationPath = await resolveSimulationMigrationPath("0002_command_store.sql", import.meta.url);
    const migrationSql = await readFile(migrationPath, "utf8");
    await store.applySchema(migrationSql);
  }
  return store;
};
