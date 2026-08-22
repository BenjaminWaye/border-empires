import { InMemoryGalaxyEconomyStore, type GalaxyEconomyStore } from "../galaxy-economy-store/galaxy-economy-store.js";

type GalaxyEconomyStoreFactoryOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
};

export const createGalaxyEconomyStore = async (
  options: GalaxyEconomyStoreFactoryOptions = {}
): Promise<GalaxyEconomyStore> => {
  if (!options.sqlitePath) return new InMemoryGalaxyEconomyStore();
  const [{ SqliteGalaxyEconomyStore }, { openSqliteDatabase }] = await Promise.all([
    import("../sqlite-galaxy-economy-store.js"),
    import("../sqlite-db.js")
  ]);
  const store = new SqliteGalaxyEconomyStore(openSqliteDatabase(options.sqlitePath));
  if (options.applySchema) await store.applySchema();
  return store;
};
