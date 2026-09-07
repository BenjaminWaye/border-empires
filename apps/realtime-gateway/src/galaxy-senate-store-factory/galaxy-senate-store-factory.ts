import { InMemoryGalaxySenateStore, type GalaxySenateStore } from "../galaxy-senate-store/galaxy-senate-store.js";

type GalaxySenateStoreFactoryOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
};

// Mirrors galaxy-economy-store-factory.ts exactly.
export const createGalaxySenateStore = async (
  options: GalaxySenateStoreFactoryOptions = {}
): Promise<GalaxySenateStore> => {
  if (!options.sqlitePath) return new InMemoryGalaxySenateStore();
  const [{ SqliteGalaxySenateStore }, { openSqliteDatabase }] = await Promise.all([
    import("../sqlite-galaxy-senate-store.js"),
    import("../sqlite-db.js")
  ]);
  const store = new SqliteGalaxySenateStore(openSqliteDatabase(options.sqlitePath));
  if (options.applySchema) await store.applySchema();
  return store;
};
