import { readFile } from "node:fs/promises";

import type { SimulationSnapshotStore } from "./snapshot-store.js";
import { InMemorySimulationSnapshotStore } from "./snapshot-store.js";
import { resolveSimulationMigrationPath } from "./migration-path.js";
import { createPostgresSimulationSnapshotStore } from "./postgres-snapshot-store.js";

type SnapshotStoreFactoryOptions = {
  databaseUrl?: string;
  applySchema?: boolean;
};

export const createSimulationSnapshotStore = async (
  options: SnapshotStoreFactoryOptions = {}
): Promise<SimulationSnapshotStore> => {
  if (!options.databaseUrl) return new InMemorySimulationSnapshotStore();

  const store = createPostgresSimulationSnapshotStore(options.databaseUrl);
  if (options.applySchema) {
    const migrationPath = await resolveSimulationMigrationPath("0003_world_snapshots.sql", import.meta.url);
    const migrationSql = await readFile(migrationPath, "utf8");
    await store.applySchema(migrationSql);
  }
  return store;
};
