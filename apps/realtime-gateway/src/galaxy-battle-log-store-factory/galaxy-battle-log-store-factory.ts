import { InMemoryGalaxyBattleLogStore, type GalaxyBattleLogStore } from "../galaxy-battle-log-store/galaxy-battle-log-store.js";

type GalaxyBattleLogStoreFactoryOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
};

// Mirrors galaxy-economy-store-factory.ts / galaxy-senate-store-factory.ts exactly.
export const createGalaxyBattleLogStore = async (
  options: GalaxyBattleLogStoreFactoryOptions = {}
): Promise<GalaxyBattleLogStore> => {
  if (!options.sqlitePath) return new InMemoryGalaxyBattleLogStore();
  const [{ SqliteGalaxyBattleLogStore }, { openSqliteDatabase }] = await Promise.all([
    import("../sqlite-galaxy-battle-log-store.js"),
    import("../sqlite-db.js")
  ]);
  const store = new SqliteGalaxyBattleLogStore(openSqliteDatabase(options.sqlitePath));
  if (options.applySchema) await store.applySchema();
  return store;
};
