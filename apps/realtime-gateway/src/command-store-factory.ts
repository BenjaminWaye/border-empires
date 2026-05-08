import { readFile } from "node:fs/promises";

import type { GatewayCommandStore } from "./command-store.js";
import { InMemoryGatewayCommandStore } from "./command-store.js";
import { resolveGatewayMigrationPath } from "./migration-path.js";
import { createPostgresGatewayCommandStore } from "./postgres-command-store.js";
import { retryStartup } from "./startup-retry.js";

type CommandStoreFactoryOptions = {
  databaseUrl?: string;
  sqlitePath?: string;
  applySchema?: boolean;
};

export const createGatewayCommandStore = async (
  options: CommandStoreFactoryOptions = {}
): Promise<GatewayCommandStore> => {
  if (options.sqlitePath) {
    const [{ SqliteGatewayCommandStore }, { openSqliteDatabase }] = await Promise.all([
      import("./sqlite-command-store.js"),
      import("./sqlite-db.js")
    ]);
    const store = new SqliteGatewayCommandStore(openSqliteDatabase(options.sqlitePath));
    if (options.applySchema) await store.applySchema();
    return store;
  }
  if (!options.databaseUrl) return new InMemoryGatewayCommandStore();

  const store = createPostgresGatewayCommandStore(options.databaseUrl);
  if (options.applySchema) {
    const migrationPath = await resolveGatewayMigrationPath("0001_command_store.sql", import.meta.url);
    const migrationSql = await readFile(migrationPath, "utf8");
    await retryStartup("gateway command-store applySchema", () => store.applySchema(migrationSql), {
      onAttemptFailed: (error, attempt, delayMs) => {
        console.warn(
          `[gateway] command-store applySchema attempt ${attempt} failed; retrying in ${delayMs}ms:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    });
  }
  return store;
};
