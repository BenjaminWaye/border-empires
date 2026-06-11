import { InMemoryGatewayAuthBindingStore, type GatewayAuthBindingStore } from "./auth-binding-store/auth-binding-store.js";

type AuthBindingStoreFactoryOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
};

export const createGatewayAuthBindingStore = async (
  options: AuthBindingStoreFactoryOptions = {}
): Promise<GatewayAuthBindingStore> => {
  if (!options.sqlitePath) return new InMemoryGatewayAuthBindingStore();
  const [{ SqliteGatewayAuthBindingStore }, { openSqliteDatabase }] = await Promise.all([
    import("./sqlite-auth-binding-store.js"),
    import("./sqlite-db.js")
  ]);
  const store = new SqliteGatewayAuthBindingStore(openSqliteDatabase(options.sqlitePath));
  if (options.applySchema) await store.applySchema();
  return store;
};
