import type { GatewayCommandStore } from "./command-store.js";
import { InMemoryGatewayCommandStore } from "./command-store.js";

type CommandStoreFactoryOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
};

export const createGatewayCommandStore = async (
  options: CommandStoreFactoryOptions = {}
): Promise<GatewayCommandStore> => {
  if (!options.sqlitePath) return new InMemoryGatewayCommandStore();
  const [{ SqliteGatewayCommandStore }, { openSqliteDatabase }] = await Promise.all([
    import("./sqlite-command-store.js"),
    import("./sqlite-db.js")
  ]);
  const store = new SqliteGatewayCommandStore(openSqliteDatabase(options.sqlitePath));
  if (options.applySchema) await store.applySchema();
  return store;
};
