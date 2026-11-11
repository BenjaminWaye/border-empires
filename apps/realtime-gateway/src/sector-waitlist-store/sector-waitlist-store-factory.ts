import { InMemorySectorWaitlistStore, type SectorWaitlistStore } from "./sector-waitlist-store.js";

type SectorWaitlistStoreFactoryOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
};

export const createSectorWaitlistStore = async (
  options: SectorWaitlistStoreFactoryOptions = {}
): Promise<SectorWaitlistStore> => {
  if (!options.sqlitePath) return new InMemorySectorWaitlistStore();
  const [{ SqliteSectorWaitlistStore }, { openSqliteDatabase }] = await Promise.all([
    import("./sqlite-sector-waitlist-store.js"),
    import("../sqlite-db.js")
  ]);
  const store = new SqliteSectorWaitlistStore(openSqliteDatabase(options.sqlitePath));
  if (options.applySchema) await store.applySchema();
  return store;
};
