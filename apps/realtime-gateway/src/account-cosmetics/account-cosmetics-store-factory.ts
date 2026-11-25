import { InMemoryAccountCosmeticsStore, type AccountCosmeticsStore } from "./account-cosmetics-store.js";

export const createAccountCosmeticsStore = async (
  options: { sqlitePath?: string; applySchema?: boolean } = {}
): Promise<AccountCosmeticsStore> => {
  if (!options.sqlitePath) return new InMemoryAccountCosmeticsStore();
  const [{ SqliteAccountCosmeticsStore }, { openSqliteDatabase }] = await Promise.all([
    import("./sqlite-account-cosmetics-store.js"),
    import("../sqlite-db.js")
  ]);
  const store = new SqliteAccountCosmeticsStore(openSqliteDatabase(options.sqlitePath));
  if (options.applySchema) store.applySchema();
  return store;
};
