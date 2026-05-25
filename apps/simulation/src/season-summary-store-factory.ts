import { InMemorySeasonSummaryStore, type SeasonSummaryStore } from "./season-summary-store.js";

type SeasonSummaryStoreFactoryOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
};

export const createSeasonSummaryStore = async (
  options: SeasonSummaryStoreFactoryOptions = {}
): Promise<SeasonSummaryStore> => {
  if (!options.sqlitePath) return new InMemorySeasonSummaryStore();
  const [{ SqliteSeasonSummaryStore }, { openSqliteDatabase }] = await Promise.all([
    import("./sqlite-season-summary-store.js"),
    import("./sqlite-db.js")
  ]);
  const store = new SqliteSeasonSummaryStore(openSqliteDatabase(options.sqlitePath));
  if (options.applySchema) await store.applySchema();
  return store;
};
