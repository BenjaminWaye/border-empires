import type { SimulationSnapshotStore } from "../snapshot-store/snapshot-store.js";
import { InMemorySimulationSnapshotStore } from "../snapshot-store/snapshot-store.js";
import type { SnapshotStringifier } from "../snapshot-stringifier/snapshot-stringifier.js";
import type { WorldgenBaselineResolver } from "../sqlite-snapshot-store/sqlite-snapshot-store.js";

type SnapshotStoreFactoryOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
  stringify?: SnapshotStringifier;
  resolveBaseline?: WorldgenBaselineResolver;
};

export const createSimulationSnapshotStore = async (
  options: SnapshotStoreFactoryOptions = {}
): Promise<SimulationSnapshotStore> => {
  if (!options.sqlitePath) return new InMemorySimulationSnapshotStore();
  const [{ SqliteSimulationSnapshotStore }, { openSqliteDatabase }] = await Promise.all([
    import("../sqlite-snapshot-store/sqlite-snapshot-store.js"),
    import("../sqlite-db.js")
  ]);
  const store = new SqliteSimulationSnapshotStore(openSqliteDatabase(options.sqlitePath), {
    ...(options.stringify ? { stringify: options.stringify } : {}),
    ...(options.resolveBaseline ? { resolveBaseline: options.resolveBaseline } : {})
  });
  if (options.applySchema) await store.applySchema();
  return store;
};
