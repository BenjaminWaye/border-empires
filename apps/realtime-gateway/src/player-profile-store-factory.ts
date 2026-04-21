import { readFile } from "node:fs/promises";

import { resolveGatewayMigrationPath } from "./migration-path.js";
import { createPostgresGatewayPlayerProfileStore } from "./postgres-player-profile-store.js";
import { InMemoryGatewayPlayerProfileStore, type GatewayPlayerProfileStore } from "./player-profile-store.js";

type PlayerProfileStoreFactoryOptions = {
  databaseUrl?: string;
  applySchema?: boolean;
};

export const createGatewayPlayerProfileStore = async (
  options: PlayerProfileStoreFactoryOptions = {}
): Promise<GatewayPlayerProfileStore> => {
  if (!options.databaseUrl) return new InMemoryGatewayPlayerProfileStore();

  const store = createPostgresGatewayPlayerProfileStore(options.databaseUrl);
  if (options.applySchema) {
    const migrationPath = await resolveGatewayMigrationPath("0002_player_profiles.sql", import.meta.url);
    const migrationSql = await readFile(migrationPath, "utf8");
    await store.applySchema(migrationSql);
  }
  return store;
};
