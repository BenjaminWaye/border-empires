import { InMemoryGalaxyEndorsementStore, type GalaxyEndorsementStore } from "../galaxy-endorsement-store/galaxy-endorsement-store.js";

type GalaxyEndorsementStoreFactoryOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
};

export const createGalaxyEndorsementStore = async (
  options: GalaxyEndorsementStoreFactoryOptions = {}
): Promise<GalaxyEndorsementStore> => {
  if (!options.sqlitePath) return new InMemoryGalaxyEndorsementStore();
  const [{ SqliteGalaxyEndorsementStore }, { openSqliteDatabase }] = await Promise.all([
    import("../sqlite-galaxy-endorsement-store.js"),
    import("../sqlite-db.js")
  ]);
  const store = new SqliteGalaxyEndorsementStore(openSqliteDatabase(options.sqlitePath));
  if (options.applySchema) await store.applySchema();
  return store;
};
