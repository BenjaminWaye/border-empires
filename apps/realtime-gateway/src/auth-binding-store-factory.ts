import { readFile } from "node:fs/promises";

import { resolveGatewayMigrationPath } from "./migration-path.js";
import { InMemoryGatewayAuthBindingStore, type GatewayAuthBindingStore } from "./auth-binding-store.js";
import { createPostgresGatewayAuthBindingStore } from "./postgres-auth-binding-store.js";
import { retryStartup } from "./startup-retry.js";

type AuthBindingStoreFactoryOptions = {
  databaseUrl?: string;
  applySchema?: boolean;
};

export const createGatewayAuthBindingStore = async (
  options: AuthBindingStoreFactoryOptions = {}
): Promise<GatewayAuthBindingStore> => {
  if (!options.databaseUrl) return new InMemoryGatewayAuthBindingStore();

  const store = createPostgresGatewayAuthBindingStore(options.databaseUrl);
  if (options.applySchema) {
    const migrationPath = await resolveGatewayMigrationPath("0003_auth_identity_bindings.sql", import.meta.url);
    const migrationSql = await readFile(migrationPath, "utf8");
    await retryStartup("gateway auth-binding-store applySchema", () => store.applySchema(migrationSql), {
      onAttemptFailed: (error, attempt, delayMs) => {
        console.warn(
          `[gateway] auth-binding-store applySchema attempt ${attempt} failed; retrying in ${delayMs}ms:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    });
  }
  return store;
};
