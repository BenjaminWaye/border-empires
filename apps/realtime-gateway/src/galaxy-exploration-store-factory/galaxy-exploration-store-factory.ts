import { InMemoryGalaxyExplorationStore, type GalaxyExplorationStore } from "../galaxy-exploration-store/galaxy-exploration-store.js";

type GalaxyExplorationStoreFactoryOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
};

// Mirrors galaxy-battle-log-store-factory.ts exactly.
export const createGalaxyExplorationStore = async (
  options: GalaxyExplorationStoreFactoryOptions = {}
): Promise<GalaxyExplorationStore> => {
  if (!options.sqlitePath) return new InMemoryGalaxyExplorationStore();
  const [{ SqliteGalaxyExplorationStore }, { openSqliteDatabase }] = await Promise.all([
    import("../sqlite-galaxy-exploration-store.js"),
    import("../sqlite-db.js")
  ]);
  const store = new SqliteGalaxyExplorationStore(openSqliteDatabase(options.sqlitePath));
  if (options.applySchema) await store.applySchema();
  return store;
};
