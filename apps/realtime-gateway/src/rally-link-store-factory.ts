import { readFile } from "node:fs/promises";

import { resolveGatewayMigrationPath } from "./migration-path.js";
import { createPostgresRallyLinkStore } from "./postgres-rally-link-store.js";
import { InMemoryRallyLinkStore, type RallyLinkStore } from "./rally-link-store.js";
import { retryStartup } from "./startup-retry.js";

type RallyLinkStoreFactoryOptions = {
  databaseUrl?: string;
  sqlitePath?: string;
  applySchema?: boolean;
};

export const createGatewayRallyLinkStore = async (
  options: RallyLinkStoreFactoryOptions = {}
): Promise<RallyLinkStore> => {
  if (options.sqlitePath) {
    const [{ SqliteRallyLinkStore }, { openSqliteDatabase }] = await Promise.all([
      import("./sqlite-rally-link-store.js"),
      import("./sqlite-db.js")
    ]);
    const store = new SqliteRallyLinkStore(openSqliteDatabase(options.sqlitePath));
    if (options.applySchema) await store.applySchema();
    return store;
  }
  if (!options.databaseUrl) return new InMemoryRallyLinkStore();

  const store = createPostgresRallyLinkStore(options.databaseUrl);
  if (options.applySchema) {
    const migrationPath = await resolveGatewayMigrationPath("0004_rally_links.sql", import.meta.url);
    const migrationSql = await readFile(migrationPath, "utf8");
    await retryStartup("gateway rally-link-store applySchema", () => store.applySchema(migrationSql), {
      onAttemptFailed: (error, attempt, delayMs) => {
        console.warn(
          `[gateway] rally-link-store applySchema attempt ${attempt} failed; retrying in ${delayMs}ms:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    });
  }
  return store;
};
