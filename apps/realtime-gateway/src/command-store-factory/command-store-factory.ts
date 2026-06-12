import type { GatewayCommandStore } from "../command-store/command-store.js";
import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";

type CommandStoreFactoryOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
  /** Called on each SQLITE_BUSY retry. Wire to gateway_sqlite_retry_total. */
  onSqliteBusyRetry?: () => void;
};

export const createGatewayCommandStore = async (
  options: CommandStoreFactoryOptions = {}
): Promise<GatewayCommandStore> => {
  if (!options.sqlitePath) return new InMemoryGatewayCommandStore();
  const [{ SqliteGatewayCommandStore }, { openSqliteDatabase }] = await Promise.all([
    import("../sqlite-command-store/sqlite-command-store.js"),
    import("../sqlite-db.js")
  ]);
  const store = new SqliteGatewayCommandStore(openSqliteDatabase(options.sqlitePath), {
    ...(options.onSqliteBusyRetry ? { onRetry: options.onSqliteBusyRetry } : {})
  });
  if (options.applySchema) await store.applySchema();
  return store;
};
