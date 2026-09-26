import { InMemoryGalaxyDukeStore, type GalaxyDukeStore } from "../galaxy-duke-store/galaxy-duke-store.js";

type GalaxyDukeStoreFactoryOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
};

export const createGalaxyDukeStore = async (options: GalaxyDukeStoreFactoryOptions = {}): Promise<GalaxyDukeStore> => {
  if (!options.sqlitePath) return new InMemoryGalaxyDukeStore();
  const [{ SqliteGalaxyDukeStore }, { openSqliteDatabase }] = await Promise.all([
    import("../sqlite-galaxy-duke-store.js"),
    import("../sqlite-db.js")
  ]);
  const store = new SqliteGalaxyDukeStore(openSqliteDatabase(options.sqlitePath));
  if (options.applySchema) await store.applySchema();
  return store;
};
