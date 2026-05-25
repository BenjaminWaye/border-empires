import type { SimulationCommandStore } from "./command-store.js";
import { InMemorySimulationCommandStore } from "./command-store.js";

type CommandStoreFactoryOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
};

export const createSimulationCommandStore = async (
  options: CommandStoreFactoryOptions = {}
): Promise<SimulationCommandStore> => {
  if (!options.sqlitePath) return new InMemorySimulationCommandStore();
  const [{ SqliteSimulationCommandStore }, { openSqliteDatabase }] = await Promise.all([
    import("./sqlite-command-store.js"),
    import("./sqlite-db.js")
  ]);
  const store = new SqliteSimulationCommandStore(openSqliteDatabase(options.sqlitePath));
  if (options.applySchema) await store.applySchema();
  return store;
};
