import { readFile } from "node:fs/promises";

import type { SimulationCommandStore } from "./command-store.js";
import { InMemorySimulationCommandStore } from "./command-store.js";
import { resolveSimulationMigrationPath } from "./migration-path.js";
import { createPostgresSimulationCommandStore } from "./postgres-command-store.js";

type CommandStoreFactoryOptions = {
  databaseUrl?: string;
  applySchema?: boolean;
};

export const createSimulationCommandStore = async (
  options: CommandStoreFactoryOptions = {}
): Promise<SimulationCommandStore> => {
  if (!options.databaseUrl) return new InMemorySimulationCommandStore();

  const store = createPostgresSimulationCommandStore(options.databaseUrl);
  if (options.applySchema) {
    const migrationPath = await resolveSimulationMigrationPath("0002_command_store.sql", import.meta.url);
    const migrationSql = await readFile(migrationPath, "utf8");
    await store.applySchema(migrationSql);
  }
  return store;
};
