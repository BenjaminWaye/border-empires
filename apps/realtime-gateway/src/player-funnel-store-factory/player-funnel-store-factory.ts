import { InMemoryPlayerFunnelStore, type PlayerFunnelStore } from "../player-funnel-store/player-funnel-store.js";

type PlayerFunnelStoreFactoryOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
};

export const createPlayerFunnelStore = async (options: PlayerFunnelStoreFactoryOptions = {}): Promise<PlayerFunnelStore> => {
  if (!options.sqlitePath) return new InMemoryPlayerFunnelStore();
  const [{ SqlitePlayerFunnelStore }, { openSqliteDatabase }] = await Promise.all([
    import("../player-funnel-store/sqlite-player-funnel-store.js"),
    import("../sqlite-db.js")
  ]);
  const store = new SqlitePlayerFunnelStore(openSqliteDatabase(options.sqlitePath));
  if (options.applySchema) await store.applySchema();
  return store;
};
