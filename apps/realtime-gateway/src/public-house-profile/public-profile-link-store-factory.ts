import { InMemoryPublicProfileLinkStore, type PublicProfileLinkStore } from "./public-profile-link-store.js";

export const createPublicProfileLinkStore = async (
  options: { sqlitePath?: string; applySchema?: boolean } = {}
): Promise<PublicProfileLinkStore> => {
  if (!options.sqlitePath) return new InMemoryPublicProfileLinkStore();
  const [{ SqlitePublicProfileLinkStore }, { openSqliteDatabase }] = await Promise.all([
    import("./sqlite-public-profile-link-store.js"),
    import("../sqlite-db.js")
  ]);
  const store = new SqlitePublicProfileLinkStore(openSqliteDatabase(options.sqlitePath));
  if (options.applySchema) await store.applySchema();
  return store;
};
