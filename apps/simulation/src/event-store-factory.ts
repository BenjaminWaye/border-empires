import type { SimulationEventStore } from "./event-store.js";
import { InMemorySimulationEventStore } from "./event-store.js";

type EventStoreFactoryOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
};

export const createSimulationEventStore = async (
  options: EventStoreFactoryOptions = {}
): Promise<SimulationEventStore> => {
  if (!options.sqlitePath) return new InMemorySimulationEventStore();
  const [{ SqliteSimulationEventStore }, { openSqliteDatabase }] = await Promise.all([
    import("./sqlite-event-store.js"),
    import("./sqlite-db.js")
  ]);
  const store = new SqliteSimulationEventStore(openSqliteDatabase(options.sqlitePath));
  if (options.applySchema) await store.applySchema();
  return store;
};
