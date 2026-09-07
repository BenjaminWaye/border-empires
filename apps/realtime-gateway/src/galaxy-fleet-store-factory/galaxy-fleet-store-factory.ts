import { InMemoryGalaxyFleetStore, type GalaxyFleetStore } from "../galaxy-fleet-store/galaxy-fleet-store.js";

type GalaxyFleetStoreFactoryOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
};

// Mirrors galaxy-economy-store-factory.ts / galaxy-senate-store-factory.ts exactly.
export const createGalaxyFleetStore = async (
  options: GalaxyFleetStoreFactoryOptions = {}
): Promise<GalaxyFleetStore> => {
  if (!options.sqlitePath) return new InMemoryGalaxyFleetStore();
  const [{ SqliteGalaxyFleetStore }, { openSqliteDatabase }] = await Promise.all([
    import("../sqlite-galaxy-fleet-store.js"),
    import("../sqlite-db.js")
  ]);
  const store = new SqliteGalaxyFleetStore(openSqliteDatabase(options.sqlitePath));
  if (options.applySchema) await store.applySchema();
  return store;
};
