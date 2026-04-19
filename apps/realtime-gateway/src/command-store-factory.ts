import { readFile } from "node:fs/promises";

import type { GatewayCommandStore } from "./command-store.js";
import { InMemoryGatewayCommandStore } from "./command-store.js";
import { resolveGatewayMigrationPath } from "./migration-path.js";
import { createPostgresGatewayCommandStore } from "./postgres-command-store.js";

type CommandStoreFactoryOptions = {
  databaseUrl?: string;
  applySchema?: boolean;
};

export const createGatewayCommandStore = async (
  options: CommandStoreFactoryOptions = {}
): Promise<GatewayCommandStore> => {
  if (!options.databaseUrl) return new InMemoryGatewayCommandStore();

  const store = createPostgresGatewayCommandStore(options.databaseUrl);
  if (options.applySchema) {
    const migrationPath = await resolveGatewayMigrationPath("0001_command_store.sql", import.meta.url);
    const migrationSql = await readFile(migrationPath, "utf8");
    await store.applySchema(migrationSql);
  }
  return store;
};
