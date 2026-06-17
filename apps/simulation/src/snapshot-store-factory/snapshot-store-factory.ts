import type { SimulationSnapshotStore } from "../snapshot-store/snapshot-store.js";
import { InMemorySimulationSnapshotStore } from "../snapshot-store/snapshot-store.js";
import type { SnapshotStringifier } from "../snapshot-stringifier/snapshot-stringifier.js";
import type { WorldgenBaselineResolver } from "../sqlite-snapshot-store/sqlite-snapshot-store.js";
import type { SqliteWriterChannel } from "../sqlite-writer-channel/sqlite-writer-channel.js";

type SnapshotStoreFactoryOptions = {
  sqlitePath?: string;
  applySchema?: boolean;
  stringify?: SnapshotStringifier;
  resolveBaseline?: WorldgenBaselineResolver;
  onPruneFailure?: (error: unknown) => void;
  writerChannel?: SqliteWriterChannel;
};

export const createSimulationSnapshotStore = async (
  options: SnapshotStoreFactoryOptions = {}
): Promise<SimulationSnapshotStore> => {
  if (!options.sqlitePath) return new InMemorySimulationSnapshotStore();
  const [{ SqliteSimulationSnapshotStore }, { openSqliteDatabase }] = await Promise.all([
    import("../sqlite-snapshot-store/sqlite-snapshot-store.js"),
    import("../sqlite-db.js")
  ]);
  // onPruneFailure belongs on the reader when it owns writes (no writerChannel),
  // and on WriterBackedSnapshotStore when the worker owns writes. Either way,
  // only one DB connection is opened.
  const reader = new SqliteSimulationSnapshotStore(openSqliteDatabase(options.sqlitePath), {
    ...(options.stringify ? { stringify: options.stringify } : {}),
    ...(options.resolveBaseline ? { resolveBaseline: options.resolveBaseline } : {}),
    ...(!options.writerChannel && options.onPruneFailure ? { onPruneFailure: options.onPruneFailure } : {})
  });
  if (options.applySchema) await reader.applySchema();
  if (options.writerChannel) {
    const { WriterBackedSnapshotStore } = await import("../sqlite-writer-channel/sqlite-writer-channel.js");
    return new WriterBackedSnapshotStore(options.writerChannel, reader, options.onPruneFailure);
  }
  return reader;
};
