import { InMemoryRallyLinkStore, type RallyLinkStore } from "./rally-link-store.js";

type RallyLinkStoreFactoryOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
};

export const createGatewayRallyLinkStore = async (
  options: RallyLinkStoreFactoryOptions = {}
): Promise<RallyLinkStore> => {
  if (!options.sqlitePath) return new InMemoryRallyLinkStore();
  const [{ SqliteRallyLinkStore }, { openSqliteDatabase }] = await Promise.all([
    import("./sqlite-rally-link-store.js"),
    import("./sqlite-db.js")
  ]);
  const store = new SqliteRallyLinkStore(openSqliteDatabase(options.sqlitePath));
  if (options.applySchema) await store.applySchema();
  return store;
};
