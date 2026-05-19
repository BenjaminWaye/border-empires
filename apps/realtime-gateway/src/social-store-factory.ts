import { InMemoryGatewaySocialStore, SqliteGatewaySocialStore, type GatewaySocialStore } from "./social-store.js";

type SocialStoreFactoryOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
};

export const createGatewaySocialStore = async (
  options: SocialStoreFactoryOptions = {}
): Promise<GatewaySocialStore> => {
  if (options.sqlitePath) {
    const { openSqliteDatabase } = await import("./sqlite-db.js");
    const store = new SqliteGatewaySocialStore(openSqliteDatabase(options.sqlitePath));
    if (options.applySchema) store.applySchema();
    return store;
  }
  return new InMemoryGatewaySocialStore();
};
