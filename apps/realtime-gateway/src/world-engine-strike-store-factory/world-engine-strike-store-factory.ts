import { InMemoryWorldEngineStrikeStore, type WorldEngineStrikeStore } from "../world-engine-strike-store/world-engine-strike-store.js";

type WorldEngineStrikeStoreFactoryOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
};

export const createWorldEngineStrikeStore = async (
  options: WorldEngineStrikeStoreFactoryOptions = {}
): Promise<WorldEngineStrikeStore> => {
  if (!options.sqlitePath) return new InMemoryWorldEngineStrikeStore();
  const [{ SqliteWorldEngineStrikeStore }, { openSqliteDatabase }] = await Promise.all([
    import("../sqlite-world-engine-strike-store.js"),
    import("../sqlite-db.js")
  ]);
  const store = new SqliteWorldEngineStrikeStore(openSqliteDatabase(options.sqlitePath));
  if (options.applySchema) await store.applySchema();
  return store;
};
