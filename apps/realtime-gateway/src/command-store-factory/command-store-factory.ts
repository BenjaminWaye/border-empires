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
  const { WorkerBackedGatewayCommandStore } = await import("../sqlite-command-store-worker/worker-backed-command-store.js");
  const store = new WorkerBackedGatewayCommandStore({
    sqlitePath: options.sqlitePath,
    applySchema: options.applySchema ?? false,
    ...(options.onSqliteBusyRetry ? { onRetry: options.onSqliteBusyRetry } : {})
  });
  // Surface a schema-application failure at startup, same as the old
  // `await store.applySchema()` did, instead of only on first use.
  await store.waitUntilReady();
  return store;
};
