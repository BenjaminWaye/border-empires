import { InMemoryPlayerGrowthBaselineStore, type PlayerGrowthBaselineStore } from "../player-growth-baseline-store/player-growth-baseline-store.js";

type PlayerGrowthBaselineStoreFactoryOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
};

export const createPlayerGrowthBaselineStore = async (
  options: PlayerGrowthBaselineStoreFactoryOptions = {}
): Promise<PlayerGrowthBaselineStore> => {
  if (!options.sqlitePath) return new InMemoryPlayerGrowthBaselineStore();
  const [{ SqlitePlayerGrowthBaselineStore }, { openSqliteDatabase }] = await Promise.all([
    import("../sqlite-player-growth-baseline-store.js"),
    import("../sqlite-db.js")
  ]);
  const store = new SqlitePlayerGrowthBaselineStore(openSqliteDatabase(options.sqlitePath));
  if (options.applySchema) await store.applySchema();
  return store;
};
