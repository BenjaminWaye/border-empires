import { InMemoryGatewayPlayerProfileStore, type GatewayPlayerProfileStore } from "./player-profile-store.js";

type PlayerProfileStoreFactoryOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
};

export const createGatewayPlayerProfileStore = async (
  options: PlayerProfileStoreFactoryOptions = {}
): Promise<GatewayPlayerProfileStore> => {
  if (!options.sqlitePath) return new InMemoryGatewayPlayerProfileStore();
  const [{ SqliteGatewayPlayerProfileStore }, { openSqliteDatabase }] = await Promise.all([
    import("./sqlite-player-profile-store.js"),
    import("./sqlite-db.js")
  ]);
  const store = new SqliteGatewayPlayerProfileStore(openSqliteDatabase(options.sqlitePath));
  if (options.applySchema) await store.applySchema();
  return store;
};
