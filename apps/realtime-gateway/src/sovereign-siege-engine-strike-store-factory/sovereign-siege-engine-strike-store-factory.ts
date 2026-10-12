import { InMemorySovereignSiegeEngineStrikeStore, type SovereignSiegeEngineStrikeStore } from "../sovereign-siege-engine-strike-store/sovereign-siege-engine-strike-store.js";

type SovereignSiegeEngineStrikeStoreFactoryOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
};

export const createSovereignSiegeEngineStrikeStore = async (
  options: SovereignSiegeEngineStrikeStoreFactoryOptions = {}
): Promise<SovereignSiegeEngineStrikeStore> => {
  if (!options.sqlitePath) return new InMemorySovereignSiegeEngineStrikeStore();
  const [{ SqliteSovereignSiegeEngineStrikeStore }, { openSqliteDatabase }] = await Promise.all([
    import("../sqlite-sovereign-siege-engine-strike-store.js"),
    import("../sqlite-db.js")
  ]);
  const store = new SqliteSovereignSiegeEngineStrikeStore(openSqliteDatabase(options.sqlitePath));
  if (options.applySchema) await store.applySchema();
  return store;
};
