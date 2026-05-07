import { readFile } from "node:fs/promises";

import type { SimulationEventStore } from "./event-store.js";
import { InMemorySimulationEventStore } from "./event-store.js";
import { resolveSimulationMigrationPath } from "./migration-path.js";
import { createPostgresSimulationEventStore } from "./postgres-event-store.js";
import { SqliteSimulationEventStore } from "./sqlite-event-store.js";
import { openSqliteDatabase } from "./sqlite-db.js";

type EventStoreFactoryOptions = {
  databaseUrl?: string;
  sqlitePath?: string;
  applySchema?: boolean;
};

export const createSimulationEventStore = async (
  options: EventStoreFactoryOptions = {}
): Promise<SimulationEventStore> => {
  if (options.sqlitePath) {
    const store = new SqliteSimulationEventStore(openSqliteDatabase(options.sqlitePath));
    if (options.applySchema) await store.applySchema();
    return store;
  }
  if (!options.databaseUrl) return new InMemorySimulationEventStore();

  const store = createPostgresSimulationEventStore(options.databaseUrl);
  if (options.applySchema) {
    const migrationPath = await resolveSimulationMigrationPath("0001_world_events.sql", import.meta.url);
    const migrationSql = await readFile(migrationPath, "utf8");
    await store.applySchema(migrationSql);
  }
  return store;
};
