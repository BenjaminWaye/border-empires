import { InMemoryGalaxyPlanetStore, type GalaxyPlanetStore } from "../galaxy-planet-store/galaxy-planet-store.js";

type GalaxyPlanetStoreFactoryOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
};

export const createGalaxyPlanetStore = async (
  options: GalaxyPlanetStoreFactoryOptions = {}
): Promise<GalaxyPlanetStore> => {
  if (!options.sqlitePath) return new InMemoryGalaxyPlanetStore();
  const [{ SqliteGalaxyPlanetStore }, { openSqliteDatabase }] = await Promise.all([
    import("../sqlite-galaxy-planet-store.js"),
    import("../sqlite-db.js")
  ]);
  const store = new SqliteGalaxyPlanetStore(openSqliteDatabase(options.sqlitePath));
  if (options.applySchema) await store.applySchema();
  return store;
};
