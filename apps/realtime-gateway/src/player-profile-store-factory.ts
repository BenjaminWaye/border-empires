import { readFile } from "node:fs/promises";

import { resolveGatewayMigrationPath } from "./migration-path.js";
import { createPostgresGatewayPlayerProfileStore } from "./postgres-player-profile-store.js";
import { InMemoryGatewayPlayerProfileStore, type GatewayPlayerProfileStore } from "./player-profile-store.js";
import { SqliteGatewayPlayerProfileStore } from "./sqlite-player-profile-store.js";
import { openSqliteDatabase } from "./sqlite-db.js";
import { retryStartup } from "./startup-retry.js";

type PlayerProfileStoreFactoryOptions = {
  databaseUrl?: string;
  sqlitePath?: string;
  applySchema?: boolean;
};

export const createGatewayPlayerProfileStore = async (
  options: PlayerProfileStoreFactoryOptions = {}
): Promise<GatewayPlayerProfileStore> => {
  if (options.sqlitePath) {
    const store = new SqliteGatewayPlayerProfileStore(openSqliteDatabase(options.sqlitePath));
    if (options.applySchema) await store.applySchema();
    return store;
  }
  if (!options.databaseUrl) return new InMemoryGatewayPlayerProfileStore();

  const store = createPostgresGatewayPlayerProfileStore(options.databaseUrl);
  if (options.applySchema) {
    const migrationPath = await resolveGatewayMigrationPath("0002_player_profiles.sql", import.meta.url);
    const migrationSql = await readFile(migrationPath, "utf8");
    await retryStartup("gateway player-profile-store applySchema", () => store.applySchema(migrationSql), {
      onAttemptFailed: (error, attempt, delayMs) => {
        console.warn(
          `[gateway] player-profile-store applySchema attempt ${attempt} failed; retrying in ${delayMs}ms:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    });
  }
  return store;
};
