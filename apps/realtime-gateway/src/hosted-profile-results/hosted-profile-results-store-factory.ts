import { InMemoryHostedProfileResultsStore, type HostedProfileResultsStore } from "./hosted-profile-results-store.js";

export const createHostedProfileResultsStore = async (options: { sqlitePath?: string; applySchema?: boolean } = {}): Promise<HostedProfileResultsStore> => {
  if (!options.sqlitePath) return new InMemoryHostedProfileResultsStore();
  const [{ SqliteHostedProfileResultsStore }, { openSqliteDatabase }] = await Promise.all([
    import("./sqlite-hosted-profile-results-store.js"),
    import("../sqlite-db.js")
  ]);
  const store = new SqliteHostedProfileResultsStore(openSqliteDatabase(options.sqlitePath));
  if (options.applySchema) await store.applySchema();
  return store;
};
