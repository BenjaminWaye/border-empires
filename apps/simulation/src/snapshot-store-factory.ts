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
    const snapshotMigrationPath = await resolveSimulationMigrationPath("0003_world_snapshots.sql", import.meta.url);
    const snapshotMigrationSql = await readFile(snapshotMigrationPath, "utf8");
    await store.applySchema(snapshotMigrationSql);
    const boundedMigrationPath = await resolveSimulationMigrationPath("0008_bounded_storage.sql", import.meta.url);
    const boundedMigrationSql = await readFile(boundedMigrationPath, "utf8");
    await store.applySchema(boundedMigrationSql);
  }
  return store;
};
